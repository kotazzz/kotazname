const STEAM_TTL_MS = 45_000
const GITHUB_TTL_MS = 30 * 60_000
const GITHUB_STALE_MS = 7 * 24 * 60 * 60_000
const TIMEOUT_MS = 8_000
const USER_AGENT = 'kotazname-site/1.0 (+https://kotaz.name)'

/** Кэш с защитой от одновременных запросов и выдачей устаревших данных при сбое источника. */
function cached({ ttl, stale = ttl * 10, load }) {
  let entry = null
  let pending = null
  return async function get() {
    const now = Date.now()
    if (entry && now - entry.at < ttl) return entry.value
    pending ??= load()
      .then((value) => {
        entry = { at: Date.now(), value }
        return value
      })
      .finally(() => {
        pending = null
      })
    try {
      return await pending
    } catch (error) {
      if (entry && now - entry.at < stale) return entry.value
      throw error
    }
  }
}

const STEAM_STATES = ['offline', 'online', 'busy', 'away', 'away', 'online', 'online']

export function createSteam(ctx) {
  const { config } = ctx
  return cached({
    ttl: STEAM_TTL_MS,
    stale: 10 * 60_000,
    async load() {
      if (!config.steamKey) return { state: 'unknown' }
      const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/')
      url.searchParams.set('key', config.steamKey)
      url.searchParams.set('steamids', config.steamId)
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': USER_AGENT } })
      if (!response.ok) throw new Error(`steam http ${response.status}`)
      const player = (await response.json())?.response?.players?.[0]
      if (!player) return { state: 'unknown' }

      // Отдаём только нужное: ключ и прочие поля профиля наружу не уходят.
      const game = typeof player.gameextrainfo === 'string' ? player.gameextrainfo.slice(0, 80) : null
      const state = game ? 'ingame' : (STEAM_STATES[player.personastate] ?? 'offline')
      return {
        state,
        game,
        name: typeof player.personaname === 'string' ? player.personaname.slice(0, 40) : null,
        lastSeen: state === 'offline' && player.lastlogoff ? player.lastlogoff * 1000 : null,
      }
    },
  })
}

function parseGithubHtml(html) {
  const tooltips = new Map()
  for (const match of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g)) {
    const text = match[2].trim()
    const count = /^No contributions/i.test(text) ? 0 : Number.parseInt(text, 10)
    tooltips.set(match[1], Number.isFinite(count) ? count : 0)
  }
  const days = []
  for (const match of html.matchAll(/<td\b[^>]*>/g)) {
    const tag = match[0]
    const date = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(tag)?.[1]
    if (!date) continue
    const id = /\bid="([^"]+)"/.exec(tag)?.[1]
    const level = Number.parseInt(/data-level="(\d)"/.exec(tag)?.[1] ?? '0', 10)
    days.push({ d: date, c: tooltips.get(id) ?? 0, l: Math.min(Math.max(level, 0), 4) })
  }
  return days
}

export function createGithub(ctx) {
  const { githubUser } = ctx.config
  const user = encodeURIComponent(githubUser)

  async function fromGithub() {
    const response = await fetch(`https://github.com/users/${user}/contributions`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    })
    if (!response.ok) throw new Error(`github http ${response.status}`)
    const days = parseGithubHtml(await response.text())
    if (days.length < 300) throw new Error('github html: calendar not found')
    return days
  }

  async function fromMirror() {
    const response = await fetch(`https://github-contributions-api.jogruber.de/v4/${user}?y=last`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) throw new Error(`mirror http ${response.status}`)
    const data = await response.json()
    const days = (data.contributions ?? []).map((day) => ({ d: day.date, c: day.count, l: day.level }))
    if (days.length < 300) throw new Error('mirror: calendar not found')
    return days
  }

  return cached({
    ttl: GITHUB_TTL_MS,
    stale: GITHUB_STALE_MS,
    async load() {
      let days
      try {
        days = await fromGithub()
      } catch {
        days = await fromMirror()
      }
      days.sort((a, b) => (a.d < b.d ? -1 : 1))
      return { user: githubUser, total: days.reduce((sum, day) => sum + day.c, 0), days }
    },
  })
}

export async function integrationRoutes(app, ctx) {
  const limit = { rateLimit: { max: 60, timeWindow: '1 minute' } }

  app.get('/steam', { config: limit }, async (_req, reply) => {
    try {
      reply.header('Cache-Control', 'public, max-age=30')
      return await ctx.steam()
    } catch (error) {
      ctx.log?.warn({ err: error.message }, 'steam unavailable')
      return { state: 'unknown' }
    }
  })

  app.get('/github', { config: limit }, async (_req, reply) => {
    try {
      reply.header('Cache-Control', 'public, max-age=600')
      return await ctx.github()
    } catch (error) {
      ctx.log?.warn({ err: error.message }, 'github unavailable')
      return reply.code(502).header('Cache-Control', 'no-store').send({ error: 'unavailable' })
    }
  })
}
