import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const MAX_EXCLUDE = 200

/** Каталог треков: data/music/tracks.json + audio/<id>.m4a + covers/<id>.jpg. */
export function createMusic(ctx) {
  const { musicDir } = ctx.config
  let tracks = []
  let byId = new Map()

  function load() {
    const file = path.join(musicDir, 'tracks.json')
    if (!existsSync(file)) return 0
    const list = JSON.parse(readFileSync(file, 'utf8'))
    tracks = list.filter((track) => existsSync(path.join(musicDir, 'audio', `${track.id}.m4a`)))
    byId = new Map(tracks.map((track) => [track.id, track]))
    return tracks.length
  }

  const publicTrack = (track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    cover: track.cover,
  })

  /** Случайный трек, не входящий в exclude (недавно сыгранные). */
  function random(exclude = new Set()) {
    if (!tracks.length) return null
    let pool = tracks.filter((track) => !exclude.has(track.id))
    if (!pool.length) pool = tracks
    return publicTrack(pool[Math.floor(Math.random() * pool.length)])
  }

  return { load, random, get: (id) => byId.get(id), get count() { return tracks.length } }
}

export async function musicRoutes(app, ctx) {
  const { music } = ctx
  const limit = { rateLimit: { max: 120, timeWindow: '1 minute' } }

  app.get('/music/random', { config: limit }, async (req, reply) => {
    const raw = typeof req.query.exclude === 'string' ? req.query.exclude.split(',') : []
    const exclude = new Set(
      raw
        .slice(0, MAX_EXCLUDE)
        .map((value) => Number.parseInt(value, 10))
        .filter(Number.isSafeInteger),
    )
    const track = music.random(exclude)
    if (!track) return reply.code(404).send({ error: 'no_tracks' })
    return { track, count: music.count }
  })

  const send = (kind, extension, type) => async (req, reply) => {
    const id = /^\d{1,12}$/.test(req.params.id) ? Number(req.params.id) : NaN
    const track = music.get(id)
    if (!track || (kind === 'covers' && !track.cover)) return reply.code(404).send({ error: 'not_found' })
    return reply
      .type(type)
      .header('Cache-Control', 'public, max-age=604800, immutable')
      .sendFile(`${kind}/${id}.${extension}`, { cacheControl: false })
  }

  app.get('/music/:id/audio', { config: limit }, send('audio', 'm4a', 'audio/mp4'))
  app.get('/music/:id/cover', { config: limit }, send('covers', 'jpg', 'image/jpeg'))
}
