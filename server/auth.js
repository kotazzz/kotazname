import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { randomBytes } from 'node:crypto'
import { originGuard, tokenHash } from './security.js'
import { transaction } from './db.js'
import { cleanLine, randomToken, safeEqual } from './util.js'

export const SESSION_COOKIE = 'kz_admin'
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000
const TOUCH_EVERY_MS = 60 * 60 * 1000
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const MAX_CHALLENGES = 500
// ES256, EdDSA, RS256 — то, что умеют все распространённые passkey-хранилища.
const ALGORITHMS = [-7, -8, -257]

export function createAuth(ctx) {
  const { config, db } = ctx
  const challenges = new Map()
  let generatedToken = null

  const count = () => db.prepare('SELECT COUNT(*) AS n FROM credentials').get().n
  const isRegistered = () => count() > 0

  /** Токен первичной настройки. Действует, пока не зарегистрирован ни один passkey. */
  function setupToken() {
    if (isRegistered()) return null
    if (config.adminSetupToken) return config.adminSetupToken
    generatedToken ??= randomToken(24)
    return generatedToken
  }

  function putChallenge(kind, data) {
    const now = Date.now()
    for (const [key, value] of challenges) if (value.exp < now) challenges.delete(key)
    while (challenges.size >= MAX_CHALLENGES) challenges.delete(challenges.keys().next().value)
    const id = randomToken(16)
    challenges.set(id, { kind, exp: now + CHALLENGE_TTL_MS, ...data })
    return id
  }

  function takeChallenge(id, kind) {
    if (typeof id !== 'string') return null
    const entry = challenges.get(id)
    challenges.delete(id)
    if (!entry || entry.kind !== kind || entry.exp < Date.now()) return null
    return entry
  }

  function userHandle() {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_user_id'").get()
    if (row) return Buffer.from(row.value, 'base64url')
    const handle = randomBytes(32)
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_user_id', ?)").run(handle.toString('base64url'))
    return handle
  }

  function createSession(reply, req) {
    const token = randomToken(32)
    const now = Date.now()
    db.prepare(
      'INSERT INTO sessions (token_hash, created_at, expires_at, last_seen, user_agent) VALUES (?, ?, ?, ?, ?)',
    ).run(tokenHash(token), now, now + SESSION_TTL_MS, now, String(req.headers['user-agent'] || '').slice(0, 200))
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: config.production,
      sameSite: 'strict',
      maxAge: SESSION_TTL_MS / 1000,
    })
  }

  function currentSession(req) {
    const token = req.cookies?.[SESSION_COOKIE]
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null
    const hash = tokenHash(token)
    const row = db.prepare('SELECT token_hash, expires_at, last_seen FROM sessions WHERE token_hash = ?').get(hash)
    const now = Date.now()
    if (!row) return null
    if (row.expires_at < now) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash)
      return null
    }
    if (now - row.last_seen > TOUCH_EVERY_MS) {
      db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(now, now + SESSION_TTL_MS, hash)
    }
    return row
  }

  function destroySession(req, reply) {
    const token = req.cookies?.[SESSION_COOKIE]
    if (typeof token === 'string') db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
  }

  /** preHandler для всех закрытых маршрутов: сессия + для небезопасных методов проверка Origin. */
  const checkOrigin = originGuard(config.adminOrigins)
  async function requireAdmin(req, reply) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const denied = await checkOrigin(req, reply)
      if (denied) return denied
    }
    const session = currentSession(req)
    if (!session) return reply.code(401).send({ error: 'unauthorized' })
    req.session = session
    return undefined
  }

  return { isRegistered, setupToken, putChallenge, takeChallenge, userHandle, createSession, currentSession, destroySession, requireAdmin, checkOrigin }
}

const AUTH_LIMIT = { max: 12, timeWindow: '10 minutes' }

