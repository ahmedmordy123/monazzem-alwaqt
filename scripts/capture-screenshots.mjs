/**
 * Capture rest + mid-flip screenshots at several viewports/themes.
 *   node scripts/capture-screenshots.mjs [--url=http://localhost:4173/]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'screenshots')
const URL =
  process.argv.find((a) => a.startsWith('--url='))?.slice(6) ??
  'http://localhost:4173/'

const VIEWPORTS = [
  { name: '1640x912', width: 1640, height: 912 },
  { name: '2000x1200', width: 2000, height: 1200 },
  { name: '1200x2000', width: 1200, height: 2000 },
]

const THEMES = ['white', 'black']

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    const btn = document.querySelector('.theme-toggle')
    const cube = document.querySelector('.cube')
    const current = cube?.getAttribute('data-theme')
    if (current !== t && btn) btn.click()
  }, theme)
  await page.waitForTimeout(200)
  // Ensure correct theme (click again if needed)
  await page.evaluate((t) => {
    const cube = document.querySelector('.cube')
    const btn = document.querySelector('.theme-toggle')
    if (cube?.getAttribute('data-theme') !== t && btn) btn.click()
  }, theme)
  await page.waitForTimeout(150)
}

async function waitForFit(page) {
  await page.waitForFunction(() => Boolean(window.__flipCube), null, {
    timeout: 15000,
  })
  // Allow silhouette fit iterations
  await page.waitForTimeout(600)
  await page.addStyleTag({
    content: `
      .theme-toggle, .view-toggle { opacity: 1 !important; }
      .desk-hint { opacity: 0 !important; }
    `,
  })
}

async function capture(page, fileBase) {
  const restPath = path.join(OUT, `${fileBase}-rest.png`)
  await page.screenshot({ path: restPath, type: 'png' })

  // Mid-flip: start flip and shoot ~260ms in
  await page.evaluate(() => {
    window.__flipCube?.flip(1, 'y')
  })
  await page.waitForTimeout(260)
  const midPath = path.join(OUT, `${fileBase}-midflip.png`)
  await page.screenshot({ path: midPath, type: 'png' })

  // Wait for settle
  await page.waitForFunction(() => !window.__flipCube?.isFlipping(), null, {
    timeout: 3000,
  })
  await page.waitForTimeout(100)

  return { restPath, midPath }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
  }).catch(() =>
    chromium.launch({ headless: true }),
  )

  const results = []
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await page.goto(URL, { waitUntil: 'networkidle' })
      await waitForFit(page)
      // Force angled view
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
      await waitForFit(page)
      await setTheme(page, theme)

      const base = `${vp.name}-${theme}`
      const paths = await capture(page, base)

      // Quick geometric checks via face rects
      const check = await page.evaluate(() => {
        const stage = document.querySelector('.desk-stage')
        const cube = document.querySelector('.cube')
        if (!stage || !cube) return { ok: false, reason: 'missing' }
        const sr = stage.getBoundingClientRect()
        const faces = [...cube.querySelectorAll('.cube-face')]
        let left = Infinity
        let top = Infinity
        let right = -Infinity
        let bottom = -Infinity
        for (const f of faces) {
          const r = f.getBoundingClientRect()
          if (r.width < 1) continue
          left = Math.min(left, r.left)
          top = Math.min(top, r.top)
          right = Math.max(right, r.right)
          bottom = Math.max(bottom, r.bottom)
        }
        const marginL = left - sr.left
        const marginT = top - sr.top
        const marginR = sr.right - right
        const marginB = sr.bottom - bottom
        const w = right - left
        const h = bottom - top
        return {
          ok: marginL > 8 && marginT > 8 && marginR > 8 && marginB > 8,
          margins: {
            l: Math.round(marginL),
            t: Math.round(marginT),
            r: Math.round(marginR),
            b: Math.round(marginB),
          },
          sil: { w: Math.round(w), h: Math.round(h) },
          stage: { w: Math.round(sr.width), h: Math.round(sr.height) },
          fillH: +(h / sr.height).toFixed(3),
          fillW: +(w / sr.width).toFixed(3),
        }
      })

      results.push({ base, ...paths, check })
      await context.close()
    }
  }

  await browser.close()
  const summaryPath = path.join(OUT, 'summary.json')
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
  console.log('Wrote', summaryPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
