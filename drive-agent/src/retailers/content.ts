// Contenu net d'un produit (neutre, il sert à toute enseigne : DRV-724), ramené à une unité de base (g, ml ou pièce). Il se déduit de trois sources, dans cet ordre de confiance :
//   1. les champs structurés du site (`sUniteMesure`, `nrContenanceUnitaire`, `nrContenanceTotale`), quand ils existent ;
//   2. le libellé de seconde ligne (« 1 kg », « 6 x 125 g », « lot de 4 ») ;
//   3. le prix unitaire divisé par le prix à l'unité de mesure (1,29 € ÷ 2,58 €/kg = 0,5 kg).
// Règle absolue : `null` plutôt qu'une valeur fausse. Un libellé ambigu, ou qui contredit les prix, ne donne rien.
import { own } from '../own'

/** Le contenu net structuré que l'enseigne joint à un produit, quand elle en donne un (relevé DRV-007 chez Leclerc) ; chaque champ est `null` s'il manque. */
export interface StructuredContent {
  /** L'unité de mesure du contenu unitaire (« KG »). */
  unitMeasure: string | null
  /** Le contenu unitaire. */
  unitContent: number | null
  /** Le contenu total. */
  totalContent: number | null
  /** L'unité du contenu total (« kg »). */
  totalUnit: string | null
}

/** Les unités de base du contenu net ; ce sont des unités du protocole. */
export type BaseUnit = 'g' | 'ml' | 'piece'

export interface Content {
  value: number
  unit: BaseUnit
}

/** D'où vient le contenu : les champs du site, le libellé ou les prix (le moins précis : les prix sont arrondis au centime). */
export type ContentSource = 'structured' | 'label' | 'prices'

const FACTORS: Record<string, Content> = {
  kg: { value: 1000, unit: 'g' },
  kilo: { value: 1000, unit: 'g' },
  kilos: { value: 1000, unit: 'g' },
  g: { value: 1, unit: 'g' },
  gr: { value: 1, unit: 'g' },
  gramme: { value: 1, unit: 'g' },
  grammes: { value: 1, unit: 'g' },
  mg: { value: 0.001, unit: 'g' },
  l: { value: 1000, unit: 'ml' },
  litre: { value: 1000, unit: 'ml' },
  litres: { value: 1000, unit: 'ml' },
  dl: { value: 100, unit: 'ml' },
  cl: { value: 10, unit: 'ml' },
  ml: { value: 1, unit: 'ml' },
}

const UNIT = '(kg|kilos?|mg|grammes?|gr|g|litres?|l|cl|dl|ml)'
const NUMBER = '(\\d+(?:\\.\\d+)?)'
const PACK_THEN_UNIT = new RegExp(`(?<![a-z\\d.])(\\d+)\\s*x\\s*${NUMBER}\\s*${UNIT}(?![a-z])`)
const UNIT_THEN_PACK = new RegExp(`(?<![a-z\\d.])${NUMBER}\\s*${UNIT}\\s*x\\s*(\\d+)(?!\\d)`)
const AMOUNT = new RegExp(`(?<![a-z\\d.])${NUMBER}\\s*${UNIT}(?![a-z])`, 'g')
const PIECES_AFTER =
  /(?<![a-z\d.])(\d+)\s*(?:pi[eè]ces?|pcs?|oeufs?|sachets?|tranches?|unit[eé]s?|capsules?|dosettes?|rouleaux?|portions?|bouteilles?|bo[iî]tes?|canettes?|pots?|yaourts?|barquettes?)(?![a-z])/
const PIECES_BEFORE =
  /(?:lot de|bo[iî]te de|sachet de|barquette de|pack de|(?<![a-z])x)\s*(\d+)(?!\d)/
/** Un poids ou un volume approximatif ou variable : pas un contenu net sûr. */
const HEDGE = /(?<![a-z])(?:environ|env|approx|vrac|variable|selon|à partir)(?![a-z])|~/

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function convert(amount: number, unit: string): Content | null {
  const factor = own(FACTORS, unit)
  return factor ? { value: round(amount * factor.value), unit: factor.unit } : null
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[×*]/g, 'x')
    .replace(/œ/g, 'oe')
    .replace(/[\s  ]+/g, ' ')
}

/**
 * Contenu net lu dans un libellé (« Lait demi-écrémé 6 x 1 L » donne 6000 ml). `null` si rien n'est reconnu, ou si le libellé est
 * ambigu : plusieurs quantités différentes, un nombre de pièces à côté d'un poids (« 3 yaourts 125 g » : 125 g est-il le total ?),
 * ou un poids approximatif.
 */
export function contentFromLabel(label: string | null | undefined): Content | null {
  if (!label) return null
  const text = normalize(label)
  if (HEDGE.test(text)) return null

  const packFirst = PACK_THEN_UNIT.exec(text)
  if (packFirst?.[1] && packFirst[2] && packFirst[3]) {
    return convert(Number(packFirst[1]) * Number(packFirst[2]), packFirst[3])
  }
  const unitFirst = UNIT_THEN_PACK.exec(text)
  if (unitFirst?.[1] && unitFirst[2] && unitFirst[3]) {
    return convert(Number(unitFirst[1]) * Number(unitFirst[3]), unitFirst[2])
  }

  const pieces = PIECES_AFTER.exec(text) ?? PIECES_BEFORE.exec(text)
  const amounts = [...text.matchAll(AMOUNT)].map((found) =>
    convert(Number(found[1]), found[2] ?? ''),
  )
  if (amounts.length > 0) {
    const [first] = amounts
    const same = amounts.every(
      (amount) => amount?.unit === first?.unit && amount?.value === first?.value,
    )
    return same && first && !pieces ? first : null
  }
  return pieces?.[1] ? { value: Number(pieces[1]), unit: 'piece' } : null
}

