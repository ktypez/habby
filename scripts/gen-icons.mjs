// HABBY — PWA icon generator (pure Node, zero deps)
// Draws a neobrutalist bullseye: cream bg, black frame, amber ring, green dot.
// Usage: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// ---------- PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- Bullseye drawing ----------
function bullseye(size, { maskable = false } = {}) {
  const px = new Uint8Array(size * size * 4)

  const s = size / 512
  const cream = [245, 245, 240]
  const ink = [0, 0, 0]
  const amber = [255, 224, 102]
  const green = [6, 214, 160]

  const frame = maskable ? Math.round(12 * s) : Math.round(26 * s)
  const cx = size / 2
  const cy = size / 2
  const ringOuter = 210 * s
  const ringInner = 158 * s
  const ringStroke = 13 * s
  const dotR = 52 * s
  const dotStroke = 12 * s

  function drawCircle(x, y, r, color) {
    const rr = r * r
    const minX = Math.max(0, Math.floor(x - r))
    const maxX = Math.min(size - 1, Math.ceil(x + r))
    const minY = Math.max(0, Math.floor(y - r))
    const maxY = Math.min(size - 1, Math.ceil(y + r))
    for (let yy = minY; yy <= maxY; yy++) {
      for (let xx = minX; xx <= maxX; xx++) {
        const dx = xx - x
        const dy = yy - y
        if (dx * dx + dy * dy <= rr) setPx(px, size, xx, yy, color)
      }
    }
  }

  // cream background
  for (let i = 0; i < px.length; i += 4) {
    px[i] = cream[0]
    px[i + 1] = cream[1]
    px[i + 2] = cream[2]
    px[i + 3] = 255
  }

  // black frame
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < frame || x >= size - frame || y < frame || y >= size - frame) {
        setPx(px, size, x, y, ink)
      }
    }
  }

  // amber ring (outer black stroke, then amber band, then inner black stroke)
  drawCircle(cx, cy, ringOuter + ringStroke, ink)
  drawCircle(cx, cy, ringOuter, amber)
  drawCircle(cx, cy, ringInner, ink)
  drawCircle(cx, cy, ringInner - ringStroke, cream)

  // green dot with black stroke
  drawCircle(cx, cy, dotR + dotStroke, ink)
  drawCircle(cx, cy, dotR, green)

  return Buffer.from(px.buffer, px.byteOffset, px.byteLength)
}

function setPx(px, size, x, y, rgb) {
  const i = (y * size + x) * 4
  px[i] = rgb[0]
  px[i + 1] = rgb[1]
  px[i + 2] = rgb[2]
  px[i + 3] = 255
}

// ---------- Emit ----------
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-512-maskable.png', 512, true]
]

for (const [name, size, maskable] of targets) {
  const png = encodePng(size, bullseye(size, { maskable }))
  writeFileSync(join(outDir, name), png)
  console.log('✓', name, png.length + ' bytes')
}
