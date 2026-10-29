/** Measure silhouette centering at 1629x973 + 6 random sizes. */
import { chromium } from 'playwright'

const URL = process.argv.find((a) => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:4173/'

function randomSize() {
  const w = 1200 + Math.floor(Math.random() * (2200 - 1200 + 1))
  const h = 700 + Math.floor(Math.random() * (1300 - 700 + 1))
  return { w, h }
}

async function measure(browser, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.setItem(
      'flip-cube-view',
      JSON.stringify({
        mode: 'angled',
        yaw: -22,
        pitch: -19,
        perspectiveFactor: 4.2,
        nudgeX: 0,
        nudgeY: 0,
      }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const m = await page.evaluate(() => {
    const faces = [...document.querySelectorAll('.cube-face')]
    let L = 1e9
    let T = 1e9
    let R = -1e9
    let B = -1e9
    for (const f of faces) {
      const r = f.getBoundingClientRect()
      L = Math.min(L, r.left)
      T = Math.min(T, r.top)
      R = Math.max(R, r.right)
      B = Math.max(B, r.bottom)
    }
    const cx = (L + R) / 2
    const cy = (T + B) / 2
    const vw = window.visualViewport?.width ?? innerWidth
    const vh = window.visualViewport?.height ?? innerHeight
    return {
      sil: { L: +L.toFixed(1), R: +R.toFixed(1), cx: +cx.toFixed(1), cy: +cy.toFixed(1) },
      view: { w: vw, h: vh, cx: vw / 2, cy: vh / 2 },
      errXpct: +(((cx - vw / 2) / vw) * 100).toFixed(2),
      errYpct: +(((cy - vh / 2) / vh) * 100).toFixed(2),
    }
  })
  await page.close()
  return { w, h, ...m, ok: Math.abs(m.errXpct) <= 1 && Math.abs(m.errYpct) <= 1 }
}

const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() =>
  chromium.launch({ headless: true }),
)

const sizes = [{ w: 1629, h: 973 }, ...Array.from({ length: 6 }, randomSize)]
const results = []
for (const s of sizes) {
  results.push(await measure(browser, s.w, s.h))
}
await browser.close()
console.log(JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(failed.length ? `FAIL ${failed.length}` : 'ALL_PASS')
process.exit(failed.length ? 2 : 0)
