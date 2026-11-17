import qrcode from 'qrcode-generator'

/**
 * Стилизованный QR в цветах сайта: данные — круглые точки с градиентом,
 * поисковые узоры — скруглённые квадраты. Возвращает строку SVG.
 * level 'H' (высокая коррекция) выбрана, чтобы точечная отрисовка не мешала считыванию.
 */
const QUIET = 3 // тихая зона в модулях

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildQrSvg(text, { bg = '#120f17', from = '#5f9ec7', to = '#e4f3ff' } = {}) {
  const qr = qrcode(0, 'H')
  qr.addData(String(text))
  qr.make()
  const n = qr.getModuleCount()
  const box = n + QUIET * 2

  const inFinder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)

  const dots = []
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (inFinder(r, c) || !qr.isDark(r, c)) continue
      dots.push(`<circle cx="${c + QUIET + 0.5}" cy="${r + QUIET + 0.5}" r="0.47"/>`)
    }
  }

  // Скруглённый квадрат 7×7 с «вырезом» и ядром.
  const finder = (r, c) => {
    const x = c + QUIET
    const y = r + QUIET
    return (
      `<rect x="${x}" y="${y}" width="7" height="7" rx="2.1" fill="url(#qz)"/>` +
      `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="1.4" fill="${bg}"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="url(#qz)"/>`
    )
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" role="img" aria-label="${esc(text)}">` +
    `<defs><linearGradient id="qz" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${box}" height="${box}" rx="${Math.max(2, box * 0.06)}" fill="${bg}"/>` +
    `<g fill="url(#qz)">${dots.join('')}</g>` +
    finder(0, 0) +
    finder(0, n - 7) +
    finder(n - 7, 0) +
    `</svg>`
  )
}

/** Размер матрицы и заполненность — нужны тесту на читаемость. */
export function qrInfo(text) {
  const qr = qrcode(0, 'H')
  qr.addData(String(text))
  qr.make()
  return { size: qr.getModuleCount() }
}
