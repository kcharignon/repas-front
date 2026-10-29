import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Bout en bout : le téléphone d'abord (la liste de courses se consulte en magasin), le bureau seulement là où il change le résultat.
//  - Projet `mobile` (Pixel 7) : tout ce qui n'est pas étiqueté `@bureau-seul`. C'est l'usage principal.
//  - Projet `chromium` (bureau) : seulement les tests étiquetés `@bureau` (la mise en page du bureau compte : tableau ou cartes, deux colonnes,
//    accessibilité d'un écran qui change à cette largeur : joués AUSSI sur le téléphone) ou `@bureau-seul` (le test fixe lui-même une largeur de
//    bureau : sur le téléphone il ne prouverait rien de plus). Les étiquettes sont dans e2e/support/test.ts. Un test sans étiquette n'est joué
//    qu'une fois : ne pas le doubler « au cas où », le doublon coûte autant qu'un test utile.
//  - `make e2e` (Docker) : E2E_BASE_URL vise le conteneur `front` ; le vrai back répond derrière son proxy.
//  - CI : on teste le build (`vite preview`) ; local sans Docker : le serveur de développement.
//  - `make e2e-offline` : le projet `offline` joue la lecture hors-ligne contre l'IMAGE DE PRODUCTION (E2E_PROD_URL), la seule
//    où le service worker existe ; les autres projets l'ignorent et bloquent les service workers (tests déterministes).
// E2E_VISUAL=1 garde une capture, une vidéo et une trace de chaque test dans le rapport.
const external = process.env.E2E_BASE_URL
const visual = Boolean(process.env.E2E_VISUAL)
const prod = process.env.E2E_PROD_URL
const offlineSpec = /offline\.spec\.ts/

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  // Le filet reste, mais un test qui en a besoin est un test à réparer : la CI le range en « flaky » dans son résumé.
  retries: process.env.CI ? 2 : 0,
  // Sans back, chaque test est isolé : l'API est simulée par `page.route`, la session est un indice posé par `addInitScript`, aucun état
  // ne passe d'un test à l'autre. Ils se répartissent donc un par un entre les processus (et entre les tranches de `--shard`).
  // Les tests contre le vrai back partagent un seul compte : un test à la fois (deux écritures simultanées sur la même
  // liste de courses s'écraseraient, ce que le contrôle de version du back, ADR 0016, empêchera une fois fusionné).
  fullyParallel: !external,
  workers: external ? 1 : process.env.CI ? 4 : undefined,
  reporter: [process.env.CI ? ['github'] : ['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external ?? (process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173'),
    trace: visual ? 'on' : 'on-first-retry',
    screenshot: visual ? 'on' : 'only-on-failure',
    video: visual ? 'on' : 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: prod
    ? [
        {
          name: 'offline',
          testMatch: offlineSpec,
          use: { ...devices['Pixel 7'], baseURL: prod, serviceWorkers: 'allow' },
        },
      ]
    : [
        {
          name: 'chromium',
          testIgnore: offlineSpec,
          grep: /@bureau/,
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'mobile',
          testIgnore: offlineSpec,
          grepInvert: /@bureau-seul/,
          use: { ...devices['Pixel 7'] },
        },
      ],
  webServer: external
    ? undefined
    : {
        command: process.env.CI ? 'npm run preview -- --port 4173 --strictPort' : 'npm run dev',
        port: process.env.CI ? 4173 : 5173,
        reuseExistingServer: !process.env.CI,
      },
})
