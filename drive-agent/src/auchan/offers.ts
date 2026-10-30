// L'offre d'un produit chez Auchan (DRV-725). Un produit a DEUX identifiants (DRV-715 § 2 point 3) : `productId` et `offerId` (l'offre du produit dans le
// magasin, nécessaire à l'ajout au panier). L'interface commune `setCartQuantity(productId, quantity)` ne porte que le premier : l'offre est donc MÉMORISÉE
// quand la recherche (DRV-724) lit le produit (`AuchanAdapter.rememberOffer`) ; à défaut, elle se lit sur la ligne du panier si elle y est déjà. Jamais
// devinée : sans offre connue, l'écriture est refusée (`CART_OFFER_UNKNOWN`).
import { STORES } from '../../protocol'

/**
 * L'offre telle que la page de résultats la donne (`data-offer-id`, `data-seller-type`, `data-offer-type`, `data-seller-id`, B-1 mesurés). **SUPPOSÉ, non mesuré** :
 * que le corps de l'écriture reprenne ces valeurs telles quelles (`sellerType`, `desiredType`, `sellerId`) ; les valeurs par défaut sont celles de la page
 * de résultats vue le 2026-10-30 (`GROCERY`, `DEFAULT`, vide).
 */
export interface AuchanOffer {
  offerId: string
  sellerType?: string
  offerType?: string
  sellerId?: string
}

export const DEFAULT_SELLER_TYPE = 'GROCERY'
export const DEFAULT_OFFER_TYPE = 'DEFAULT'

/** Combien de produits la mémoire garde : une liste de courses en a des dizaines ; au-delà, les plus anciens sont oubliés. */
const MAX_OFFERS = 500

/** Un mot court d'une liste de valeurs de la page (`GROCERY`, `DEFAULT`) : des majuscules et des tirets bas, jamais autre chose. */
const WORD = /^[A-Z_]{1,32}$/

/** L'identifiant d'un vendeur : un UUID, ou vide (B-1 : `data-seller-id` vide sur la page de résultats). */
const SELLER_ID = /^(?:[0-9a-f-]{36})?$/

/** Les offres connues, par identifiant de produit. Une `Map` : l'identifiant vient de la page. */
export class OfferBook {
  private readonly offers = new Map<string, AuchanOffer>()

  /** Retient l'offre d'un produit si les deux identifiants ont la forme d'Auchan ; sinon ne retient rien et rend `false`. */
  remember(productId: string, offer: AuchanOffer): boolean {
    if (!STORES.auchan.productId.test(productId)) return false
    const offerRule = STORES.auchan.offerId
    if (offerRule === null || !offerRule.test(offer.offerId)) return false
    const clean: AuchanOffer = {
      offerId: offer.offerId,
      ...(offer.sellerType !== undefined &&
        WORD.test(offer.sellerType) && { sellerType: offer.sellerType }),
      ...(offer.offerType !== undefined &&
        WORD.test(offer.offerType) && { offerType: offer.offerType }),
      ...(offer.sellerId !== undefined &&
        SELLER_ID.test(offer.sellerId) && { sellerId: offer.sellerId }),
    }
    this.offers.delete(productId)
    this.offers.set(productId, clean)
    if (this.offers.size > MAX_OFFERS) {
      const oldest = this.offers.keys().next()
      if (!oldest.done) this.offers.delete(oldest.value)
    }
    return true
  }

  get(productId: string): AuchanOffer | null {
    return this.offers.get(productId) ?? null
  }
}