export async function authRoutes(app, ctx) {
  const { config, db, auth } = ctx
  const rp = { rpID: config.rpId, expectedOrigin: config.adminOrigins }

  app.get('/session', async (req) => ({
    registered: auth.isRegistered(),
    authenticated: Boolean(auth.currentSession(req)),
  }))

  // --- Регистрация passkey ---------------------------------------------------------------
  app.post('/register/options', { preHandler: auth.checkOrigin, config: { rateLimit: AUTH_LIMIT } }, async (req, reply) => {
    const registered = auth.isRegistered()
    let mode = 'add'
    if (!registered) {
      const expected = auth.setupToken()
      const given = typeof req.body?.setupToken === 'string' ? req.body.setupToken.trim() : ''
      if (!given || !expected || !safeEqual(given, expected)) {
        req.log.warn('admin setup: wrong token')
        return reply.code(403).send({ error: 'bad_setup_token' })
      }
      mode = 'setup'
    } else if (!auth.currentSession(req)) {
      return reply.code(401).send({ error: 'unauthorized' })
    }

    const existing = db.prepare('SELECT id, transports FROM credentials').all()
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userName: 'kotaz',
      userDisplayName: 'kot_az',
      userID: auth.userHandle(),
      attestationType: 'none',
      supportedAlgorithmIDs: ALGORITHMS,
      excludeCredentials: existing.map((row) => ({ id: row.id, transports: JSON.parse(row.transports) })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })
    const challengeId = auth.putChallenge('register', { challenge: options.challenge, mode })
    return { challengeId, options }
  })

  app.post('/register/verify', { preHandler: auth.checkOrigin, config: { rateLimit: AUTH_LIMIT } }, async (req, reply) => {
    const { challengeId, response, name } = req.body ?? {}
    const entry = auth.takeChallenge(challengeId, 'register')
    if (!entry || typeof response !== 'object' || response === null) return reply.code(400).send({ error: 'bad_challenge' })

    // Условия проверяем заново: между options и verify могло что-то измениться.
    if (entry.mode === 'setup' ? auth.isRegistered() : !auth.currentSession(req)) {
      return reply.code(409).send({ error: 'state_changed' })
    }

    let verification
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: rp.expectedOrigin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
        supportedAlgorithmIDs: ALGORITHMS,
      })
    } catch (error) {
      req.log.warn({ err: error.message }, 'passkey registration rejected')
      return reply.code(400).send({ error: 'verification_failed' })
    }
    if (!verification.verified) return reply.code(400).send({ error: 'verification_failed' })

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
    const label = cleanLine(typeof name === 'string' ? name : '').slice(0, 40) || 'Passkey'

    try {
      transaction(db, () => {
        if (entry.mode === 'setup' && auth.isRegistered()) throw new Error('already_registered')
        db.prepare(
          `INSERT INTO credentials (id, public_key, counter, transports, device_type, backed_up, name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          credential.id,
          Buffer.from(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports ?? []),
          credentialDeviceType,
          credentialBackedUp ? 1 : 0,
          label,
          Date.now(),
        )
      })
    } catch (error) {
      req.log.warn({ err: error.message }, 'passkey insert failed')
      return reply.code(409).send({ error: 'state_changed' })
    }

    if (entry.mode === 'setup') auth.createSession(reply, req)
    return { ok: true }
  })

  // --- Вход ------------------------------------------------------------------------------
  app.post('/login/options', { preHandler: auth.checkOrigin, config: { rateLimit: AUTH_LIMIT } }, async (req, reply) => {
    if (!auth.isRegistered()) return reply.code(409).send({ error: 'not_registered' })
    // Без allowCredentials: браузер сам покажет доступные passkey этого сайта.
    const options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'required' })
    const challengeId = auth.putChallenge('login', { challenge: options.challenge })
    return { challengeId, options }
  })

  app.post('/login/verify', { preHandler: auth.checkOrigin, config: { rateLimit: AUTH_LIMIT } }, async (req, reply) => {
    const { challengeId, response } = req.body ?? {}
    const entry = auth.takeChallenge(challengeId, 'login')
    if (!entry || typeof response?.id !== 'string') return reply.code(400).send({ error: 'bad_challenge' })

    const row = db.prepare('SELECT * FROM credentials WHERE id = ?').get(response.id)
    if (!row) return reply.code(401).send({ error: 'unknown_credential' })

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: rp.expectedOrigin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
        credential: {
          id: row.id,
          publicKey: new Uint8Array(row.public_key),
          counter: row.counter,
          transports: JSON.parse(row.transports),
        },
      })
    } catch (error) {
      req.log.warn({ err: error.message }, 'passkey login rejected')
      return reply.code(401).send({ error: 'verification_failed' })
    }
    if (!verification.verified) return reply.code(401).send({ error: 'verification_failed' })

    db.prepare('UPDATE credentials SET counter = ?, last_used_at = ?, backed_up = ? WHERE id = ?').run(
      verification.authenticationInfo.newCounter,
      Date.now(),
      verification.authenticationInfo.credentialBackedUp ? 1 : 0,
      row.id,
    )
    auth.createSession(reply, req)
    return { ok: true }
  })

  app.post('/logout', { preHandler: auth.checkOrigin }, async (req, reply) => {
    auth.destroySession(req, reply)
    return { ok: true }
  })

  // --- Управление passkey ----------------------------------------------------------------
  app.register(async (secured) => {
    secured.addHook('preHandler', auth.requireAdmin)

    secured.get('/passkeys', async () => ({
      items: db
        .prepare('SELECT id, name, device_type, backed_up, created_at, last_used_at FROM credentials ORDER BY created_at')
        .all()
        .map((row) => ({
          id: row.id,
          name: row.name,
          deviceType: row.device_type,
          backedUp: Boolean(row.backed_up),
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
        })),
    }))

    secured.patch('/passkeys/:id', async (req, reply) => {
      const name = cleanLine(typeof req.body?.name === 'string' ? req.body.name : '').slice(0, 40)
      if (!name) return reply.code(400).send({ error: 'bad_name' })
      const result = db.prepare('UPDATE credentials SET name = ? WHERE id = ?').run(name, req.params.id)
      return result.changes ? { ok: true } : reply.code(404).send({ error: 'not_found' })
    })

    secured.delete('/passkeys/:id', async (req, reply) => {
      // Последний passkey удалить нельзя: иначе сайт останется без входа.
      const result = transaction(db, () => {
        if (count(db) <= 1) return { changes: 0, last: true }
        return db.prepare('DELETE FROM credentials WHERE id = ?').run(req.params.id)
      })
      if (result.last) return reply.code(409).send({ error: 'last_passkey' })
      return result.changes ? { ok: true } : reply.code(404).send({ error: 'not_found' })
    })
  })

  function count(database) {
    return database.prepare('SELECT COUNT(*) AS n FROM credentials').get().n
  }
}
