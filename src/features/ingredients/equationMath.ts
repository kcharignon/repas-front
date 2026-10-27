/**
 * L'équation d'une conversion, telle que l'utilisateur la lit et l'écrit : « 8 tasses = 1 kilo ». Ce module est pur (aucun Vue, aucune
 * requête) : l'accord des noms d'unités, les nombres à la française, le coefficient que le back attend (« 1 unité de départ vaut
 * `coefficient` unités d'arrivée » = droite ÷ gauche) et les erreurs. Le composant `ConversionEquation.vue` l'affiche, les écrans
 * (administration, fiche d'ingrédient) en tirent le coefficient à envoyer.
 */

/** Une unité telle que la liste `GET /api/v1/units` la donne. */
export interface EquationUnit {
  slug: string
  name: string
}

/** Ce que le composant édite : les deux unités et les deux nombres, tels que tapés (on accepte la virgule). */
export interface EquationValue {
  start: string
  end: string
  left: string | number
  right: string | number
}

export type EquationProblem = 'sameUnit' | 'noUnit' | 'left' | 'right' | null

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
 * Ce qui empêche d'enregistrer. Un nombre vide ou une unité pas encore choisie ne sont une erreur qu'à l'enregistrement
 * (`requireNumbers`) ; un nombre écrit mais nul ou négatif, et deux unités identiques, sont signalés tout de suite.
 */
export function equationProblem(value: EquationValue, requireNumbers = false): EquationProblem {
  if (value.start !== '' && value.start === value.end) return 'sameUnit'
  // Une unité pas encore choisie (une nouvelle conversion qui laisse l'arrivée à choisir) : à l'enregistrement seulement
  if (requireNumbers && (value.start === '' || value.end === '')) return 'noUnit'

  for (const side of ['left', 'right'] as const) {
    const text = String(value[side]).trim()
    if (text === '' ? requireNumbers : !((parseNumber(text) ?? 0) > 0)) return side
  }

  return null
}

/**
 * Un nombre à lire dans une phrase, avec la séparation des milliers (« 1 000 ») : pour l'affichage, jamais pour remplir un champ. Une
 * espace insécable ordinaire plutôt que l'espace fine du français, que la police du site ne dessine pas (« 1000 »).
 */
export function formatDisplayNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 })
    .format(value)
    .replace(/\u202f/g, '\u00a0')
}

/** Une unité telle qu'on la lit dans une phrase courte : son symbole quand il dit autre chose que son nom (« g », « kg »), sinon son nom accordé. */
export function unitText(unit: { name: string; symbol?: string | null }, quantity: number): string {
  const symbol = unit.symbol?.trim() ?? ''
  if (symbol !== '' && symbol.toLowerCase() !== unit.name.trim().toLowerCase()) return symbol

  return unitLabel(unit.name, quantity)
}

/** « de centilitres », « d'unités » : la préposition « de » s'élide devant une voyelle. */
export function withDe(word: string): string {
  const trimmed = word.trim()

  return /^[aeiouyàâäéèêëîïôöùûüœ]/i.test(trimmed) ? `d'${trimmed}` : `de ${trimmed}`
}

/** Une conversion enregistrée, telle que le back la donne : « 1 départ = coefficient arrivée ». */
export interface StoredConversion {
  startUnitSlug: string
  endUnitSlug: string
  coefficient: number
}

/** Une conversion telle qu'on la LIT et qu'on la rouvre : « 1 `startSlug` = `value` `endSlug` ». `reversed` : on l'a retournée par rapport à ce qui est enregistré. */
export interface OrientedConversion {
  startSlug: string
  endSlug: string
  value: number
  reversed: boolean
}

/**
 * Le sens dans lequel une conversion s'affiche et se rouvre, quel que soit le sens où elle est enregistrée. L'unité d'achat de
 * l'ingrédient est TOUJOURS à gauche quand la conversion la porte (« 1 bouteille = 30 centilitres », jamais « 1 centilitre =
 * 0,0333 bouteille »), même si le nombre est alors inférieur à 1 (« 1 kilo = 0,5 sac »). Sans unité d'achat dans la conversion, c'est le
 * nombre qui décide : on retourne ce qui vaut moins de 1 (« 1 gramme = 0,001 kilo » se lit « 1 kilo = 1 000 grammes »).
 * Retourner n'écrit rien : l'enregistrement garde ce qu'il avait tant que l'utilisateur ne modifie pas l'équation.
 */
export function displayOrientation(
  conversion: StoredConversion,
  purchaseSlug: string | undefined,
): OrientedConversion {
  const { startUnitSlug, endUnitSlug, coefficient } = conversion
  const kept: OrientedConversion = {
    startSlug: startUnitSlug,
    endSlug: endUnitSlug,
    value: coefficient,
    reversed: false,
  }
  if (!(coefficient > 0) || !Number.isFinite(coefficient)) return kept

  const purchaseOnStart = purchaseSlug !== undefined && startUnitSlug === purchaseSlug
  const purchaseOnEnd = purchaseSlug !== undefined && endUnitSlug === purchaseSlug
  const reverse = purchaseOnEnd || (!purchaseOnStart && coefficient < 1)
  if (!reverse) return kept

  // 12 chiffres significatifs : 1 ÷ (1 ÷ 30) vaut 30, pas 30,000000000000004
  return {
    startSlug: endUnitSlug,
    endSlug: startUnitSlug,
    value: Number((1 / coefficient).toPrecision(12)),
    reversed: true,
  }
}
