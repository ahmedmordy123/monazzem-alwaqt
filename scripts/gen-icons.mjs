import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons')
fs.mkdirSync(dir, { recursive: true })

function solid(size) {
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2
      const led = x < size * 0.2 && y < size * 0.2
      png.data[i] = led ? 58 : 239
      png.data[i + 1] = led ? 160 : 239
      png.data[i + 2] = led ? 255 : 239
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

for (const s of [32, 128, 256]) {
  fs.writeFileSync(path.join(dir, `${s}x${s}.png`), solid(s))
}
const iconPng = solid(256)
fs.writeFileSync(path.join(dir, 'icon.png'), iconPng)
fs.writeFileSync(path.join(dir, 'icon.ico'), icoFromPng(iconPng, 256))
console.log('wrote icons to', dir)

function icoFromPng(png, size) {
  const headerSize = 6
  const entrySize = 16
  const out = Buffer.alloc(headerSize + entrySize + png.length)
  out.writeUInt16LE(0, 0)
  out.writeUInt16LE(1, 2)
  out.writeUInt16LE(1, 4)
  out.writeUInt8(size >= 256 ? 0 : size, 6)
  out.writeUInt8(size >= 256 ? 0 : size, 7)
  out.writeUInt8(0, 8)
  out.writeUInt8(0, 9)
  out.writeUInt16LE(1, 10)
  out.writeUInt16LE(32, 12)
  out.writeUInt32LE(png.length, 14)
  out.writeUInt32LE(headerSize + entrySize, 18)
  png.copy(out, headerSize + entrySize)
  return out
}
