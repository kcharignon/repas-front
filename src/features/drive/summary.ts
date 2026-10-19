import type { ResultLine, ResultMessage } from '@drive-protocol'

export interface ReturnCounts {
  added: number
  chosen: number
  haveAtHome: number
  skipped: number
  unavailable: number
  failed: number
}

/** Les compteurs que l'écran peut montrer. Les échecs se disent dans la phrase du récapitulatif, jamais en chiffre ; les prix lus ne se montrent pas. */
export const COUNT_KEYS = ['added', 'chosen', 'haveAtHome', 'skipped', 'unavailable'] as const
export type CountKey = (typeof COUNT_KEYS)[number]

/** Les compteurs du récapitulatif : une ligne du résultat compte pour une issue. */
export function countOutcomes(result: ResultMessage): ReturnCounts {
  const count = (outcome: ResultLine['outcome']) =>
    result.lines.filter((line) => line.outcome === outcome).length

  return {
    added: count('ADDED'),
    chosen: count('CHOSEN'),
    haveAtHome: count('HAVE_AT_HOME'),
    skipped: count('SKIPPED'),
    unavailable: count('UNAVAILABLE'),
    failed: count('FAILED'),
  }
}

/** Les compteurs à montrer : seulement ceux qui existent, jamais une ligne à zéro, dans l'ordre de l'écran. */
export const visibleCounts = (counts: ReturnCounts): { key: CountKey; value: number }[] =>
  COUNT_KEYS.flatMap((key) => (counts[key] > 0 ? [{ key, value: counts[key] }] : []))

/** Les articles qui devraient être au panier et n'y sont pas : en échec, ou sans produit disponible (ou restés sans choix). */
export const remaining = (counts: ReturnCounts): number => counts.failed + counts.unavailable

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

/** « 1,89 € » : un prix en centimes entiers, tel que l'agent l'a lu. */
export const formatPrice = (cents: number): string => euros.format(cents / 100)
