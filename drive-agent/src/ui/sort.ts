// Trier la liste des produits proposés (DRV-743) : un ordre d'AFFICHAGE, rien d'autre. Le tri est local (aucune requête de plus vers le site), ne change ni les produits
// proposés, ni la mémoire des produits, ni le résultat envoyé à Repas. « Pertinence » est l'ordre du site, tel que l'agent l'a reçu. Rien ici n'est propre à une enseigne.
// Un produit qui n'a pas la valeur du tri (pas de prix, pas de prix à l'unité) passe en dernier, quel que soit le sens ; entre égaux, l'ordre du site reste.

/** Les quatre façons de trier : l'ordre du site, le prix, le prix à l'unité de mesure (au kilo, au litre ou à la pièce), l'ordre alphabétique. */
export type SortKey = 'relevance' | 'price' | 'unitPrice' | 'name'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: SortKey
  direction: SortDirection
}

/** L'unité d'un prix à l'unité de mesure : kg, L ou pièce (les unités du protocole). */
export type MeasureUnit = 'kg' | 'l' | 'piece'

/** L'ordre des boutons de l'écran. */
export const SORT_KEYS: readonly SortKey[] = ['relevance', 'price', 'unitPrice', 'name']

/** L'ordre du site : aucun tri. */
export const DEFAULT_SORT: SortState = { key: 'relevance', direction: 'asc' }

/**
 * Le tri choisi, gardé pour tout un envoi (la personne ne le retouche pas à chaque article) : un objet que la phase B crée à son début et partage entre les écrans de
 * choix. Il n'est pas écrit sur disque : à la fin de l'envoi, il est oublié.
 */
export interface SortMemory {
  current: SortState
}

/** Ce que le tri lit d'un produit proposé. */
export interface Sortable {
  name: string
  /** Le prix, en centimes. */
  price?: number | null | undefined
  /** Le prix à l'unité de mesure, en centimes, et son unité. */
  perMeasure?: { cents: number; unit: MeasureUnit } | null | undefined
}

/** Le toucher d'un bouton : un autre tri commence dans le sens naturel (croissant) ; le tri actif change de sens ; l'ordre du site actif ne change rien. */
export function touch(state: SortState, key: SortKey): SortState {
  if (key === 'relevance') return DEFAULT_SORT
  if (state.key === key) return { key, direction: state.direction === 'asc' ? 'desc' : 'asc' }
  return { key, direction: 'asc' }
}

/** Une valeur utilisable pour comparer : un nombre fini et positif (un prix à zéro ou négatif est une donnée absente). */
const usable = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * L'unité du « prix au kilo » d'une liste : on ne compare jamais des kilos avec des litres. L'unité de référence est celle que portent le plus de produits (à égalité,
 * kg avant L avant pièce) ; un produit d'une autre unité est traité comme un produit sans prix à l'unité et passe en dernier. Sans aucun prix à l'unité : kg.
 */
export function referenceUnit(items: readonly Sortable[]): MeasureUnit {
  const counts: Record<MeasureUnit, number> = { kg: 0, l: 0, piece: 0 }
  for (const { perMeasure } of items) {
    if (perMeasure && usable(perMeasure.cents)) counts[perMeasure.unit]++
  }
  const order: MeasureUnit[] = ['kg', 'l', 'piece']
  return order.reduce((best, unit) => (counts[unit] > counts[best] ? unit : best), 'kg')
}

// « Beurre » et « beurre », « Éclair » et « eclair » se valent : ni la casse ni les accents ne comptent, et l'ordre est celui du français.
const COLLATOR = new Intl.Collator('fr', { sensitivity: 'base' })

/**
 * La liste dans l'ordre demandé : une copie, la liste reçue n'est pas touchée. Le tri est stable : deux produits égaux gardent l'ordre du site, dans les deux sens ;
 * les produits sans la valeur du tri sont à la fin, dans l'ordre du site, dans les deux sens.
 */
export function sortItems<T extends Sortable>(items: readonly T[], state: SortState): T[] {
  if (state.key === 'relevance') return [...items]
  const sign = state.direction === 'asc' ? 1 : -1
  if (state.key === 'name') {
    return [...items].sort((a, b) => sign * COLLATOR.compare(a.name, b.name))
  }
  const unit = referenceUnit(items)
  const valueOf = (item: T): number | null => {
    if (state.key === 'price') return usable(item.price) ? item.price : null
    const measure = item.perMeasure
    return measure && measure.unit === unit && usable(measure.cents) ? measure.cents : null
  }
  const keyed = items.map((item) => ({ item, value: valueOf(item) }))
  const known = keyed.filter(({ value }) => value !== null)
  const missing = keyed.filter(({ value }) => value === null)
  known.sort((a, b) => sign * ((a.value ?? 0) - (b.value ?? 0)))
  return [...known, ...missing].map(({ item }) => item)
}
