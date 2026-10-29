import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:4173/',
    headless: true,
  },
  webServer: {
    command: 'npm run preview -- --host --port 4173',
    port: 4173,
    reuseExistingServer: true,
  },
})
