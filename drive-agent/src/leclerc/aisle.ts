import { LIMITS } from '../../protocol'
import type { Candidate } from './candidate'

/** Un identifiant de rayon ou de famille de l'enseigne que le protocole accepte : un entier de 1 à 2 147 483 647. Sinon `null`. */
export function catalogId(value: number | null | undefined): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= LIMITS.catalogId
    ? value
    : null
}

/**
 * Range les produits d'une recherche selon les rayons conseillés pour l'ingrédient (DRV-642) : ceux dont le rayon (`iIdRayon`) est le premier conseillé
 * d'abord, puis ceux du deuxième, puis du troisième, puis tous les autres, **sans en cacher aucun**. À l'intérieur de chaque groupe, l'ordre du site est
 * gardé (le tri est stable). Sans rayon conseillé, ou aucun valable, l'ordre du site ne change pas. Une fonction pure : même liste, même nombre de produits.
 */
export function rankByAisle(
  candidates: readonly Candidate[],
  hints: readonly number[] | undefined,
): Candidate[] {
  const order: number[] = []
  for (const hint of hints ?? []) {
    const id = catalogId(hint)
    if (id !== null && !order.includes(id)) order.push(id)
  }
  if (order.length === 0) return [...candidates]

  const groups: Candidate[][] = order.map(() => [])
  const rest: Candidate[] = []
  for (const candidate of candidates) {
    const rank = candidate.aisle === null ? -1 : order.indexOf(candidate.aisle)
    const group = rank < 0 ? rest : (groups[rank] ?? rest)
    group.push(candidate)
  }
  return [...groups.flat(), ...rest]
}

/**
 * Les rayons présents dans une recherche (DRV-647) : chaque identifiant de rayon valable et son nombre de produits, du plus fourni au moins fourni, à
 * égalité dans l'ordre de la page. Les produits sans rayon ne comptent dans aucun. Une fonction pure.
 */
export function countAisles(candidates: readonly Candidate[]): { id: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const candidate of candidates) {
    const id = catalogId(candidate.aisle)
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  // Le tri est stable : à égalité, l'ordre d'apparition (celui de la page) est gardé.
  return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count)
}
