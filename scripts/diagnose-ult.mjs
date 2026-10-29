/** One-flip CDP dump of Layout / UpdateLayoutTree args inside the flip window. */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = process.argv[2] ?? 'http://localhost:4173/'
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'benchmarks',
  'ult-diagnose.json',
)

const browser = await chromium.launch({
  headless: false,
  channel: 'msedge',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
})
const page = await browser.newPage()
const client = await page.context().newCDPSession(page)
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__flipCube))

const events = []
const onTrace = (p) => {
  if (p.value) events.push(...p.value)
}
client.on('Tracing.dataCollected', onTrace)
await client.send('Tracing.start', {
  categories:
    'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing',
})

await page.evaluate(async () => {
  while (window.__flipCube?.isFlipping()) {
    await new Promise((r) => requestAnimationFrame(r))
  }
  window.__flipCube?.flip(1, 'y')
  const t0 = performance.now()
  while (window.__flipCube?.isFlipping()) {
    await new Promise((r) => requestAnimationFrame(r))
    if (performance.now() - t0 > 2000) break
  }
  await new Promise((r) => setTimeout(r, 100))
})

await new Promise((resolve) => {
  client.on('Tracing.tracingComplete', resolve)
  client.send('Tracing.end').catch(resolve)
  setTimeout(resolve, 4000)
})

const starts = events.filter((e) => String(e.name).startsWith('flip-start-'))
const ends = events.filter((e) => String(e.name).startsWith('flip-end-'))
const startTs = starts[0]?.ts
const endTs = ends[0]?.ts

const inside = events.filter(
  (e) =>
    startTs != null &&
    endTs != null &&
    e.ts >= startTs &&
    e.ts <= endTs &&
    (e.name === 'Layout' ||
      e.name === 'UpdateLayoutTree' ||
      e.name === 'Paint' ||
      e.name === 'Commit'),
)

const counts = {}
for (const e of inside) counts[e.name] = (counts[e.name] ?? 0) + 1

const sampleUlt = inside
  .filter((e) => e.name === 'UpdateLayoutTree' || e.name === 'Layout')
  .slice(0, 12)
  .map((e) => ({
    name: e.name,
    ts: e.ts,
    dur: e.dur,
    cat: e.cat,
    args: e.args,
  }))

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(
  OUT,
  JSON.stringify({ URL, startTs, endTs, counts, sampleUlt, markStarts: starts.length, markEnds: ends.length }, null, 2),
)
console.log(JSON.stringify({ counts, sampleUlt }, null, 2))
console.log('Wrote', OUT)
await browser.close()
