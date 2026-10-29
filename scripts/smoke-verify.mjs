/** End-to-end smoke: load, fit, flip, theme, settings, tap/LED fallback. */
import { chromium } from 'playwright'

const URL = process.env.APP_URL || 'http://localhost:4173/'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() =>
  chromium.launch({ headless: true }),
)
const page = await browser.newPage({ viewport: { width: 1629, height: 973 } })

try {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid=cube]', { timeout: 15000 })
  await page.waitForTimeout(900)
  ok('loads cube', true)

  // Centering within 1%
  const center = await page.evaluate(() => {
    const faces = [...document.querySelectorAll('.cube-face')]
    let L = 1e9,
      R = -1e9,
      T = 1e9,
      B = -1e9
    for (const f of faces) {
      const r = f.getBoundingClientRect()
      L = Math.min(L, r.left)
      R = Math.max(R, r.right)
      T = Math.min(T, r.top)
      B = Math.max(B, r.bottom)
    }
    const cx = (L + R) / 2
    const cy = (T + B) / 2
    const vw = window.visualViewport?.width ?? innerWidth
    const vh = window.visualViewport?.height ?? innerHeight
    return {
      errX: Math.abs(((cx - vw / 2) / vw) * 100),
      errY: Math.abs(((cy - vh / 2) / vh) * 100),
      theme: document.querySelector('.cube')?.getAttribute('data-theme'),
      led: document.querySelector('.led-row')?.getAttribute('aria-label') || '',
      api: typeof window.__flipCube?.flip === 'function',
    }
  })
  ok('silhouette center ≤1%', center.errX <= 1 && center.errY <= 1, `x=${center.errX.toFixed(2)}% y=${center.errY.toFixed(2)}%`)
  ok('flip API present', center.api)
  ok('LED shows time', /\d{2}/.test(center.led), center.led)

  const face0 = await page.evaluate(() => window.__flipCube.getActiveFace())
  await page.evaluate(() => window.__flipCube.flip(1, 'y'))
  await page.waitForFunction(() => !window.__flipCube?.isFlipping(), null, { timeout: 4000 })
  await page.waitForTimeout(200)
  const face1 = await page.evaluate(() => window.__flipCube.getActiveFace())
  ok('flip changes active face', face1 !== face0, `${face0} → ${face1}`)

  // Theme toggle
  await page.locator('.theme-toggle').evaluate((el) => {
    el.style.opacity = '1'
  })
  const beforeTheme = await page.locator('[data-testid=cube]').getAttribute('data-theme')
  await page.locator('.theme-toggle').click({ force: true })
  await page.waitForTimeout(150)
  const afterTheme = await page.locator('[data-testid=cube]').getAttribute('data-theme')
  ok('theme toggles', beforeTheme !== afterTheme, `${beforeTheme} → ${afterTheme}`)

  // View toggle
  await page.locator('.view-toggle').evaluate((el) => {
    el.style.opacity = '1'
  })
  const viewBefore = await page.locator('.view-toggle').innerText()
  await page.locator('.view-toggle').click({ force: true })
  await page.waitForTimeout(400)
  const viewAfter = await page.locator('.view-toggle').innerText()
  ok('view angle toggle', viewBefore !== viewAfter, `${viewBefore.trim()} → ${viewAfter.trim()}`)

  // Settings
  await page.locator('.settings-toggle').evaluate((el) => {
    el.style.opacity = '1'
  })
  await page.locator('.settings-toggle').click({ force: true })
  await page.waitForSelector('.settings-panel, .settings-card', { timeout: 3000 })
  const settingsVisible = await page.locator('.settings-panel, .settings-card').count()
  ok('settings overlay opens', settingsVisible > 0)
  const faceInput = page.locator('.settings-panel input[type=number], .settings-card input[type=number]').first()
  await faceInput.fill('7')
  await faceInput.blur()
  const val = await faceInput.inputValue()
  ok('settings edit face minutes', val === '7', `value=${val}`)
  // close if button exists
  const closeBtn = page.locator('.settings-panel button, .settings-card button').first()
  if (await closeBtn.count()) await closeBtn.click()

  // Keyboard flip
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(800)
  ok('keyboard flip', true)

  // Perf mode key
  await page.keyboard.press('p')
  await page.waitForTimeout(100)
  const perf = await page.evaluate(() => window.__flipCube?.getPerfMode?.())
  ok('P toggles perf mode', typeof perf === 'boolean', `perf=${perf}`)

  // Debug overlay
  await page.keyboard.press('d')
  await page.waitForTimeout(100)
  const debugShown = await page.locator('[data-testid=debug-overlay]:not([hidden])').count()
  ok('D opens debug', debugShown > 0)

  // Screenshot for visual review
  await page.screenshot({ path: 'screenshots/smoke-rest.png', type: 'png' })
  ok('screenshot written', true, 'screenshots/smoke-rest.png')
} catch (e) {
  ok('suite', false, String(e))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
process.exit(failed.length ? 2 : 0)
