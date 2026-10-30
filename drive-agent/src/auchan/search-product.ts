// Un produit de la page de résultats d'Auchan, interprété (DRV-724) : le `Candidate` que le passage, le diagnostic et l'écran de choix connaissent déjà
// (les mêmes TYPES que chez Leclerc), avec son identifiant d'offre. Les prix sont en CENTIMES (décision D22) ; le contenu net se déduit comme chez Leclerc
// (`retailers/content.ts`, `PackCalculator` ne change pas) ; un contenu illisible reste `null`, jamais deviné.
import { LIMITS } from '../../protocol'
import { photoUrl } from '../photo-url'
import { measureReference, parseContent } from '../retailers/content'
import type { Candidate, LocationLike, PricePerMeasure } from '../retailers/contract'
import { fold } from './page'
import type { AuchanOffer } from './offers'
import { PHOTO_RULE } from './photo-rule'
import type { PageProduct } from './search-page'

/** Les deux valeurs MESURÉES d'une offre du drive (DRV-714, B-1) : `data-seller-type` `GROCERY` et `data-offer-type` `DEFAULT`. Toute autre n'est pas mesurée. */
const MEASURED_SELLER_TYPE = 'GROCERY'
const MEASURED_OFFER_TYPE = 'DEFAULT'

/**
 * L'offre d'un produit telle que la page la donne, retenue par l'adaptateur pour l'ajout au panier (`rememberOffer`, DRV-725) : l'interface commune ne passe que
 * `productId` à `setCartQuantity`. Un champ que la page ne donne pas (absent, vide, contradictoire) n'est pas retenu : le panier prend alors sa valeur par défaut
 * (`GROCERY`, `DEFAULT`, vendeur vide), jamais une valeur lue ailleurs.
 */
export const offerOf = (product: PageProduct): AuchanOffer => ({
  offerId: product.offerId,
  ...(product.sellerType !== null && { sellerType: product.sellerType }),
  ...(product.offerType !== null && { offerType: product.offerType }),
  ...(product.sellerId !== null && { sellerId: product.sellerId }),
})

const cents = (euros: number): number => Math.round(euros * 100)

/**
 * Le produit est CLAIREMENT disponible au drive choisi : une offre du drive (vendeur `GROCERY`, offre `DEFAULT`), des microdonnées qui disent `InStock` (et
 * rien d'autre) ET la mention « Dans mon drive ». NON MESURÉ : toute valeur « indisponible » (jamais vue), les offres d'un autre vendeur, les promotions.
 * Tout ce qui n'est pas clairement disponible est indisponible, jamais deviné disponible.
 */
export function isClearlyAvailable(product: PageProduct): boolean {
  return (
    product.sellerType === MEASURED_SELLER_TYPE &&
    product.offerType === MEASURED_OFFER_TYPE &&
    product.availability.length > 0 &&
    product.availability.every((value) => value === 'instock') &&
    product.inDrive
  )
}

/** Le libellé du produit : la marque puis le nom (sans répéter la marque que le nom commence déjà par), borné à la limite des libellés du protocole. */
export function labelOf(product: PageProduct): string {
  const brand = product.brand
  const label =
    brand !== null && !fold(product.name).startsWith(fold(brand))
      ? `${brand} ${product.name}`
      : product.name
  return Array.from(label).slice(0, LIMITS.label).join('')
}

/** Le prix au kilo, au litre ou à la pièce, en centimes : seul le texte du prix (« 0,91 € / kg ») dit à quelle quantité il se rapporte. */
function pricePerMeasure(measure: PageProduct['measure']): PricePerMeasure | null {
  if (measure === null) return null
  const reference = measureReference(measure.text)
  if (!reference) return null
  const perBase = { g: 1000, ml: 1000, piece: 1 }[reference.unit]
  const unit = { g: 'kg', ml: 'l', piece: 'piece' }[reference.unit] as PricePerMeasure['unit']
  return { cents: Math.round((cents(measure.price) * perBase) / reference.value), unit }
}

/**
 * Le contenu net : la pastille (« 1kg ») confirmée par les prix ; à défaut de pastille, le nom (« Lait 6 x 1L ») ou les prix seuls. Une pastille que les
 * prix contredisent ne donne RIEN (on ne retombe pas sur le nom : il dirait la même chose).
 */
function contentOf(product: PageProduct): ReturnType<typeof parseContent> {
  const measure = { price: product.measure?.price ?? null, text: product.measure?.text ?? null }
  return parseContent(product.pastille ?? product.name, product.price, measure)
}

/**
 * Interprète un produit de la page. `stock` : `0` quand il n'est pas clairement disponible (c'est une ÉTIQUETTE, que la règle commune du passage tente une
 * fois et que le panier tranche), `null` sinon (la page ne donne pas de quantité en stock). L'EAN n'est PAS sur la page de résultats (B-3) : il n'est pas
 * dans le `Candidate` (DRV-725, l'ajout au panier).
 */
export function toCandidate(product: PageProduct, page: LocationLike | null = null): Candidate {
  const parsed = contentOf(product)
  return {
    id: product.productId,
    offerId: product.offerId,
    label: labelOf(product),
    label2: product.pastille,
    price: product.price === null ? null : cents(product.price),
    pricePerMeasure: pricePerMeasure(product.measure),
    promo: null,
    stock: isClearlyAvailable(product) ? null : 0,
    inCart: null,
    availability: null,
    comingSoon: false,
    aisle: null,
    family: null,
    imageUrl: photoUrl(product.image, PHOTO_RULE, page),
    content: parsed?.content ?? null,
    contentSource: parsed?.source ?? null,
  }
}
