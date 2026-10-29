/** Generate a clear two-tone alarm WAV (16-bit mono PCM). */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(__dirname, '..', 'public', 'sounds', 'alarm.wav')
fs.mkdirSync(path.dirname(out), { recursive: true })

const sampleRate = 44100
const volume = 0.64

function tone(freq, durationSec, attack = 0.006, release = 0.03) {
  const n = Math.floor(sampleRate * durationSec)
  const samples = new Float32Array(n)
  const aN = Math.max(1, Math.floor(sampleRate * attack))
  const rN = Math.max(1, Math.floor(sampleRate * release))
  for (let i = 0; i < n; i++) {
    let env = 1
    if (i < aN) env = i / aN
    else if (i > n - rN) env = Math.max(0, (n - i) / rN)
    const t = i / sampleRate
    const s =
      Math.sin(2 * Math.PI * freq * t) * 0.72 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 +
      Math.sin(2 * Math.PI * freq * 3 * t) * 0.08
    samples[i] = s * env * volume
  }
  return samples
}

function silence(durationSec) {
  return new Float32Array(Math.floor(sampleRate * durationSec))
}

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const outArr = new Float32Array(total)
  let o = 0
  for (const c of chunks) {
    outArr.set(c, o)
    o += c.length
  }
  return outArr
}

// Alternating A5 / E6 pair — piercing but not harsh, then a short rest
const lo = () => tone(880, 0.13)
const hi = () => tone(1318.5, 0.13)
const pair = [lo(), hi()]
const cycle = [...pair, ...pair, ...pair, ...pair, silence(0.22)]
const samples = concat([...cycle, ...cycle])

const dataSize = samples.length * 2
const buffer = Buffer.alloc(44 + dataSize)
buffer.write('RIFF', 0)
buffer.writeUInt32LE(36 + dataSize, 4)
buffer.write('WAVE', 8)
buffer.write('fmt ', 12)
buffer.writeUInt32LE(16, 16)
buffer.writeUInt16LE(1, 20) // PCM
buffer.writeUInt16LE(1, 22) // mono
buffer.writeUInt32LE(sampleRate, 24)
buffer.writeUInt32LE(sampleRate * 2, 28)
buffer.writeUInt16LE(2, 32)
buffer.writeUInt16LE(16, 34)
buffer.write('data', 36)
buffer.writeUInt32LE(dataSize, 40)
for (let i = 0; i < samples.length; i++) {
  const v = Math.max(-1, Math.min(1, samples[i]))
  buffer.writeInt16LE((v * 0x7fff) | 0, 44 + i * 2)
}
fs.writeFileSync(out, buffer)
const tauriOut = path.join(__dirname, '..', 'src-tauri', 'sounds', 'alarm.wav')
fs.mkdirSync(path.dirname(tauriOut), { recursive: true })
fs.copyFileSync(out, tauriOut)
console.log('wrote', out, `(${(buffer.length / 1024).toFixed(1)} KB)`)
