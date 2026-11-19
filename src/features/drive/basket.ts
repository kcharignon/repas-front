import type { ResultLine, ResultMessage } from '@drive-protocol'

/** Slugs par appel `POST /drive/plans/{id}/basket-lines` (borne du back : 1 à 1 000, distincts). */
export const MAX_BASKET_SLUGS = 1000

/**
 * Un produit CHOISI que le panier n'a pas pris (DRV-750) : la même règle que `unreached` de l'agent (une ligne `CHOSEN` avec `notInCart`) ; sans la clé,
 * comme chez les agents d'avant, le produit est au panier.
 */
export const isNotInCart = (line: ResultLine): boolean =>
  line.outcome === 'CHOSEN' && line.notInCart === true

/** Le nombre de produits choisis que le panier n'a pas pris : le titre d'un envoi terminé en dépend (DRV-750). */
export const notInCartCount = (result: ResultMessage): number =>
  result.lines.filter(isNotInCart).length

/**
 * Les articles que le passage a RÉELLEMENT mis au panier, ceux que Repas coche dans la liste (DRV-747) : une ligne `ADDED` (toujours au panier)
 * et une ligne `CHOSEN` sans `notInCart` (la clé dit que le panier n'a rien pris du produit choisi ; absente, comme chez les agents d'avant : au
 * panier). « J'en ai toujours », « Pas cette fois », un produit introuvable ou en échec restent non cochés : ce sont les articles manquants.
 *
 * Le résultat doit déjà avoir été recoupé avec le plan envoyé (`restrictToPlan`, DRV-614) : un faux résultat ne coche que des lignes que le plan explique.
 * Sans doublon (le back refuse deux fois le même slug), dans l'ordre du résultat.
 */
export function basketSlugsOf(result: ResultMessage): string[] {
  const slugs = result.lines
    .filter((line) => line.outcome === 'ADDED' || (line.outcome === 'CHOSEN' && !isNotInCart(line)))
    .map((line) => line.ingredientSlug)

  return [...new Set(slugs)]
}

/** Ce qui est arrivé à une ligne que le passage n'a PAS mise au panier (le `notAdded` de `POST /drive/plans/{id}/basket-lines`, journal du back, ADR 0041). */
export type NotAddedOutcome = 'NOT_IN_CART' | 'UNAVAILABLE' | 'SKIPPED' | 'HAVE_AT_HOME' | 'FAILED'

export interface NotAddedLine {
  ingredientSlug: string
  outcome: NotAddedOutcome
  /** Le code de l'erreur de l'agent (`BLOCKED`, `NETWORK`…), seulement avec `FAILED` : jamais un libellé ni un morceau de page. */
  reason?: string
}

/**
 * Ce que le passage n'a PAS mis au panier, avec ce qui est arrivé à chaque ligne : un produit choisi que le panier n'a pas pris (`NOT_IN_CART`, le drive l'a
 * refusé), un produit introuvable, « Pas cette fois », « J'en ai toujours », un échec (avec le code de l'erreur). Le back le garde sur la ligne pour comprendre
 * la liste après coup ; rien ne s'appuie dessus et la ligne reste décochée. Même règle que `basketSlugsOf` : un ingrédient au panier n'est jamais dedans, une seule
 * entrée par ingrédient (la première), dans l'ordre du résultat. Le résultat doit déjà avoir été recoupé avec le plan envoyé (`restrictToPlan`).
 */
export function notAddedOf(result: ResultMessage): NotAddedLine[] {
  const inCart = new Set(basketSlugsOf(result))
  const lines = new Map<string, NotAddedLine>()
  for (const line of result.lines) {
    if (inCart.has(line.ingredientSlug) || lines.has(line.ingredientSlug)) continue
    const entry = notAddedLineOf(line)
    if (entry !== null) lines.set(line.ingredientSlug, entry)
  }

  return [...lines.values()]
}

function notAddedLineOf(line: ResultLine): NotAddedLine | null {
  switch (line.outcome) {
    case 'ADDED':
      return null
    case 'CHOSEN':
      return line.notInCart === true
        ? { ingredientSlug: line.ingredientSlug, outcome: 'NOT_IN_CART' }
        : null
    case 'FAILED':
      return { ingredientSlug: line.ingredientSlug, outcome: 'FAILED', reason: line.error }
    case 'UNAVAILABLE':
    case 'SKIPPED':
    case 'HAVE_AT_HOME':
      return { ingredientSlug: line.ingredientSlug, outcome: line.outcome }
  }
}

/** Ce que le passage a fait des lignes, tel que le back le reçoit : les articles au panier (leurs lignes sont cochées) et les autres, avec leur issue. */
export interface BasketReport {
  slugs: string[]
  notAdded: NotAddedLine[]
}

export const basketReportOf = (result: ResultMessage): BasketReport => ({
  slugs: basketSlugsOf(result),
  notAdded: notAddedOf(result),
})

/** Vrai quand il n'y a rien à rapporter : un arrêt avant la moindre ligne. Le back refuse un rapport sans aucune ligne. */
export const isEmptyReport = (report: BasketReport): boolean =>
  report.slugs.length === 0 && report.notAdded.length === 0

/** Découpe en appels d'au plus `MAX_BASKET_SLUGS` slugs (improbable : une liste a rarement mille articles). */
export function basketBatches(slugs: readonly string[]): string[][] {
  const batches: string[][] = []
  for (let index = 0; index < slugs.length; index += MAX_BASKET_SLUGS)
    batches.push(slugs.slice(index, index + MAX_BASKET_SLUGS))

  return batches
}
