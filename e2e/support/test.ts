// `test` de Playwright, avec une horloge figée HORS des saisons d'Halloween et de Noël (ADR 0010, 0011) : la suite ne dépend jamais
// du jour où on la lance (les thèmes saisonniers courent du 15 octobre au 1er novembre et du 15 novembre au 5 janvier). Les specs importent `test` et `expect` d'ici.
// Un test de saison pose sa date avant d'ouvrir la page : `await page.clock.setSystemTime(IN_SEASON)`.
import { test as base } from '@playwright/test'

export * from '@playwright/test'

/** Le 15 juin 2026, midi, heure du navigateur. */
export const OFF_SEASON = new Date(2026, 5, 15, 12, 0, 0)
/** Le 27 octobre 2026, midi : en pleine saison. */
export const IN_SEASON = new Date(2026, 9, 27, 12, 0, 0)
/** Le 20 décembre 2026, midi : en pleine saison de Noël. */
export const IN_NOEL = new Date(2026, 11, 20, 12, 0, 0)

export const test = base.extend({
  // L'horloge s'écoule normalement après l'installation : seule la date de départ change.
  page: async ({ page }, use) => {
    await page.clock.install({ time: OFF_SEASON })
    await use(page)
  },
})
