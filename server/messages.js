import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ipHash, originGuard } from './security.js'
import { attachmentHeader, charLength, cleanBlock, cleanFileName, cleanLine, sniffImage } from './util.js'

const DAY_MS = 24 * 60 * 60 * 1000
const EXTRA_BODY_BYTES = 256 * 1024
const MAX_CONCURRENT_UPLOADS = 4
const ANON = 'Аноним'

class HttpError extends Error {
  constructor(status, code) {
    super(code)
    this.statusCode = status
    this.code = code
  }
}

export function uploadPath(config, fileId) {
  // fileId всегда генерируем мы сами (hex), но проверяем на всякий случай.
  if (!/^[a-f0-9]{48}$/.test(fileId)) throw new Error('bad file id')
  return path.join(config.uploadsDir, fileId)
}

export async function removeUpload(config, fileId) {
  try {
    await unlink(uploadPath(config, fileId))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

/** Публичная часть: челлендж и отправка сообщения. */
export async function publicMessageRoutes(app, ctx) {
  const { config, db, pow } = ctx
  const { limits } = config
  const checkOrigin = originGuard(config.origins)
  let inFlight = 0

  app.get('/pow', { config: { rateLimit: { max: 40, timeWindow: '10 minutes' } } }, async () => pow.issue())

  const usedLastDay = db.prepare('SELECT COALESCE(SUM(file_size), 0) AS bytes FROM messages WHERE file_id IS NOT NULL AND created_at > ?')
  const usedTotal = db.prepare('SELECT COALESCE(SUM(file_size), 0) AS bytes FROM messages WHERE file_id IS NOT NULL')
  const countSince = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?')
  const countIpSince = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE ip_hash = ? AND created_at > ?')
  const insert = db.prepare(
    `INSERT INTO messages (name, text, created_at, ip_hash, file_id, file_name, file_size, file_kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  app.post(
    '/messages',
    {
      config: { rateLimit: { max: 6, timeWindow: '10 minutes' } },
      preValidation: async (req, reply) => {
        const denied = await checkOrigin(req, reply)
        if (denied) return denied
        if (!req.isMultipart()) return reply.code(415).send({ error: 'multipart_required' })
        const declared = Number(req.headers['content-length'])
        if (Number.isFinite(declared) && declared > limits.fileBytes + EXTRA_BODY_BYTES) {
          return reply.code(413).send({ error: 'file_too_large' })
        }
        if (!pow.verify(req.headers['x-pow'])) return reply.code(403).send({ error: 'pow_failed' })
        return undefined
      },
    },
    async (req, reply) => {
      const now = Date.now()
      const hash = ipHash(ctx, req)

      if (countIpSince.get(hash, now - DAY_MS).n >= limits.messagesPerDayPerIp) throw new HttpError(429, 'too_many_messages')
      if (countSince.get(now - DAY_MS).n >= limits.messagesPerDayTotal) throw new HttpError(429, 'inbox_full')
      if (inFlight >= MAX_CONCURRENT_UPLOADS) throw new HttpError(503, 'busy')

      inFlight += 1
      let stored = null
      try {
        const fields = {}
        const parts = req.parts({
          limits: { fileSize: limits.fileBytes, files: 1, fields: 6, fieldSize: 24_000, parts: 8, headerPairs: 60, fieldNameSize: 40 },
        })

        for await (const part of parts) {
          if (part.type === 'file') {
            // Принимаем один файл в поле file; всё остальное выбрасываем.
            if (part.fieldname !== 'file' || stored || !part.filename) {
              part.file.resume()
              continue
            }
            stored = await saveUpload(config, part)
            continue
          }
          if (part.valueTruncated) throw new HttpError(413, 'field_too_large')
          if (['name', 'text', 'website'].includes(part.fieldname)) fields[part.fieldname] = part.value
        }

        // Ловушка для ботов: поле скрыто от людей. Делаем вид, что всё принято.
        if (typeof fields.website === 'string' && fields.website.trim() !== '') {
          if (stored) await removeUpload(config, stored.id)
          return reply.code(201).send({ ok: true })
        }

        const name = cleanLine(fields.name ?? '') || ANON
        const text = cleanBlock(fields.text ?? '')
        if (charLength(name) > limits.nameChars) throw new HttpError(400, 'name_too_long')
        if (!text) throw new HttpError(400, 'text_required')
        if (charLength(text) > limits.messageChars) throw new HttpError(400, 'text_too_long')

        if (stored) {
          if (stored.size === 0) {
            await removeUpload(config, stored.id)
            stored = null
          } else if (
            usedLastDay.get(now - DAY_MS).bytes > limits.uploadsPerDayBytes ||
            usedTotal.get().bytes > limits.uploadsTotalBytes
          ) {
            throw new HttpError(507, 'storage_full')
          }
        }

        insert.run(
          name,
          text,
          now,
          hash,
          stored?.id ?? null,
          stored?.name ?? null,
          stored?.size ?? null,
          stored?.kind ?? null,
        )
        stored = null // записано в БД — чистить уже не нужно
        return reply.code(201).send({ ok: true })
      } catch (error) {
        if (stored) await removeUpload(config, stored.id).catch(() => {})
        throw error
      } finally {
        inFlight -= 1
      }
    },
  )
}

async function saveUpload(config, part) {
  const id = randomBytes(24).toString('hex')
  const target = uploadPath(config, id)
  let size = 0
  let head = Buffer.alloc(0)
  const tap = new Transform({
    transform(chunk, _encoding, done) {
      if (head.length < 16) head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)])
      size += chunk.length
      done(null, chunk)
    },
  })
  try {
    await pipeline(part.file, tap, createWriteStream(target, { flags: 'wx', mode: 0o600 }))
    if (part.file.truncated) throw new HttpError(413, 'file_too_large')
  } catch (error) {
    await unlink(target).catch(() => {})
    if (error.statusCode) throw error
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') throw new HttpError(413, 'file_too_large')
    throw error
  }
  return { id, size, name: cleanFileName(part.filename), kind: sniffImage(head) }
}

const toMessage = (row) => ({
  id: row.id,
  name: row.name,
  text: row.text,
  createdAt: row.created_at,
  read: Boolean(row.is_read),
  file: row.file_id ? { name: row.file_name, size: row.file_size, image: row.file_kind } : null,
})

/** Закрытая часть: чтение входящих. Подключается внутри guard админа. */
export async function adminMessageRoutes(app, ctx) {
  const { config, db } = ctx

  app.get('/messages', async (req) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 100)
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)
    const unreadOnly = req.query.unread === '1'
    const where = unreadOnly ? 'WHERE is_read = 0' : ''
    const items = db
      .prepare(`SELECT * FROM messages ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(limit, offset)
      .map(toMessage)
    const total = db.prepare(`SELECT COUNT(*) AS n FROM messages ${where}`).get().n
    const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0').get().n
    return { items, total, unread }
  })

  app.patch('/messages/:id', async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || typeof req.body?.read !== 'boolean') return reply.code(400).send({ error: 'bad_request' })
    const result = db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(req.body.read ? 1 : 0, id)
    return result.changes ? { ok: true } : reply.code(404).send({ error: 'not_found' })
  })

  app.post('/messages/read-all', async () => {
    const result = db.prepare('UPDATE messages SET is_read = 1 WHERE is_read = 0').run()
    return { ok: true, changed: Number(result.changes) }
  })

  app.delete('/messages/:id', async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id)) return reply.code(400).send({ error: 'bad_request' })
    const row = db.prepare('SELECT file_id FROM messages WHERE id = ?').get(id)
    if (!row) return reply.code(404).send({ error: 'not_found' })
    db.prepare('DELETE FROM messages WHERE id = ?').run(id)
    if (row.file_id) await removeUpload(config, row.file_id)
    return { ok: true }
  })

  app.get('/messages/:id/file', async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id)) return reply.code(400).send({ error: 'bad_request' })
    const row = db.prepare('SELECT file_id, file_name, file_size, file_kind FROM messages WHERE id = ?').get(id)
    if (!row?.file_id) return reply.code(404).send({ error: 'not_found' })

    const file = uploadPath(config, row.file_id)
    const info = await stat(file).catch(() => null)
    if (!info) return reply.code(404).send({ error: 'file_missing' })

    // Файлы чужие и недоверенные: всегда как вложение, без угадывания типа и в песочнице.
    // Исключение — картинки png/jpeg/gif/webp, опознанные по сигнатуре при загрузке.
    const inline = req.query.inline === '1' && row.file_kind
    reply
      .header('Content-Type', inline ? row.file_kind : 'application/octet-stream')
      .header('Content-Disposition', inline ? 'inline' : attachmentHeader(row.file_name || 'file'))
      .header('Content-Length', info.size)
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox")
      .header('Cache-Control', 'private, no-store')
    return reply.send(createReadStream(file))
  })
}
