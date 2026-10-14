import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Bout en bout : Chromium bureau et mobile (la liste de courses se consulte en magasin, sur téléphone).
//  - `make e2e` (Docker) : E2E_BASE_URL vise le conteneur `front` ; le vrai back répond derrière son proxy.
//  - CI : on teste le build (`vite preview`) ; local sans Docker : le serveur de développement.
// E2E_VISUAL=1 garde une capture, une vidéo et une trace de chaque test dans le rapport.
const external = process.env.E2E_BASE_URL
const visual = Boolean(process.env.E2E_VISUAL)

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [process.env.CI ? ['github'] : ['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external ?? (process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173'),
    trace: visual ? 'on' : 'on-first-retry',
    screenshot: visual ? 'on' : 'only-on-failure',
    video: visual ? 'on' : 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: external
    ? undefined
    : {
        command: process.env.CI ? 'npm run preview -- --port 4173 --strictPort' : 'npm run dev',
        port: process.env.CI ? 4173 : 5173,
        reuseExistingServer: !process.env.CI,
      },
})
