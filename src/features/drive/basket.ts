import type { ResultMessage } from '@drive-protocol'

/** Slugs par appel `POST /drive/plans/{id}/basket-lines` (borne du back : 1 à 1 000, distincts). */
export const MAX_BASKET_SLUGS = 1000

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
    .filter((line) => line.outcome === 'ADDED' || (line.outcome === 'CHOSEN' && !line.notInCart))
    .map((line) => line.ingredientSlug)

  return [...new Set(slugs)]
}

/** Découpe en appels d'au plus `MAX_BASKET_SLUGS` slugs (improbable : une liste a rarement mille articles). */
export function basketBatches(slugs: readonly string[]): string[][] {
  const batches: string[][] = []
  for (let index = 0; index < slugs.length; index += MAX_BASKET_SLUGS)
    batches.push(slugs.slice(index, index + MAX_BASKET_SLUGS))

  return batches
}
