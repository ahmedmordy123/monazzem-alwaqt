import { test, expect } from '@playwright/test'

const URL = process.env.APP_URL || 'http://localhost:4173/'

test.describe('cube smoke', () => {
  test('loads and flips', async ({ page }) => {
    await page.setViewportSize({ width: 1640, height: 912 })
    await page.goto(URL)
    await page.waitForSelector('[data-testid=cube]')
    await page.evaluate(() => window.__flipCube?.flip(1, 'y'))
    await page.waitForTimeout(700)
    expect(await page.locator('[data-testid=cube]').count()).toBe(1)
  })

  test('theme toggle', async ({ page }) => {
    await page.goto(URL)
    const cube = page.locator('[data-testid=cube]')
    const before = await cube.getAttribute('data-theme')
    await page.locator('.theme-toggle').evaluate((el) => { el.style.opacity = '1' })
    await page.locator('.theme-toggle').click({ force: true })
    const after = await cube.getAttribute('data-theme')
    expect(after).not.toBe(before)
  })

  test('settings panel opens and edits minutes', async ({ page }) => {
    await page.goto(URL)
    await page.locator('.settings-toggle').evaluate((el) => { el.style.opacity = '1' })
    await page.locator('.settings-toggle').click({ force: true })
    await expect(page.getByRole('heading', { name: /settings|إعدادات/i })).toBeVisible()
    const firstMinutes = page.locator('.settings-grid input').first()
    await firstMinutes.fill('6')
    await expect(firstMinutes).toHaveValue('6')
  })
})
