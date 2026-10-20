// La contenance d'un produit dans l'unité de la liste (DRV-652) : « 20 tranches » pour un cheddar que la liste compte en tranches. Une réponse de la personne,
// que Repas mémorise avec le produit pour ne plus poser la question. Les règles ici sont celles du back (`PackSize`, `PackCalculator`) : une contenance hors
// de ces bornes fait refuser TOUT le lot de choix (`422 DRIVE_PACK_SIZE_INVALID`), les produits choisis du passage avec elle. Une seule définition pour
// l'agent (l'écran, la validation de la réponse) et le site (validation avant envoi, aperçu de « Mes produits »).

import { LIMITS, type PackSize } from './types'

/** Le slug d'une unité de Repas : le motif du back (`^[a-z0-9-]{1,255}$`). */
export const UNIT_SLUG = /^[a-z0-9-]{1,255}$/

/** Tolérance de l'arrondi supérieur, celle du back : 0,3 × 10 ne doit pas donner 4. */
const EPSILON = 1e-9

/** Le nombre de décimales de la contenance est vérifié sur la valeur multipliée : 12,345 × 1000 est 12 345 à l'erreur de flottant près. */
const SCALE = 10 ** LIMITS.packSizeDecimals

/** Une contenance valide : un nombre fini de 0,001 à 9 999, avec trois décimales au plus. */
export function isPackValue(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (value < LIMITS.packSizeMin || value > LIMITS.packSizeMax) return false
  const scaled = value * SCALE

  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

/**
 * Le nombre que la personne a tapé, ou `null` s'il n'est pas une contenance valide : chiffres, avec une virgule (française) ou un point pour les décimales,
 * trois au plus, de 0,001 à 9 999. Rien d'autre n'est deviné (« 1 000 », « 20 tranches », « 1e3 » : `null`).
 */
export function parsePackValue(text: string): number | null {
  const normal = text.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(normal)) return null
  const value = Number(normal)

  return isPackValue(value) ? value : null
}

/** Une contenance complète et valide, prête à partir : sa valeur dans les bornes, son unité un slug de Repas. `null` sinon. */
export function toPackSize(value: unknown): PackSize | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== 2 || !keys.includes('value') || !keys.includes('unitSlug')) return null
  const { value: amount, unitSlug } = value as Record<string, unknown>

  return isPackValue(amount) && typeof unitSlug === 'string' && UNIT_SLUG.test(unitSlug)
    ? { value: amount, unitSlug }
    : null
}

/**
 * Le nombre de produits que donne une contenance : `ceil(quantité / contenance)`, tolérance 1e-9, au moins 1, au plus 99 (les règles de `PackCalculator`). `null`
 * quand la quantité ou la contenance ne sont pas des nombres strictement positifs.
 */
export function packsFromSize(quantity: number, size: number): number | null {
  if (!(quantity > 0) || !Number.isFinite(quantity) || !(size > 0) || !Number.isFinite(size))
    return null

  return Math.min(Math.max(Math.ceil(quantity / size - EPSILON), 1), LIMITS.packsMax)
}
