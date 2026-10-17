// Phase A : une ligne dont l'utilisateur connaît déjà les produits. Les produits se prennent dans l'ordre de priorité : le premier qui
// est disponible est mis au panier, sans rien demander, avec ses propres `packs`. Jamais un produit refusé, jamais un produit absent de
// la liste (l'agent ne choisit pas seul un équivalent).
import {
  LIMITS,
  type PlanLine,
  type PlanProduct,
  type ProductPrice,
  type ResultLine,
} from '../../protocol'
import type { Candidate, RetailerAdapter } from '../leclerc'

/** Ce que la phase A décide d'une ligne : une issue finale, ou une attente de la phase B (les produits connus indisponibles). */
export type Verdict =
  { kind: 'done'; line: ResultLine } | { kind: 'waiting'; unavailable: string[] }

/** Le prix lu pour Repas (décision D22) : unitaire TTC en centimes, et à l'unité de mesure quand le site la donne. */
export function priceOf(candidate: Candidate): ProductPrice | undefined {
  const inRange = (cents: number) => Number.isInteger(cents) && cents >= 0 && cents <= LIMITS.cents
  if (candidate.price === null || !inRange(candidate.price)) return undefined
  const measure = candidate.pricePerMeasure
  return measure !== null && inRange(measure.cents)
    ? { cents: candidate.price, perMeasure: { cents: measure.cents, unit: measure.unit } }
    : { cents: candidate.price }
}

export interface KnownLineDeps {
  adapter: RetailerAdapter
  /** L'écran « Quantité à vérifier » : le nombre choisi, ou `null` pour passer la ligne. */
  askQuantity: (line: PlanLine, product: PlanProduct) => Promise<number | null>
}

/**
 * Met au panier le premier produit disponible d'une ligne `KNOWN`. La disponibilité se lit dans la recherche par libellé (stock du
 * produit) ; le produit introuvable ou à stock nul est indisponible. Un produit que le panier refuse (quantité obtenue nulle) l'est
 * aussi. Chaque écriture est vérifiée par la réponse du panier : `quantity` est ce que le site a mis au panier.
 *
 * @throws {LeclercError} l'erreur de l'adaptateur, à traiter par l'appelant (`BLOCKED`, `NOT_LOGGED_IN`, `NETWORK`…).
 */
export async function settleKnownLine(line: PlanLine, deps: KnownLineDeps): Promise<Verdict> {
  const products = line.products ?? []
  const refused = new Set((line.rejected ?? []).map((product) => product.id))
  const unavailable: string[] = []
  for (const [index, product] of products.entries()) {
    if (refused.has(product.id)) continue
    const seen = await deps.adapter.readProductFromSearch(product.label, product.id)
    if (seen === null || seen.stock === 0) {
      unavailable.push(product.id)
      continue
    }
    let packs = product.packs ?? null
    if (packs === null || product.packsStatus === 'TO_CHECK') {
      packs = await deps.askQuantity(line, product)
      if (packs === null)
        return { kind: 'done', line: { ingredientSlug: line.ingredientSlug, outcome: 'SKIPPED' } }
    }
    const cart = await deps.adapter.setCartQuantity(product.id, packs)
    if (cart.obtained < 1) {
      unavailable.push(product.id)
      continue
    }
    const price = priceOf(seen)
    return {
      kind: 'done',
      line: {
        ingredientSlug: line.ingredientSlug,
        outcome: 'ADDED',
        productId: product.id,
        quantity: Math.min(cart.obtained, LIMITS.packsMax),
        usedRank: index + 1,
        ...(unavailable.length > 0 && { unavailableIds: unavailable }),
        ...(price && { price }),
      },
    }
  }
  return { kind: 'waiting', unavailable }
}
