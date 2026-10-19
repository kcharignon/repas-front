// Ne jamais réduire une quantité déjà au panier (ticket M de l'audit du 2026-10-18, H14). Repas promet « je ne vide pas ton panier Leclerc » :
// la quantité d'un produit du plan est donc un PLANCHER de ce qu'on veut, jamais une valeur absolue vers le bas. Un produit déjà au panier
// en plus grande quantité que celle du plan reste tel quel, et la fin du passage le dit.
//
// La quantité déjà au panier est celle que la recherche vient de lire (`iQuantitePanier`, la plus récente). Quand la recherche ne la donne
// pas (champ absent ou illisible), la dernière réponse du panier sert de plancher (`RetailerAdapter.cartQuantity`) et la fin le signale :
// l'agent n'écrit alors pas plus bas que ce qu'il a su, mais ne peut pas jurer de ce que le panier contient.
import { LIMITS } from '../../protocol'
import type { Candidate, CartProductFacts, RetailerAdapter } from '../leclerc'

/** Ce que l'écran de fin doit dire d'une ligne à propos de la quantité déjà au panier. */
export type CartNote =
  /** Le panier avait plus que la quantité voulue (`wanted`) : `inCart` est gardé, rien n'a été écrit. */
  | { kind: 'KEPT'; wanted: number; inCart: number }
  /**
   * La recherche ne disait pas ce que le panier contenait. `inCart` est ce que la dernière réponse du panier en disait (un plancher), `null`
   * si elle n'en disait rien : alors la quantité voulue est écrite comme avant, sans garantie.
   */
  | { kind: 'UNREADABLE'; wanted: number; inCart: number | null }

/** Ce qui est resté au panier pour un produit voulu en `wanted` exemplaires. */
export interface Settled {
  /** La quantité au panier à présent : celle que le site a gardée après l'écriture, ou celle qui y était déjà quand rien n'a été écrit. */
  obtained: number
  /** Ce que l'écran de fin doit en dire, `null` quand rien n'est à signaler. */
  note: CartNote | null
  /** Ce que la réponse du panier dit de la disponibilité du produit (DRV-644), `null` quand rien n'a été écrit ou qu'elle n'en dit rien. */
  facts?: CartProductFacts | null
}

/**
 * Met `wanted` exemplaires de `seen` au panier, sans jamais en réduire la quantité : la quantité n'est écrite que si elle dépasse celle que
 * le panier a déjà (la plus récente lue : la recherche, à défaut la dernière réponse du panier). Une quantité qu'on ne peut pas atteindre
 * (plafond de 99, stock du produit) ne compte pas : l'écrire ne ferait que baisser le panier.
 *
 * @throws {LeclercError} l'erreur de l'adaptateur (`setCartQuantity`), à traiter par l'appelant.
 */
export async function putInCart(
  adapter: Pick<RetailerAdapter, 'cartQuantity' | 'setCartQuantity'>,
  seen: Candidate,
  wanted: number,
): Promise<Settled> {
  const readable = seen.inCart !== null
  const floor = readable ? seen.inCart : adapter.cartQuantity(seen.id)
  const reachable = Math.min(
    wanted,
    LIMITS.packsMax,
    seen.stock !== null && seen.stock > 0 ? seen.stock : wanted,
  )
  if (floor !== null && reachable <= floor) {
    return { obtained: floor, note: noteOf(readable, wanted, floor) }
  }
  const cart = await adapter.setCartQuantity(seen.id, wanted)
  return {
    obtained: cart.obtained,
    note: readable ? null : noteOf(false, wanted, floor),
    ...(cart.product && { facts: cart.product }),
  }
}

/** La mention d'une ligne : « conservé » si le panier avait plus et que la recherche le disait ; « illisible » si elle ne le disait pas. */
function noteOf(readable: boolean, wanted: number, floor: number | null): CartNote | null {
  if (!readable) return { kind: 'UNREADABLE', wanted, inCart: floor }
  return floor !== null && floor > wanted ? { kind: 'KEPT', wanted, inCart: floor } : null
}
