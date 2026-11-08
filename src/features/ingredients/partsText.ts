import { lowerFirst } from '@/design/lowerFirst'
import { formatDisplayNumber, parseNumber, unitLabel, withDe } from './equationMath'

/**
 * Les mots du découpage d'un ingrédient en parties (SUB-007, ADR 0038 du back) : « 1 œuf = 1 jaune d'œuf », « Combien dans 1 œuf ? ».
 * Du texte pur : l'écran donne les noms et les nombres, ce fichier les accorde. À l'écran on dit « partie » et « découper », jamais
 * « sous-ingrédient » ni « parent » (`repas-po`).
 */

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')

/** L'unité « tout court » (un œuf, un citron) : on ne la nomme pas, on dit « 1 œuf » et non « 1 unité d'œuf ». */
export const isCountUnit = (unitName: string | null | undefined): boolean =>
  unitName == null || unitName.trim() === '' || fold(unitName.trim()) === 'unite'

/** Un nombre à lire dans une phrase (« 1 », « 1,5 »). */
const amount = (value: number) => formatDisplayNumber(value)

/**
 * « 1 œuf », « 1 gousse de vanille » : UNE unité de recette de l'ingrédient entier, celle dont parle le nombre des parties.
 */
export function oneOf(name: string, unitName: string | null | undefined): string {
  const whole = lowerFirst(name)

  return isCountUnit(unitName) ? `1 ${whole}` : `1 ${unitName!.trim()} ${withDe(whole)}`
}

/**
 * « 1 jaune d'œuf », « 2 jaunes d'œuf », « 1,5 kilo de farine complète » : la quantité d'une partie, dans son unité d'achat, accordée
 * avec le nombre.
 */
export function amountOf(name: string, unitName: string | null | undefined, value: number): string {
  const part = lowerFirst(name)
  if (isCountUnit(unitName)) return `${amount(value)} ${unitLabel(part, value)}`

  return `${amount(value)} ${unitLabel(unitName!.trim(), value)} ${withDe(part)}`
}

/** Ce qui suit le champ « Combien dans 1 œuf ? » : le nom de la partie (« jaune d'œuf », « kilo de farine complète »), accordé avec le nombre tapé. */
export function amountSuffix(
  name: string,
  unitName: string | null | undefined,
  value: number | null,
): string {
  const part = lowerFirst(name)
  const shown = value ?? 1
  if (isCountUnit(unitName)) return unitLabel(part, shown)

  return `${unitLabel(unitName!.trim(), shown)} ${withDe(part)}`
}

/** « 1 œuf = 1 jaune d'œuf » : la ligne d'une carte de partie. */
export function ratioLine(
  parent: { name: string; unitName: string | null | undefined },
  part: { name: string; unitName: string | null | undefined; ratio: number },
): string {
  return `${oneOf(parent.name, parent.unitName)} = ${amountOf(part.name, part.unitName, part.ratio)}`
}

/**
 * Le pluriel d'un nom d'ingrédient quand on est sûr de l'accorder : un mot seul (« œuf » : « œufs ») ou un nom suivi de son complément
 * (« pomme de terre » : « pommes de terre »). Autre chose (« crème fraîche ») : `null`, la phrase cite alors le nom entre guillemets.
 */
function plural(name: string): string | null {
  const text = lowerFirst(name)
  if (text === '') return null
  const simple = !/\s/.test(text)
  const compound = /^\S+\s+(?:(?:à|de|du|des|au|aux|en)\s|d['’])/iu.test(text)

  return simple || compound ? unitLabel(text, 2) : null
}

/** « tes œufs » (ou « « Crème fraîche » ») : où une partie compte, dans la fiche de la partie. */
export function countsIn(name: string): string {
  const many = plural(name)

  return many === null ? `« ${name.trim()} »` : `tes ${many}`
}

/** « des œufs » (ou « « Crème fraîche » ») : pour qui une ligne de recette compte. */
export function countsFor(name: string): string {
  const many = plural(name)

  return many === null ? `« ${name.trim()} »` : `des ${many}`
}

/** Les bornes du back pour le nombre d'une partie (`QuantityBounds`) : de 0,000001 à 1 000 000. */
const MIN_RATIO = 0.000001
const MAX_RATIO = 1_000_000

/** Le nombre tapé (virgule ou point) s'il est valable pour le back, sinon `null` : champ vide, mot, zéro, négatif, trop grand. */
export function parseRatio(text: string | number): number | null {
  const value = parseNumber(text)

  return value !== null && value >= MIN_RATIO && value <= MAX_RATIO ? value : null
}
