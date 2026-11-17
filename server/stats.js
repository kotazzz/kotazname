import { originGuard, visitorHash } from './security.js'
import { dayKey, looksLikeBot } from './util.js'

/**
 * Счётчик посетителей без cookie и без хранения IP.
 * Посетитель = HMAC(секрет, IP + User-Agent). За день, за месяц и за всё время считаются
 * уникальные посетители; повторные заходы в тот же день не увеличивают число.
 */
export function createStats(ctx) {
  const { config, db } = ctx
  const insertVisit = db.prepare('INSERT OR IGNORE INTO visits (day, visitor) VALUES (?, ?)')
  const insertVisitor = db.prepare('INSERT OR IGNORE INTO visitors (hash, first_day) VALUES (?, ?)')
  const today = db.prepare('SELECT COUNT(*) AS n FROM visits WHERE day = ?')
  const month = db.prepare('SELECT COUNT(DISTINCT visitor) AS n FROM visits WHERE day >= ? AND day <= ?')
  const total = db.prepare('SELECT COUNT(*) AS n FROM visitors')

  let cache = null

  function snapshot(now = new Date()) {
    const day = dayKey(now, config.timezone)
    if (cache && cache.day === day && cache.at > Date.now() - 15_000) return cache.value
    const first = `${day.slice(0, 7)}-01`
    const value = {
      day: today.get(day).n,
      month: month.get(first, `${day.slice(0, 7)}-31`).n,
      total: total.get().n,
    }
    cache = { day, at: Date.now(), value }
    return value
  }

  function record(req) {
    if (looksLikeBot(req.headers['user-agent'])) return false
    const day = dayKey(new Date(), config.timezone)
    const visitor = visitorHash(ctx, req)
    insertVisit.run(day, visitor)
    insertVisitor.run(visitor, day)
    cache = null
    return true
  }

  return { snapshot, record }
}

export async function statsRoutes(app, ctx) {
  const { stats, config } = ctx
  const checkOrigin = originGuard(config.origins)

  app.get('/stats', async () => stats.snapshot())

  app.post('/hit', { preHandler: checkOrigin, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    stats.record(req)
    return stats.snapshot()
  })
}
