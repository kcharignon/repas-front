// @vitest-environment node
// L'agent et l'écran de l'envoi de Repas disent la MÊME phrase de synthèse (DRV-626) : « 6 articles : 2 sont déjà choisis, 4 sont à choisir sur
// Leclerc. » Deux constructions (l'agent n'a pas vue-i18n et ne partage aucun code avec le front, ADR de l'agent), un seul texte : ce test les
// compare sur toutes les combinaisons de comptes, pluriels et accords compris.
import { describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'
import { summarySentence } from '../../../../drive-agent/src/ui/strings'
import { sendSummary } from '../sendSummary'

const t = i18n.global.t as unknown as Parameters<typeof sendSummary>[0]

const range = [0, 1, 2, 3, 7, 40]
const combinations = range.flatMap((known) =>
  range.flatMap((added) =>
    range.flatMap((haveAtHome) =>
      [0, 1, 2, 12].map((skipped) => ({ known, new: added, haveAtHome, skipped })),
    ),
  ),
)

describe('la phrase de synthèse : l’agent et Repas disent la même chose', () => {
  it('est identique, mot pour mot, pour toutes les combinaisons de comptes', () => {
    expect(combinations.length).toBeGreaterThan(800)

    const different = combinations
      .filter((counts) => summarySentence(counts) !== sendSummary(t, counts))
      .map(
        (counts) =>
          `${JSON.stringify(counts)} : agent « ${summarySentence(counts)} », Repas « ${sendSummary(t, counts)} »`,
      )

    expect(different).toEqual([])
  })

  it.each([
    [
      { known: 2, new: 4, haveAtHome: 0, skipped: 0 },
      '6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc.',
    ],
    [{ known: 1, new: 0, haveAtHome: 0, skipped: 0 }, '1 article : il est déjà choisi.'],
    [
      { known: 0, new: 3, haveAtHome: 0, skipped: 0 },
      '3 articles : tous sont à choisir sur Leclerc.',
    ],
    [
      { known: 3, new: 1, haveAtHome: 1, skipped: 1 },
      '6 articles : 3 sont déjà choisis, 1 est à choisir sur Leclerc, 2 ne seront pas mis au panier.',
    ],
    [{ known: 0, new: 0, haveAtHome: 2, skipped: 1 }, '3 articles : aucun ne sera mis au panier.'],
    [{ known: 0, new: 0, haveAtHome: 0, skipped: 0 }, ''],
  ])('%j donne « %s »', (counts, expected) => {
    expect(summarySentence(counts)).toBe(expected)
    expect(sendSummary(t, counts)).toBe(expected)
  })

  it('n’écrit jamais un zéro (un compteur à zéro ne se dit pas)', () => {
    for (const counts of combinations) {
      expect(summarySentence(counts)).not.toMatch(/(^|\D)0(\D|$)/)
    }
  })
})
