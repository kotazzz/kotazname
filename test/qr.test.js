import { test } from 'node:test'
import assert from 'node:assert/strict'
import jsQR from 'jsqr'
import { buildQrSvg, qrInfo } from '../src/lib/qr.js'

/**
 * Тест читаемости стилизованного QR: растрируем SVG (круглые точки,
 * скруглённые квадраты) в пиксели и сканируем jsQR — как камера телефона.
 */

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function parseSvg(svg) {
  const bg = /viewBox="0 0 (\d+) \1"/.exec(svg)
  const size = Number(bg[1])
  const shapes = []
  for (const m of svg.matchAll(/<rect(?: x="([\d.]+)" y="([\d.]+)")? width="([\d.]+)" height="([\d.]+)" rx="([\d.]+)" fill="([^"]+)"\/>/g)) {
    shapes.push({ kind: 'rect', x: m[1] ? Number(m[1]) : 0, y: m[2] ? Number(m[2]) : 0, w: Number(m[3]), h: Number(m[4]), rx: Number(m[5]), fill: m[6] })
  }
  for (const m of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g)) {
    shapes.push({ kind: 'circle', cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]), fill: 'url(#qz)' })
  }
  return { size, shapes }
}

function roundRectContains(rx, ry, rw, rh, rr, px, py) {
  const qx = Math.abs(px - (rx + rw / 2)) - (rw / 2 - Math.min(rr, rw / 2))
  const qy = Math.abs(py - (ry + rh / 2)) - (rh / 2 - Math.min(rr, rh / 2))
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= rr
}

function rasterize(svg, pxPerModule = 5) {
  const { size, shapes } = parseSvg(svg)
  const px = size * pxPerModule
  const data = new Uint8ClampedArray(px * px * 4)
  const bg = shapes[0]?.fill ?? '#120f17'
  const bgRgb = hexRgb(bg.startsWith('#') ? bg : '#120f17')
  for (let y = 0; y < px; y += 1) {
    for (let x = 0; x < px; x += 1) {
      const mx = (x + 0.5) / pxPerModule
      const my = (y + 0.5) / pxPerModule
      let rgb = bgRgb
      for (const shape of shapes) {
        const hit =
          shape.kind === 'circle'
            ? Math.hypot(mx - shape.cx, my - shape.cy) <= shape.r
            : roundRectContains(shape.x, shape.y, shape.w, shape.h, shape.rx, mx, my)
        if (hit) {
          if (shape.fill.startsWith('#')) rgb = hexRgb(shape.fill)
          else {
            // градиент от #5f9ec7 к #e4f3ff — берём яркий конец, контраста хватает
            rgb = hexRgb('#e4f3ff')
          }
        }
      }
      const at = (y * px + x) * 4
      data[at] = rgb[0]
      data[at + 1] = rgb[1]
      data[at + 2] = rgb[2]
      data[at + 3] = 255
    }
  }
  return { data, width: px, height: px }
}

test('стилизованный QR читается сканером', () => {
  const url = 'https://kotaz.name'
  const svg = buildQrSvg(url)
  const { data, width, height } = rasterize(svg)
  const decoded = jsQR(data, width, height)
  assert.ok(decoded, 'jsQR не смог распознать код')
  assert.equal(decoded.data, url)
})

test('QR версии и размера разумны', () => {
  const { size } = qrInfo('https://kotaz.name')
  assert.ok(size >= 21 && size <= 41, `матрица ${size}×${size}`)
})