const MEASURE_UNIT = UNIT.slice(1, -1)
const MEASURE_WITH_MARK = new RegExp(
  `(?:/|\\ble\\b|\\bla\\b|\\bles\\b|\\bau\\b|\\bpar\\b|\\bpour\\b)\\s*${NUMBER}?\\s*(${MEASURE_UNIT}|pi[eè]ces?|unit[eé]s?|u)(?![a-z])`,
)
const MEASURE_ANYWHERE = new RegExp(
  `(?<![a-z\\d.])${NUMBER}?\\s*(kg|kilos?|litres?|l|g|ml|cl)(?![a-z])`,
)

/** Quantité à laquelle se rapporte le prix par unité de mesure (« 2,58 €/kg » : 1000 g ; « 0,99 € les 100 g » : 100 g). */
export function measureReference(text: string | null | undefined): Content | null {
  if (!text) return null
  const found = MEASURE_WITH_MARK.exec(normalize(text)) ?? MEASURE_ANYWHERE.exec(normalize(text))
  if (!found?.[2]) return null
  const amount = found[1] ? Number(found[1]) : 1
  if (/^(pi[eè]ce|unit[eé]|u)/.test(found[2])) return { value: amount, unit: 'piece' }
  return convert(amount, found[2])
}

/** Les prix sont arrondis au centime : au-delà de cette erreur relative, la division ne dit rien de sûr. */
const MAX_PRICE_ERROR = 0.03

/** Un contenu déduit des prix est arrondi au multiple de 5 (à partir de 50) : l'erreur d'arrondi des prix n'a rien d'une précision. */
function snap(value: number): number {
  return value >= 50 ? Math.round(value / 5) * 5 : Math.round(value)
}

/** Contenu net déduit des prix : prix unitaire ÷ prix par unité de mesure × quantité de référence ; `null` si l'erreur d'arrondi est trop grande. */
export function contentFromPrices(
  unitPrice: number | null,
  measurePrice: number | null,
  measureText: string | null,
): Content | null {
  if (unitPrice === null || measurePrice === null || unitPrice <= 0 || measurePrice <= 0)
    return null
  const reference = measureReference(measureText)
  if (!reference) return null
  const error = 0.005 / unitPrice + 0.005 / measurePrice
  if (error > MAX_PRICE_ERROR) return null
  return { value: snap((unitPrice / measurePrice) * reference.value), unit: reference.unit }
}

const PIECE_UNITS = new Set([
  'u',
  'p',
  'pc',
  'pce',
  'piece',
  'pieces',
  'pièce',
  'pièces',
  'unite',
  'unité',
  'unites',
  'unités',
])

function fromAmount(amount: number | null, unit: string | null): Content | null {
  if (amount === null || unit === null || amount <= 0) return null
  const key = unit.trim().toLowerCase()
  if (PIECE_UNITS.has(key)) return { value: round(amount), unit: 'piece' }
  return convert(amount, key)
}

/**
 * Contenu net lu dans les champs structurés du produit : le total (`nrContenanceTotale`, dans `sUniteMesureTotale` ou à défaut
 * `sUniteMesure`), à défaut l'unitaire. `null` si le produit n'en porte pas ou si l'unité est inconnue.
 */
export function contentFromStructured(fields: StructuredContent | undefined): Content | null {
  if (!fields) return null
  return (
    fromAmount(fields.totalContent, fields.totalUnit ?? fields.unitMeasure) ??
    fromAmount(fields.unitContent, fields.unitMeasure ?? fields.totalUnit)
  )
}

/** Les deux méthodes s'accordent à 5 % près (les prix sont arrondis au centime). */
function agree(a: Content, b: Content): boolean {
  return a.unit === b.unit && Math.abs(a.value - b.value) <= Math.max(a.value, b.value) * 0.05
}

/**
 * Contenu net d'un produit de la page de recherche : les champs structurés s'ils existent, sinon le libellé de seconde ligne
 * confirmé par les prix, sinon l'une des deux méthodes seule. Un libellé qui contredit les prix ne donne rien.
 */
export function parseContent(
  label2: string | null,
  unitPrice: number | null,
  measure: { price: number | null; text: string | null },
  structured?: StructuredContent,
): { content: Content; source: ContentSource } | null {
  const site = contentFromStructured(structured)
  if (site) return { content: site, source: 'structured' }
  const byLabel = contentFromLabel(label2)
  const byPrices = contentFromPrices(unitPrice, measure.price, measure.text)
  if (byLabel && byPrices)
    return agree(byLabel, byPrices) ? { content: byLabel, source: 'label' } : null
  if (byLabel) return { content: byLabel, source: 'label' }
  return byPrices ? { content: byPrices, source: 'prices' } : null
}
