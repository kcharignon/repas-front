// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Contenu net d'un produit, déduit de deux façons pour les comparer (essai 10) :
//   1. le libellé de seconde ligne (« 1 kg », « 6 x 33 cl »…) ;
//   2. le prix unitaire divisé par le prix par unité de mesure (1,29 € ÷ 2,58 €/kg = 0,5 kg).
// Et, quand le site les donne, 3. les champs structurés `sUniteMesure`, `nrContenanceUnitaire`, `nrContenanceTotale`.
// Résultats ramenés à une unité de base : g (masse), ml (volume) ou u (pièces).
import type { StructuredContent } from './parse'

export type ContentUnit = 'g' | 'ml' | 'u'

export interface Content {
  value: number
  unit: ContentUnit
}

const FACTORS: Record<string, Content> = {
  kg: { value: 1000, unit: 'g' },
  kilo: { value: 1000, unit: 'g' },
  kilos: { value: 1000, unit: 'g' },
  g: { value: 1, unit: 'g' },
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

const UNIT = '(kg|kilos?|mg|grammes?|g|litres?|l|cl|dl|ml)'
const NUMBER = '(\\d+(?:\\.\\d+)?)'
const PACK_THEN_UNIT = new RegExp(`(?<![a-z\\d.])(\\d+)\\s*x\\s*${NUMBER}\\s*${UNIT}(?![a-z])`)
const UNIT_THEN_PACK = new RegExp(`(?<![a-z\\d.])${NUMBER}\\s*${UNIT}\\s*x\\s*(\\d+)(?!\\d)`)
const SINGLE = new RegExp(`(?<![a-z\\d.])${NUMBER}\\s*${UNIT}(?![a-z])`)
const PIECES_AFTER =
  /(?<![a-z\d.])(\d+)\s*(?:pi[eè]ces?|pcs?|oeufs?|sachets?|tranches?|unit[eé]s?|capsules?|dosettes?|rouleaux?|portions?|bouteilles?|bo[iî]tes?|canettes?)(?![a-z])/
const PIECES_BEFORE =
  /(?:lot de|bo[iî]te de|sachet de|barquette de|pack de|(?<![a-z])x)\s*(\d+)(?!\d)/

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function convert(amount: number, unit: string): Content | null {
  const factor = FACTORS[unit]
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

/** Contenu net lu dans un libellé (« Lait demi-écrémé 6 x 1 L » donne 6000 ml). `null` si rien n'est reconnu. */
export function contentFromLabel(label: string | null | undefined): Content | null {
  if (!label) return null
  const text = normalize(label)

  const packFirst = PACK_THEN_UNIT.exec(text)
  if (packFirst?.[1] && packFirst[2] && packFirst[3]) {
    return convert(Number(packFirst[1]) * Number(packFirst[2]), packFirst[3])
  }
  const unitFirst = UNIT_THEN_PACK.exec(text)
  if (unitFirst?.[1] && unitFirst[2] && unitFirst[3]) {
    return convert(Number(unitFirst[1]) * Number(unitFirst[3]), unitFirst[2])
  }
  const single = SINGLE.exec(text)
  if (single?.[1] && single[2]) return convert(Number(single[1]), single[2])

  const pieces = PIECES_AFTER.exec(text) ?? PIECES_BEFORE.exec(text)
  if (pieces?.[1]) return { value: Number(pieces[1]), unit: 'u' }
  return null
}

const MEASURE_WITH_MARK = new RegExp(
  `(?:/|\\ble\\b|\\bla\\b|\\bles\\b|\\bau\\b|\\bpar\\b|\\bpour\\b)\\s*${NUMBER}?\\s*(${UNIT.slice(1, -1)}|pi[eè]ces?|unit[eé]s?|u)(?![a-z])`,
)
const MEASURE_ANYWHERE = new RegExp(
  `(?<![a-z\\d.])${NUMBER}?\\s*(kg|kilos?|litres?|l|g|ml|cl)(?![a-z])`,
)

/** Quantité à laquelle se rapporte le prix par unité de mesure (« 2,58 €/kg » : 1000 g). */
export function measureReference(text: string | null | undefined): Content | null {
  if (!text) return null
  const normalized = normalize(text)
  const found = MEASURE_WITH_MARK.exec(normalized) ?? MEASURE_ANYWHERE.exec(normalized)
  if (!found?.[2]) return null
  const amount = found[1] ? Number(found[1]) : 1
  if (/^(pi[eè]ce|unit[eé]|u)/.test(found[2])) return { value: amount, unit: 'u' }
  return convert(amount, found[2])
}

/** Contenu net déduit des prix : prix unitaire ÷ prix par unité de mesure × quantité de référence. */
export function contentFromPrices(
  unitPrice: number | null,
  measurePrice: number | null,
  measureText: string | null,
): Content | null {
  if (unitPrice === null || measurePrice === null || unitPrice <= 0 || measurePrice <= 0)
    return null
  const reference = measureReference(measureText)
  if (!reference) return null
  return { value: round((unitPrice / measurePrice) * reference.value), unit: reference.unit }
}

export type Agreement = 'accord' | 'écart' | 'une seule méthode' | 'aucune'

/** Les deux méthodes s'accordent à 5 % près (les prix sont arrondis au centime). */
export function compareContents(byLabel: Content | null, byPrices: Content | null): Agreement {
  if (!byLabel && !byPrices) return 'aucune'
  if (!byLabel || !byPrices) return 'une seule méthode'
  if (byLabel.unit !== byPrices.unit) return 'écart'
  const gap = Math.abs(byLabel.value - byPrices.value)
  return gap <= Math.max(byLabel.value, byPrices.value) * 0.05 ? 'accord' : 'écart'
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
  if (amount === null || unit === null) return null
  const key = unit.trim().toLowerCase()
  if (PIECE_UNITS.has(key)) return { value: round(amount), unit: 'u' }
  return convert(amount, key)
}

export interface StructuredReading {
  /** `nrContenanceUnitaire` dans l'unité `sUniteMesure`. */
  unit: Content | null
  /** `nrContenanceTotale` dans l'unité `sUniteMesureTotale` (à défaut `sUniteMesure`). */
  total: Content | null
  /** Le contenu net retenu pour la comparaison : le total, à défaut l'unitaire. */
  best: Content | null
}

/** Contenu net lu dans les champs structurés du produit ; `null` partout si le produit n'en porte pas. */
export function contentFromStructured(fields: StructuredContent | undefined): StructuredReading {
  if (!fields) return { unit: null, total: null, best: null }
  const unit = fromAmount(fields.unitContent, fields.unitMeasure ?? fields.totalUnit)
  const total = fromAmount(fields.totalContent, fields.totalUnit ?? fields.unitMeasure)
  return { unit, total, best: total ?? unit }
}

export function formatContent(content: Content | null): string {
  if (!content) return '—'
  const value = String(content.value).replace('.', ',')
  return content.unit === 'u' ? `${value} pièce(s)` : `${value} ${content.unit}`
}
