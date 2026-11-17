import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Управляющие символы и «невидимые» символы, которыми подделывают текст (bidi, BOM, нулевой пробел).
// ZWJ/ZWNJ оставляем: на них держатся эмодзи и часть алфавитов.
const INVISIBLE = /[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu
const INVISIBLE_KEEP_NEWLINES = /(?![\n\t])[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu

export const charLength = (text) => Array.from(text).length

/** Однострочный текст: имя, заголовок. */
export function cleanLine(value) {
  if (typeof value !== 'string') return ''
  return value.normalize('NFC').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim()
}

/** Многострочный текст: сообщение. */
export function cleanBlock(value) {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE_KEEP_NEWLINES, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacHex(secret, ...parts) {
  return createHmac('sha256', secret).update(parts.join('\0')).digest('hex')
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function safeEqual(a, b) {
  const left = createHash('sha256').update(String(a)).digest()
  const right = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(left, right)
}

/** Секрет приложения: из окружения или из файла data/secret.key (создаётся один раз). */
export function loadSecret(config) {
  if (config.appSecret) return config.appSecret
  const file = path.join(config.dataDir, 'secret.key')
  mkdirSync(config.dataDir, { recursive: true })
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const secret = randomBytes(48).toString('hex')
  writeFileSync(file, secret, { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // Windows: права не поддерживаются.
  }
  return secret
}

/** Дата YYYY-MM-DD в заданном часовом поясе. */
export function dayKey(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return parts
}

export function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text)
}

const BOT = /bot|crawl|spider|slurp|preview|fetch|scan|monitor|curl|wget|python|httpclient|headless|lighthouse|facebookexternalhit|embedly|telegram|discord|whatsapp|skype|vkshare|okhttp|go-http|java\//i

export const looksLikeBot = (userAgent) => !userAgent || BOT.test(userAgent)

/** Определяет безопасные для показа картинки по первым байтам, а не по заявленному типу. */
export function sniffImage(head) {
  if (head.length < 12) return null
  if (head[0] === 0x89 && head.toString('latin1', 1, 4) === 'PNG') return 'image/png'
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.toString('latin1', 0, 4) === 'GIF8') return 'image/gif'
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Имя файла от пользователя: только для показа и скачивания, на диске файл называется иначе. */
export function cleanFileName(name) {
  let base = typeof name === 'string' ? name.normalize('NFC') : ''
  base = base.split(/[\\/]/).pop() || ''
  base = base.replace(INVISIBLE, '').replace(/[<>:"|?*]/g, '_').trim()
  if (base.startsWith('.')) base = `_${base.slice(1)}`
  if (Array.from(base).length > 120) {
    const ext = path.extname(base).slice(0, 12)
    base = Array.from(base.slice(0, base.length - ext.length)).slice(0, 120 - ext.length).join('') + ext
  }
  return base || 'file'
}

export function attachmentHeader(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}
