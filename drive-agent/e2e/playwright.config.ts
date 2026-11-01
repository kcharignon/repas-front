import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Tests de bout en bout de l'agent du drive (DRV-309) : l'agent réel, dans Chromium mobile, contre le faux site Leclerc
// (`drive-agent/fake-leclerc/`) et le faux site Auchan (`drive-agent/fake-auchan/`, DRV-717). Pas de front ni de back : chaque test démarre son propre faux site sur un port libre.
// `make agent-e2e` (Docker) ou `npm run agent:e2e`.
//
// Le navigateur ne sort jamais du poste : le faux magasin `courses-test.leclercdrive.fr` (et, pour le test du site mobile, le faux
// `m-courses.leclercdrive.fr`, et pour l'entrée dans le magasin l'accueil `www.leclercdrive.fr`) est résolu vers 127.0.0.1 et TOUT autre nom d'hôte (sauf `localhost` et `127.0.0.1`) n'a pas d'adresse.
// Aucune requête ne peut atteindre une vraie enseigne.
const HOST_RULES = [
  'MAP courses-test.leclercdrive.fr 127.0.0.1',
  'MAP m-courses.leclercdrive.fr 127.0.0.1',
  // La version mobile (DRV-754) : le serveur du magasin et le compte, que `m-courses` et l'accueil appellent ou ouvrent
  'MAP fd8-courses.leclercdrive.fr 127.0.0.1',
  'MAP fd8-espace-client.leclercdrive.fr 127.0.0.1',
  // L'accueil de l'enseigne, où un plan s'ouvre (DRV-625)
  'MAP www.leclercdrive.fr 127.0.0.1',
  // Le faux site d'Auchan (DRV-717) : son hôte est celui du site, jamais `compte.auchan.fr` (aucun code de Repas n'y est injecté)
  'MAP www.auchan.fr 127.0.0.1',
  'MAP * ~NOTFOUND',
  'EXCLUDE localhost',
  'EXCLUDE 127.0.0.1',
].join(', ')

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: '../../test-results/agent-e2e',
  // Un passage réel prend du temps : l'agent attend 0,8 à 1,5 s entre deux requêtes (c'est ce que les tests vérifient).
  timeout: 90 * 1000,
  expect: { timeout: 20 * 1000 },
  fullyParallel: true,
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    process.env.CI ? ['github'] : ['list'],
    ['html', { open: 'never', outputFolder: '../../playwright-report/agent-e2e' }],
  ],
  use: {
    ...devices['Pixel 7'],
    serviceWorkers: 'block',
    launchOptions: { args: [`--host-resolver-rules=${HOST_RULES}`] },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
