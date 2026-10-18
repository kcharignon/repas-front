import type { ErrorCode, ResultLine, ResultMessage } from '@drive-protocol'

export interface ReturnCounts {
  added: number
  chosen: number
  haveAtHome: number
  skipped: number
  unavailable: number
  failed: number
  /** Lignes dont le prix a été lu pendant le passage. */
  priced: number
}

const hasPrice = (line: ResultLine): boolean =>
  (line.outcome === 'ADDED' && line.price !== undefined) ||
  (line.outcome === 'CHOSEN' && line.product.price !== undefined)

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
    priced: result.lines.filter(hasPrice).length,
  }
}

/** Les lignes à retenter : celles qui ont échoué (`FAILED`), avec leur code. */
export function failedLines(result: ResultMessage): { slug: string; error: ErrorCode }[] {
  return result.lines.flatMap((line) =>
    line.outcome === 'FAILED' ? [{ slug: line.ingredientSlug, error: line.error }] : [],
  )
}

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

/** « 1,89 € » : un prix en centimes entiers, tel que l'agent l'a lu. */
export const formatPrice = (cents: number): string => euros.format(cents / 100)
