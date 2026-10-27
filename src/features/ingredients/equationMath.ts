/**
 * L'équation d'une conversion, telle que l'utilisateur la lit et l'écrit : « 8 tasses = 1 kilo ». Ce module est pur (aucun Vue, aucune
 * requête) : l'accord des noms d'unités, les nombres à la française, le coefficient que le back attend (« 1 unité de départ vaut
 * `coefficient` unités d'arrivée » = droite ÷ gauche) et les erreurs. Le composant `ConversionEquation.vue` l'affiche, les écrans
 * (administration, fiche d'ingrédient) en tirent le coefficient à envoyer.
 */

/** Une unité telle que la liste `GET /api/v1/units` la donne (la mesure aide à proposer la petite unité). */
export interface EquationUnit {
  slug: string
  name: string
  dimension?: string | null
  baseFactor?: number | null
}

/** Ce que le composant édite : les deux unités et les deux nombres, tels que tapés (on accepte la virgule). */
export interface EquationValue {
  start: string
  end: string
  left: string | number
  right: string | number
}

export type EquationProblem = 'sameUnit' | 'left' | 'right' | null

// Un nom qui contient une préposition (cuillère à soupe, boîte de conserve) s'accorde sur son premier mot
const COMPOUND = /^(\S+)(\s+(?:(?:à|de|du|des|au|aux|en)\s|d['’]).*)$/i

function pluralWord(word: string): string {
  if (/[sxz]$/i.test(word)) return word
  if (/eau$/i.test(word)) return `${word}x`
  if (/al$/i.test(word)) return `${word.slice(0, -2)}aux`

  return `${word}s`
}

/** Le nom d'une unité accordé à la quantité : « tasse » pour 1 (et pour 1,5), « tasses » à partir de 2. */
export function unitLabel(name: string, quantity: number): string {
  const trimmed = name.trim()
  if (!(Math.abs(quantity) >= 2)) return trimmed

  const compound = COMPOUND.exec(trimmed)
  if (compound !== null) return `${pluralWord(compound[1] ?? '')}${compound[2] ?? ''}`

  const words = trimmed.split(/\s+/)
  words[words.length - 1] = pluralWord(words[words.length - 1] ?? '')

  return words.join(' ')
}

const numberFormat = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 4,
  useGrouping: false,
})

/** Un nombre à la française : virgule, quatre décimales au plus, pas de zéro inutile, pas de séparateur de milliers. */
export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

/** Un nombre pour remplir un champ à modifier : sa valeur exacte (jamais arrondie, enregistrer sans toucher ne change rien), à la française. */
export function inputNumber(value: number): string {
  const text = String(value)

  return (/e/i.test(text) ? value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') : text).replace(
    '.',
    ',',
  )
}

/** Un nombre tapé (virgule ou point) ou null : un champ vide, un mot, une valeur infinie ne sont pas des nombres. */
export function parseNumber(text: string | number): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null

  const clean = text.trim().replace(/\s/g, '').replace(',', '.')
  if (clean === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null

  return Number(clean)
}

/** « 8 tasses », « 1,5 kilo » : le nombre et le nom accordé. */
export function quantityLabel(value: number, name: string): string {
  return `${formatNumber(value)} ${unitLabel(name, value)}`
}

/** Le coefficient du back : combien d'unités d'arrivée valent UNE unité de départ (droite ÷ gauche), ou null si l'une des deux est vide ou nulle. */
export function coefficientOf(left: string | number, right: string | number): number | null {
  const l = parseNumber(left)
  const r = parseNumber(right)
  if (l === null || r === null || l <= 0 || r <= 0) return null

  // 12 chiffres significatifs : 3 ÷ 10 vaut 0,3, pas 0,30000000000000004
  return Number((r / l).toPrecision(12))
}

/**
 * Ce qui empêche d'enregistrer. Un nombre vide n'est une erreur qu'à l'enregistrement (`requireNumbers`) ; un nombre écrit mais nul
 * ou négatif, et deux unités identiques, sont signalés tout de suite.
 */
export function equationProblem(value: EquationValue, requireNumbers = false): EquationProblem {
  if (value.start !== '' && value.start === value.end) return 'sameUnit'

  for (const side of ['left', 'right'] as const) {
    const text = String(value[side]).trim()
    if (text === '' ? requireNumbers : !((parseNumber(text) ?? 0) > 0)) return side
  }

  return null
}

/**
 * La petite unité de la même dimension (gramme pour kilo, millilitre pour litre) : « 1 cuillère à soupe = ? gramme » se pose plus
 * naturellement que « ? kilo ». Seulement pour le poids et le volume, jamais pour un conditionnement ; undefined s'il n'y en a pas.
 */
export function baseUnitOf(unit: EquationUnit, units: EquationUnit[]): EquationUnit | undefined {
  if (unit.dimension !== 'WEIGHT' && unit.dimension !== 'VOLUME') return undefined

  return units.find(
    (candidate) =>
      candidate.slug !== unit.slug &&
      candidate.dimension === unit.dimension &&
      candidate.baseFactor === 1,
  )
}

/** Les unités qui se convertissent en `unit` par leur facteur de base (même dimension de poids ou de volume), `unit` comprise. */
export function sameMeasureUnits(unit: EquationUnit, units: EquationUnit[]): EquationUnit[] {
  if ((unit.dimension !== 'WEIGHT' && unit.dimension !== 'VOLUME') || !((unit.baseFactor ?? 0) > 0))
    return [unit]

  return units.filter(
    (candidate) =>
      candidate.slug === unit.slug ||
      (candidate.dimension === unit.dimension && (candidate.baseFactor ?? 0) > 0),
  )
}

/** Quantité exprimée en `to` quand elle vaut `quantity` en `from` (même dimension, facteurs de base connus) ; sinon la quantité telle quelle. */
export function inUnit(quantity: number, from: EquationUnit, to: EquationUnit): number {
  if (from.slug === to.slug) return quantity
  if (!((from.baseFactor ?? 0) > 0) || !((to.baseFactor ?? 0) > 0)) return quantity

  return Number(
    ((quantity * (from.baseFactor as number)) / (to.baseFactor as number)).toPrecision(12),
  )
}
