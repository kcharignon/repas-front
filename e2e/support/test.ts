// `test` de Playwright, avec une horloge figée HORS des saisons (ADR 0010, 0011, 0014, 0015, 0016) : la suite ne dépend jamais du jour où on la lance
// (la galette : du 6 janvier au 2 février ; la Saint-Valentin : du 7 au 14 février ; Pâques : trois semaines avant le dimanche de Pâques au lundi de Pâques ; l'été : du 21 juin au 31 août ; l'automne : du 1er septembre au 14 octobre ; Halloween : du 15 octobre au 1er novembre ; Noël : du 15 novembre
// au 5 janvier). Les specs importent `test` et `expect` d'ici.
// Un test de saison pose sa date avant d'ouvrir la page : `await page.clock.setSystemTime(IN_SEASON)`.
import { test as base } from '@playwright/test'

export * from '@playwright/test'

/** Le 15 juin 2026, midi, heure du navigateur. */
export const OFF_SEASON = new Date(2026, 5, 15, 12, 0, 0)
/** Le 27 octobre 2026, midi : en pleine saison. */
export const IN_SEASON = new Date(2026, 9, 27, 12, 0, 0)
/** Le 15 janvier 2027, midi : en pleine saison de la galette (du 6 janvier au 2 février). */
export const IN_GALETTE = new Date(2027, 0, 15, 12, 0, 0)
/** Le 12 février 2027, midi : en pleine saison de la Saint-Valentin (du 7 au 14 février). */
export const IN_VALENTIN = new Date(2027, 1, 12, 12, 0, 0)
/** Le 20 mars 2027, midi : en pleine saison de Pâques (le dimanche de Pâques 2027 est le 28 mars). */
export const IN_PAQUES = new Date(2027, 2, 20, 12, 0, 0)
/** Le 15 juillet 2027, midi : en pleine saison de l'été (du 21 juin au 31 août). */
export const IN_ETE = new Date(2027, 6, 15, 12, 0, 0)
/** Le 20 septembre 2027, midi : en pleine saison de l'automne (du 1er septembre au 14 octobre). */
export const IN_AUTOMNE = new Date(2027, 8, 20, 12, 0, 0)
/** Le 20 décembre 2026, midi : en pleine saison de Noël. */
export const IN_NOEL = new Date(2026, 11, 20, 12, 0, 0)

export const test = base.extend({
  // L'horloge s'écoule normalement après l'installation : seule la date de départ change.
  page: async ({ page }, use) => {
    await page.clock.install({ time: OFF_SEASON })
    await use(page)
  },
})
