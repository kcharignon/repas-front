import { type Content, type ContentSource, measureReference, parseContent } from './content'
import type { RawProduct } from './embedded'

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
  /** Adresse de la vignette (`https://…` ou chemin), jamais un autre schéma. */
  thumbnailUrl: string | null
  content: Content | null
  /** D'où vient `content` ; `prices` est le moins précis (prix arrondis au centime). */
  contentSource: ContentSource | null
}

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

/** Une vignette n'est gardée que si c'est une adresse https ou un chemin du site : jamais `javascript:` ni `data:`. */
function safeUrl(url: string | null): string | null {
  return url !== null && /^(?:https:)?\/\/|^\/(?!\/)/i.test(url) ? url : null
}

/** Interprète un produit brut de la page : prix en centimes, contenu net, vignette sûre. */
export function toCandidate(raw: RawProduct): Candidate {
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
    thumbnailUrl: safeUrl(raw.thumbnail),
    content: parsed?.content ?? null,
    contentSource: parsed?.source ?? null,
  }
}
