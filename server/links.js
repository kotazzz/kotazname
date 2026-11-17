import { readdirSync } from 'node:fs'
import { cleanLine, looksLikeBot } from './util.js'

const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/
const MAX_URL = 2048

/** Адреса, которые уже заняты сайтом. Слаг из этого списка создать нельзя. */
const RESERVED = [
  'qr', 'admin', 'api', 'assets', 'music', 'audio', 'covers', 'cover', 'files', 'file', 'static', 'public',
  'login', 'logout', 'signin', 'signup', 'robots', 'sitemap', 'favicon', 'index', 'health', 'healthz',
  'status', 'stats', 'pow', 'hit', 'messages', 'message', 'about', 'links', 'link', 'session', 'setup',
  'passkey', 'passkeys', 'icons', 'manifest', 'sw', 'privacy', 'terms', 'contact', 'ru', 'en',
]

const SEED = [
  ['tg', 'https://t.me/kot_az', 'Telegram'],
  ['channel', 'https://t.me/kotazb', 'Telegram-канал'],
  ['vk', 'https://vk.ru/kotazz', 'VK'],
  ['tt', 'https://www.tiktok.com/@kot_az', 'TikTok'],
  ['x', 'https://x.com/ko_tazzz', 'X'],
  ['bsky', 'https://bsky.app/profile/kotaz.bsky.social', 'Bluesky'],
  ['reddit', 'https://www.reddit.com/user/kota_z', 'Reddit'],
  ['steam', 'https://steamcommunity.com/profiles/76561198968143951', 'Steam'],
  ['twitch', 'https://www.twitch.tv/semkotaz', 'Twitch'],
  ['yt', 'https://www.youtube.com/channel/UCRpFfxYb-KeO0n8GZC9VztQ', 'YouTube'],
  ['spotify', 'https://open.spotify.com/user/31m4ycoluoyqm3um6l2k4xrep37i', 'Spotify'],
  ['gh', 'https://github.com/kotazzz', 'GitHub'],
]

export function createLinks(ctx) {
  const { config, db } = ctx
  const reserved = new Set(RESERVED)
  try {
    for (const entry of readdirSync(config.distDir)) reserved.add(entry.toLowerCase())
  } catch {
    // dist ещё не собран (режим разработки) — достаточно статического списка.
  }
  const siteHosts = new Set([...config.origins, ...config.adminOrigins].map((origin) => new URL(origin).host))

  function validate({ slug, url, title }) {
    const normalized = typeof slug === 'string' ? slug.trim().toLowerCase().replace(/^\/+/, '') : ''
    if (!SLUG.test(normalized)) return { error: 'bad_slug' }
    if (reserved.has(normalized)) return { error: 'reserved_slug' }

    let target
    try {
      target = new URL(typeof url === 'string' ? url.trim() : '')
    } catch {
      return { error: 'bad_url' }
    }
    if (!['http:', 'https:'].includes(target.protocol) || target.href.length > MAX_URL) return { error: 'bad_url' }
    if (target.username || target.password) return { error: 'bad_url' }
    if (siteHosts.has(target.host) && target.pathname.replace(/^\/+|\/+$/g, '').toLowerCase() === normalized) {
      return { error: 'redirect_loop' }
    }
    const cleanTitle = cleanLine(typeof title === 'string' ? title : '').slice(0, 60)
    return { slug: normalized, url: target.href, title: cleanTitle }
  }

  function seed() {
    const done = db.prepare("SELECT 1 FROM settings WHERE key = 'links_seeded'").get()
    if (done) return
    const now = Date.now()
    const insert = db.prepare('INSERT OR IGNORE INTO links (slug, url, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    SEED.forEach(([slug, url, title], index) => insert.run(slug, url, title, now + index, now + index))
    db.prepare("INSERT INTO settings (key, value) VALUES ('links_seeded', '1')").run()
  }

  return { validate, seed, isReserved: (slug) => reserved.has(slug) }
}

const toLink = (row) => ({
  slug: row.slug,
  url: row.url,
  title: row.title,
  clicks: row.clicks,
  createdAt: row.created_at,
  lastClickAt: row.last_click_at,
})

export async function adminLinkRoutes(app, ctx) {
  const { db, links } = ctx
  const conflict = (error) => error?.code === 'ERR_SQLITE_ERROR' && /UNIQUE|PRIMARY/i.test(error.message)

  app.get('/links', async () => ({
    items: db.prepare('SELECT * FROM links ORDER BY created_at, slug').all().map(toLink),
  }))

  app.post('/links', async (req, reply) => {
    const checked = links.validate(req.body ?? {})
    if (checked.error) return reply.code(400).send({ error: checked.error })
    const now = Date.now()
    try {
      db.prepare('INSERT INTO links (slug, url, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        checked.slug,
        checked.url,
        checked.title,
        now,
        now,
      )
    } catch (error) {
      if (conflict(error)) return reply.code(409).send({ error: 'slug_taken' })
      throw error
    }
    return reply.code(201).send(toLink(db.prepare('SELECT * FROM links WHERE slug = ?').get(checked.slug)))
  })

  app.put('/links/:slug', async (req, reply) => {
    const checked = links.validate({ slug: req.body?.slug ?? req.params.slug, url: req.body?.url, title: req.body?.title })
    if (checked.error) return reply.code(400).send({ error: checked.error })
    try {
      const result = db
        .prepare('UPDATE links SET slug = ?, url = ?, title = ?, updated_at = ? WHERE slug = ?')
        .run(checked.slug, checked.url, checked.title, Date.now(), req.params.slug.toLowerCase())
      if (!result.changes) return reply.code(404).send({ error: 'not_found' })
    } catch (error) {
      if (conflict(error)) return reply.code(409).send({ error: 'slug_taken' })
      throw error
    }
    return toLink(db.prepare('SELECT * FROM links WHERE slug = ?').get(checked.slug))
  })

  app.post('/links/:slug/reset', async (req, reply) => {
    const result = db.prepare('UPDATE links SET clicks = 0, last_click_at = NULL WHERE slug = ?').run(req.params.slug.toLowerCase())
    return result.changes ? { ok: true } : reply.code(404).send({ error: 'not_found' })
  })

  app.delete('/links/:slug', async (req, reply) => {
    const result = db.prepare('DELETE FROM links WHERE slug = ?').run(req.params.slug.toLowerCase())
    return result.changes ? { ok: true } : reply.code(404).send({ error: 'not_found' })
  })
}

/** Публичный редирект: kotaz.name/<slug>. Возвращает true, если слаг найден. */
export function redirectLink(ctx, req, reply, slug) {
  const { db } = ctx
  const row = db.prepare('SELECT url FROM links WHERE slug = ?').get(slug)
  if (!row) return false
  if (req.method === 'GET' && !looksLikeBot(req.headers['user-agent'])) {
    db.prepare('UPDATE links SET clicks = clicks + 1, last_click_at = ? WHERE slug = ?').run(Date.now(), slug)
  }
  reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').redirect(row.url, 302)
  return true
}
