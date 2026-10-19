import { type Content, type ContentSource, measureReference, parseContent } from './content'
import { photoUrl } from '../photo-url'
import type { RawProduct } from './embedded'
import type { LocationLike } from './store'

/** Le prix à l'unité de mesure, en centimes, ramené au kilo, au litre ou à la pièce (les unités du protocole, décision D22). */
export interface PricePerMeasure {
  cents: number
  unit: 'kg' | 'l' | 'piece'
}

/** Un produit de la page de recherche, interprété. Les prix sont en **centimes** (décision D22). */
export interface Candidate {
  /** Identifiant du produit chez l'enseigne (`iIdProduit`), en texte. */
  id: string
  /** Libellé de la première ligne. */
  label: string
  /** Libellé de la seconde ligne (« 1 kg », « 6 x 33 cl »), s'il y en a un. */
  label2: string | null
  /** Prix unitaire TTC (`nrPVUnitaireTTC`). */
  price: number | null
  pricePerMeasure: PricePerMeasure | null
  /** Prix promotionnel, quand le site en donne un en euros. */
  promo: number | null
  /** `iQteDisponible` : 0 = indisponible, `null` = non lu. */
  stock: number | null
  /** `iQuantitePanier` : quantité déjà au panier. */
  inCart: number | null
  /**
   * L'adresse de la photo du produit (`sUrlVignetteProduit`, DRV-633), seulement si elle est affichable : `https` d'un hôte de `leclercdrive.fr`, sans
   * identifiant ni port (`photo-url.ts`). Sinon `null`. Elle ne sert qu'à l'écran de choix : elle n'est jamais envoyée à Repas.
   */
  imageUrl: string | null
  /** `eDisponibilite` (DRV-635) : l'étiquette de disponibilité du site, mesurée par le diagnostic, jamais un verrou. */
  availability: number | null
  /** La fiche dit « Bientôt disponible » (DRV-635). */
  comingSoon: boolean
  content: Content | null
  /** D'où vient `content` ; `prices` est le moins précis (prix arrondis au centime). */
  contentSource: ContentSource | null
}

/**
 * Le site dit ce produit en rupture : stock nul ou « Bientôt disponible » (DRV-635). C'est une ÉTIQUETTE, pas un verdict : le site ordinateur et
 * le site mobile ne disent pas la même chose du stock d'un même produit dans le même magasin ; seule la réponse du panier tranche.
 */
export const saysOutOfStock = (candidate: Pick<Candidate, 'stock' | 'comingSoon'>): boolean =>
  candidate.stock === 0 || candidate.comingSoon

const cents = (euros: number | null): number | null =>
  euros === null ? null : Math.round(euros * 100)

/** Seul le texte du prix (« 2,58 € / kg ») dit à quelle quantité se rapporte le prix par mesure ; sans lui, rien n'est deviné. */
function pricePerMeasure(raw: RawProduct): PricePerMeasure | null {
  const measure = cents(raw.measurePrice)
  const reference = measureReference(raw.measureText)
  if (measure === null || !reference) return null
  const perBase = { g: 1000, ml: 1000, piece: 1 }[reference.unit]
  const unit = { g: 'kg', ml: 'l', piece: 'piece' }[reference.unit] as PricePerMeasure['unit']
  return { cents: Math.round((measure * perBase) / reference.value), unit }
}

function promoCents(text: string | null): number | null {
  const found = text ? /(\d+(?:[.,]\d+)?)\s*€/.exec(text) : null
  return found?.[1] ? Math.round(Number(found[1].replace(',', '.')) * 100) : null
}

/** Interprète un produit brut de la page : prix en centimes, contenu net, photo sûre (`page` : l'emplacement de la page, pour une adresse relative). */
export function toCandidate(raw: RawProduct, page: LocationLike | null = null): Candidate {
  const parsed = parseContent(
    raw.label2,
    raw.unitPrice,
    { price: raw.measurePrice, text: raw.measureText },
    raw.structured,
  )
  return {
    id: raw.id,
    label: raw.label1 ?? '',
    label2: raw.label2,
    price: cents(raw.unitPrice),
    pricePerMeasure: pricePerMeasure(raw),
    promo: promoCents(raw.promoText),
    stock: raw.stock,
    inCart: raw.inCart,
    availability: raw.availability,
    comingSoon: raw.comingSoon,
    imageUrl: photoUrl(raw.thumbnail, page),
    content: parsed?.content ?? null,
    contentSource: parsed?.source ?? null,
  }
}
