import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from '../server/index.js'

/** Полный прогон сервера в памяти: БД sqlite :memory:, временные каталоги. */

let app
let ctx
let db
let dir

const ORIGIN = 'https://kotaz.name'

function solvePow(challenge, bits) {
  let n = 0
  for (;;) {
    const nonce = (n++).toString(36)
    const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest()
    let count = 0
    for (const byte of digest) {
      if (byte === 0) {
        count += 8
        continue
      }
      count += Math.clz32(byte) - 24
      break
    }
    if (count >= bits) return `${challenge}:${nonce}`
  }
}

async function powHeader() {
  const res = await app.inject({ url: '/api/pub/pow' })
  const { challenge, bits } = res.json()
  return solvePow(challenge, bits)
}

function adminCookie() {
  // Создаём сессию напрямую в БД — WebAuthn в тестах не нужен.
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(`session:${token}`).digest('hex')
  const now = Date.now()
  db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at, last_seen, user_agent) VALUES (?, ?, ?, ?, ?)').run(
    hash,
    now,
    now + 86400000,
    now,
    'test',
  )
  return `kz_admin=${token}`
}

function multipart(fields, file) {
  const boundary = '----kztest'
  const chunks = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
  }
  if (file) {
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`)
  }
  const head = Buffer.from(chunks.join(''))
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return { payload: Buffer.concat(file ? [head, file.data, tail] : [head, tail]), contentType: `multipart/form-data; boundary=${boundary}` }
}

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'kz-test-'))
  const musicDir = path.join(dir, 'music')
  mkdirSync(path.join(musicDir, 'audio'), { recursive: true })
  mkdirSync(path.join(musicDir, 'covers'), { recursive: true })
  writeFileSync(path.join(musicDir, 'tracks.json'), JSON.stringify([{ id: 7, title: 'T', artist: 'A', duration: 10, cover: false, size: 3 }]))
  writeFileSync(path.join(musicDir, 'audio', '7.m4a'), Buffer.from([1, 2, 3]))
  ;({ app, ctx, db } = await build({
    dataDir: path.join(dir, 'data'),
    uploadsDir: path.join(dir, 'uploads'),
    musicDir,
    logger: false,
  }))
})

after(async () => {
  await app.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('health и about', async () => {
  const health = await app.inject({ url: '/api/health' })
  assert.equal(health.statusCode, 200)
  const about = await app.inject({ url: '/api/pub/about' })
  const body = about.json()
  assert.match(body.ru, /\{\{age\}\}/)
  assert.equal(body.birthdate, '2005-12-12')
})

test('музыка: random и audio', async () => {
  const random = await app.inject({ url: '/api/pub/music/random' })
  assert.equal(random.statusCode, 200)
  assert.equal(random.json().track.id, 7)
  const audio = await app.inject({ url: '/api/pub/music/7/audio' })
  assert.equal(audio.statusCode, 200)
  assert.deepEqual([...audio.rawPayload], [1, 2, 3])
})

test('счётчик посетителей: hit только со своего origin, без дублей за день', async () => {
  const bad = await app.inject({ method: 'POST', url: '/api/pub/hit', headers: { origin: 'https://evil.example' } })
  assert.equal(bad.statusCode, 403)
  const first = await app.inject({ method: 'POST', url: '/api/pub/hit', headers: { origin: ORIGIN, 'user-agent': 'Mozilla/5.0 test' } })
  assert.equal(first.json().day, 1)
  const second = await app.inject({ method: 'POST', url: '/api/pub/hit', headers: { origin: ORIGIN, 'user-agent': 'Mozilla/5.0 test' } })
  assert.equal(second.json().day, 1, 'повторный заход в тот же день не увеличивает счётчик')
  const bot = await app.inject({ method: 'POST', url: '/api/pub/hit', headers: { origin: ORIGIN, 'user-agent': 'Googlebot/2.1' } })
  assert.equal(bot.json().day, 1, 'боты не считаются')
})

test('публичное сообщение: PoW, лимиты, honeypot', async () => {
  const noPow = await app.inject({
    method: 'POST',
    url: '/api/pub/messages',
    headers: { origin: ORIGIN, 'content-type': 'multipart/form-data; boundary=x' },
    payload: '--x--',
  })
  assert.equal(noPow.statusCode, 403)

  const pow = await powHeader()
  const { payload, contentType } = multipart({ name: '  <b>Имя</b>  ', text: 'привет\n\n\n\n\n\nмир', website: '' })
  const ok = await app.inject({
    method: 'POST',
    url: '/api/pub/messages',
    headers: { origin: ORIGIN, 'content-type': contentType, 'x-pow': pow },
    payload,
  })
  assert.equal(ok.statusCode, 201)

  // тот же челлендж повторно не принимается
  const replay = await app.inject({
    method: 'POST',
    url: '/api/pub/messages',
    headers: { origin: ORIGIN, 'content-type': contentType, 'x-pow': pow },
    payload,
  })
  assert.equal(replay.statusCode, 403)

  // honeypot: бот заполнил скрытое поле — принимаем молча, но не сохраняем
  const pow2 = await powHeader()
  const honey = multipart({ text: 'спам', website: 'http://spam' })
  const fake = await app.inject({
    method: 'POST',
    url: '/api/pub/messages',
    headers: { origin: ORIGIN, 'content-type': honey.contentType, 'x-pow': pow2 },
    payload: honey.payload,
  })
  assert.equal(fake.statusCode, 201)

  const cookie = adminCookie()
  const list = await app.inject({ url: '/api/admin/messages', headers: { cookie } })
  const body = list.json()
  assert.equal(body.total, 1, 'honeypot не сохранился')
  assert.equal(body.items[0].name, '<b>Имя</b>', 'имя хранится как текст, не html')
  assert.equal(body.items[0].text, 'привет\n\n\nмир')
})

test('сообщение с файлом: скачивание из админки', async () => {
  const pow = await powHeader()
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    randomBytes(64),
  ])
  const { payload, contentType } = multipart({ text: 'с картинкой' }, { name: '../evil/../../pic.png', data: png })
  const created = await app.inject({
    method: 'POST',
    url: '/api/pub/messages',
    headers: { origin: ORIGIN, 'content-type': contentType, 'x-pow': pow },
    payload,
  })
  assert.equal(created.statusCode, 201)

  const cookie = adminCookie()
  const list = await app.inject({ url: '/api/admin/messages', headers: { cookie } })
  const message = list.json().items[0]
  assert.equal(message.file.name, 'pic.png', 'путь из имени файла обрезан')
  assert.equal(message.file.image, 'image/png')

  const download = await app.inject({ url: `/api/admin/messages/${message.id}/file`, headers: { cookie } })
  assert.equal(download.statusCode, 200)
  assert.equal(download.rawPayload.length, png.length)
  const inline = await app.inject({ url: `/api/admin/messages/${message.id}/file?inline=1`, headers: { cookie } })
  assert.equal(inline.headers['content-type'], 'image/png')
  assert.match(inline.headers['content-security-policy'], /sandbox/)
})

test('админка без сессии закрыта', async () => {
  const res = await app.inject({ url: '/api/admin/messages' })
  assert.equal(res.statusCode, 401)
})

test('короткие ссылки: создание, редирект, счётчик, резерв', async () => {
  const cookie = adminCookie()
  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/links',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ slug: 'TestLink', url: 'https://example.com/page?a=1&b=2', title: 'Тест' }),
  })
  assert.equal(created.statusCode, 201)
  assert.equal(created.json().slug, 'testlink')

  const reserved = await app.inject({
    method: 'POST',
    url: '/api/admin/links',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ slug: 'qr', url: 'https://example.com' }),
  })
  assert.equal(reserved.statusCode, 400)
  assert.equal(reserved.json().error, 'reserved_slug')

  const loop = await app.inject({
    method: 'POST',
    url: '/api/admin/links',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ slug: 'me', url: 'https://kotaz.name/me' }),
  })
  assert.equal(loop.json().error, 'redirect_loop')

  const redirect = await app.inject({ url: '/testlink', headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' } })
  assert.equal(redirect.statusCode, 302)
  assert.equal(redirect.headers.location, 'https://example.com/page?a=1&b=2')

  const botHit = await app.inject({ url: '/testlink', headers: { accept: 'text/html', 'user-agent': 'curl/8.0' } })
  assert.equal(botHit.statusCode, 302)

  const list = await app.inject({ url: '/api/admin/links', headers: { cookie } })
  const link = list.json().items.find((item) => item.slug === 'testlink')
  assert.equal(link.clicks, 1, 'бот (curl) не увеличил счётчик')

  const reset = await app.inject({ method: 'POST', url: '/api/admin/links/testlink/reset', headers: { cookie, origin: ORIGIN } })
  assert.equal(reset.statusCode, 200)
})

test('неизвестный api-маршрут — 404 json, страница — SPA', async () => {
  const api404 = await app.inject({ url: '/api/nope' })
  assert.equal(api404.statusCode, 404)
  assert.deepEqual(api404.json(), { error: 'not_found' })
})

test('about: сохранение из админки с валидацией', async () => {  const cookie = adminCookie()
  const saved = await app.inject({
    method: 'PUT',
    url: '/api/admin/about',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ ru: 'Текст {{age}}', en: 'Text {{age}}', birthdate: '2005-12-12' }),
  })
  assert.equal(saved.statusCode, 200)
  const bad = await app.inject({
    method: 'PUT',
    url: '/api/admin/about',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ ru: '', en: '', birthdate: 'год' }),
  })
  assert.equal(bad.json().error, 'bad_birthdate')
  const pub = await app.inject({ url: '/api/pub/about' })
  assert.equal(pub.json().ru, 'Текст {{age}}')
})

test('проекты: публичный список и CRUD из админки', async () => {
  const pub = await app.inject({ url: '/api/pub/projects' })
  assert.equal(pub.statusCode, 200)
  const items = pub.json().items
  assert.equal(items.length, 18, 'посеяно 18 проектов')
  for (let i = 1; i < items.length; i += 1) {
    assert.ok(items[i - 1].year >= items[i].year, 'сортировка по годам: новые сверху')
  }

  const cookie = adminCookie()
  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/projects',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ year: 2027, name: 'testproj', icon: 'Waves', href: 'https://example.com', descRu: 'ру', descEn: 'en' }),
  })
  assert.equal(created.statusCode, 201)
  const id = created.json().id

  const afterCreate = await app.inject({ url: '/api/pub/projects' })
  assert.equal(afterCreate.json().items[0].year, 2027, 'новый проект 2027 года первый в списке')

  const badIcon = await app.inject({
    method: 'POST',
    url: '/api/admin/projects',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ year: 2027, name: 'x', icon: '"><script>', href: 'https://example.com' }),
  })
  assert.equal(badIcon.json().error, 'bad_icon')

  const updated = await app.inject({
    method: 'PUT',
    url: `/api/admin/projects/${id}`,
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ year: 2026, name: 'testproj2', icon: 'Bot', href: 'https://example.com/2', descRu: 'ру2', descEn: 'en2' }),
  })
  assert.equal(updated.json().name, 'testproj2')

  const removed = await app.inject({ method: 'DELETE', url: `/api/admin/projects/${id}`, headers: { cookie, origin: ORIGIN } })
  assert.equal(removed.statusCode, 200)
})
