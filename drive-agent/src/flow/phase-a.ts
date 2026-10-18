// Phase A : une ligne dont l'utilisateur connaît déjà les produits. Les produits se prennent dans l'ordre de priorité : le premier qui
// est disponible est mis au panier, sans rien demander, avec ses propres `packs`. Jamais un produit refusé, jamais un produit absent de
// la liste (l'agent ne choisit pas seul un équivalent).
import {
  LIMITS,
  type NeededQuantity,
  type PlanLine,
  type PlanProduct,
  type ProductPrice,
  type ResultLine,
} from '../../protocol'
import type { Candidate, Content, RetailerAdapter } from '../leclerc'
import { packsFor } from './packs'
import { findKnownProduct } from './search-by-name'

/**
 * Le contenu lu en direct n'a pas donné le même nombre de produits que le plan (DRV-613) : le nombre calculé en direct a été mis au
 * panier à la place de `planned`.
 */
export interface ContentChange {
  /** Le nombre de produits du plan (calculé par Repas sur le contenu mémorisé). */
  planned: number
  /** Le nombre de produits calculé sur le contenu lu sur le site, mis au panier. */
  live: number
}

/**
 * Ce que la phase A décide d'une ligne : une issue finale, ou une attente de la phase B (les produits connus indisponibles).
 * `change` n'accompagne qu'une issue `ADDED` dont la quantité a été recalculée.
 */
export type Verdict =
  | { kind: 'done'; line: ResultLine; change?: ContentChange }
  | { kind: 'waiting'; unavailable: string[] }

/** Le prix lu pour Repas (décision D22) : unitaire TTC en centimes, et à l'unité de mesure quand le site la donne. */
export function priceOf(candidate: Candidate): ProductPrice | undefined {
  const inRange = (cents: number) => Number.isInteger(cents) && cents >= 0 && cents <= LIMITS.cents
  if (candidate.price === null || !inRange(candidate.price)) return undefined
  const measure = candidate.pricePerMeasure
  return measure !== null && inRange(measure.cents)
    ? { cents: candidate.price, perMeasure: { cents: measure.cents, unit: measure.unit } }
    : { cents: candidate.price }
}

/**
 * Le nombre de produits que donne le contenu lu en direct, ou `null` quand il ne se calcule pas : ni quantité demandée ni contenu lu,
 * contenu sans valeur, ou calcul que `packsFor` ne juge pas sûr (autre dimension que la quantité demandée, nombre de pièces inconnu).
 */
function livePacks(needed: NeededQuantity | undefined, content: Content | null): number | null {
  if (!needed || content === null || !(content.value > 0) || !Number.isFinite(content.value)) {
    return null
  }
  const { packs, status } = packsFor(needed, content)
  return status === 'COMPUTED' ? packs : null
}

export interface KnownLineDeps {
  adapter: RetailerAdapter
  /** L'écran « Quantité à vérifier » : le nombre choisi, ou `null` pour passer la ligne. */
  askQuantity: (line: PlanLine, product: PlanProduct) => Promise<number | null>
}

/**
 * Met au panier le premier produit disponible d'une ligne `KNOWN`. La disponibilité se lit dans la recherche par libellé (stock du
 * produit) ; si le libellé complet ne le retrouve pas, ses formes dérivées sont essayées une par une (`findKnownProduct`, au plus 4
 * requêtes de plus, ticket D) ; le produit introuvable après cela, ou à stock nul, est indisponible. Un produit que le panier refuse
 * (quantité obtenue nulle) l'est aussi. Chaque écriture est vérifiée par la réponse du panier : `quantity` est ce que le site a mis au panier.
 *
 * **Le contenu en direct fait foi** (DRV-613) : la fiche d'un produit est partagée entre les utilisateurs du magasin, son contenu
 * mémorisé peut être faux ou périmé. Quand le plan donne un nombre de produits sûr et que la recherche vient de montrer le contenu
 * du produit, le nombre est recalculé avec `packsFor` (comme en phase B) sur ce contenu et la quantité demandée (`needed`) ; s'il
 * diffère de celui du plan, c'est lui qui part au panier, et `change` le signale. Sans `needed`, sans contenu lisible ou sans calcul
 * sûr, rien ne change : le nombre du plan, ou la question à l'utilisateur quand il est à vérifier.
 *
 * @throws {LeclercError} l'erreur de l'adaptateur, à traiter par l'appelant (`BLOCKED`, `NOT_LOGGED_IN`, `NETWORK`…).
 */
export async function settleKnownLine(line: PlanLine, deps: KnownLineDeps): Promise<Verdict> {
  const products = line.products ?? []
  const refused = new Set((line.rejected ?? []).map((product) => product.id))
  const unavailable: string[] = []
  for (const [index, product] of products.entries()) {
    if (refused.has(product.id)) continue
    const seen = await findKnownProduct(deps.adapter, product.label, product.id)
    if (seen === null || seen.stock === 0) {
      unavailable.push(product.id)
      continue
    }
    const planned = product.packsStatus === 'TO_CHECK' ? null : (product.packs ?? null)
    const live = planned === null ? null : livePacks(line.needed, seen.content)
    const change = planned !== null && live !== null && live !== planned ? { planned, live } : null
    let packs = change ? change.live : planned
    if (packs === null) {
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
      ...(change && { change }),
    }
  }
  return { kind: 'waiting', unavailable }
}
