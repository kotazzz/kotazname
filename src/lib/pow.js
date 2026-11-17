/**
 * Proof-of-work для анонимных сообщений: подбираем nonce, у которого
 * SHA-256(`${challenge}:${nonce}`) начинается с `bits` нулевых бит.
 * 16 бит — это в среднем ~65 тысяч хэшей, браузер справляется за доли секунды.
 */
function leadingZeroBits(bytes) {
  let count = 0
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8
      continue
    }
    count += Math.clz32(byte) - 24
    break
  }
  return count
}

const digestHex = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

export async function solvePow(challenge, bits, onProgress) {
  let counter = 0
  // Отдаём управление циклу отрисовки, чтобы не заморозить страницу.
  for (;;) {
    for (let i = 0; i < 2048; i += 1) {
      const nonce = counter.toString(36)
      counter += 1
      // eslint-disable-next-line no-await-in-loop
      const digest = await digestHex(`${challenge}:${nonce}`)
      if (leadingZeroBits(digest) >= bits) return `${challenge}:${nonce}`
    }
    onProgress?.(counter)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
