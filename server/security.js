import { hmacHex, sha256 } from './util.js'

export const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Защита от CSRF: запрос, меняющий состояние, должен прийти со страницы нашего сайта.
 * Браузер всегда присылает Origin для таких запросов, подделать его со стороны чужого сайта нельзя.
 */
export function originGuard(allowedOrigins) {
  const allowed = new Set(allowedOrigins)
  return async function checkOrigin(req, reply) {
    const origin = req.headers.origin
    const site = req.headers['sec-fetch-site']
    if (!origin || !allowed.has(origin) || site === 'cross-site') {
      return reply.code(403).send({ error: 'forbidden_origin' })
    }
    return undefined
  }
}

/** Псевдоним посетителя: HMAC от IP и User-Agent. Сам IP нигде не хранится. */
export function visitorHash(ctx, req) {
  return hmacHex(ctx.secret, 'visitor', req.ip, req.headers['user-agent'] || '').slice(0, 32)
}

export function ipHash(ctx, req) {
  return hmacHex(ctx.secret, 'ip', req.ip).slice(0, 32)
}

export const tokenHash = (token) => sha256(`session:${token}`)

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export function addSecurityHeaders(app) {
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('Cross-Origin-Opener-Policy', 'same-origin')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    reply.header('X-Frame-Options', 'DENY')
    const type = String(reply.getHeader('content-type') || '')
    if (type.startsWith('text/html')) reply.header('Content-Security-Policy', CSP)
    if (req.url.startsWith('/api/') && !reply.hasHeader('cache-control')) {
      reply.header('Cache-Control', 'no-store')
    }
    return payload
  })
}
