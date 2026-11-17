import { createHash } from 'node:crypto'
import { hmacHex, randomToken, safeEqual } from './util.js'

/**
 * Лёгкая proof-of-work защита от ботов вместо капчи: сервер выдаёт подписанный челлендж,
 * браузер подбирает nonce, у которого SHA-256(челлендж:nonce) начинается с N нулевых бит.
 * Челлендж одноразовый и живёт 15 минут. Без внешних сервисов и без слежки.
 */
const TTL_MS = 15 * 60 * 1000

export function createPow({ secret, bits }) {
  const used = new Map()

  const sign = (stamp, rand) => hmacHex(secret, 'pow', stamp, rand).slice(0, 32)

  const purge = (now) => {
    for (const [token, expires] of used) if (expires < now) used.delete(token)
  }

  function issue(now = Date.now()) {
    const stamp = String(now)
    const rand = randomToken(9)
    return { challenge: `${stamp}.${rand}.${sign(stamp, rand)}`, bits }
  }

  function leadingZeroBits(digest) {
    let count = 0
    for (const byte of digest) {
      if (byte === 0) {
        count += 8
        continue
      }
      count += Math.clz32(byte) - 24
      break
    }
    return count
  }

  /** Значение заголовка: `<challenge>:<nonce>`. Возвращает true один раз на челлендж. */
  function verify(value, now = Date.now()) {
    if (typeof value !== 'string' || value.length > 200) return false
    const split = value.lastIndexOf(':')
    if (split < 0) return false
    const challenge = value.slice(0, split)
    const nonce = value.slice(split + 1)
    if (!/^[0-9a-z]{1,16}$/i.test(nonce)) return false

    const [stamp, rand, signature] = challenge.split('.')
    if (!stamp || !rand || !signature || !/^\d{10,15}$/.test(stamp)) return false
    if (!safeEqual(signature, sign(stamp, rand))) return false
    const age = now - Number(stamp)
    if (age < 0 || age > TTL_MS) return false

    purge(now)
    if (used.has(challenge)) return false

    const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest()
    if (leadingZeroBits(digest) < bits) return false

    used.set(challenge, now + TTL_MS)
    return true
  }

  return { issue, verify }
}
