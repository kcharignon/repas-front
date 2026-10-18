// Chercher un nom, puis ses formes (ticket D de l'audit du 2026-10-18, H3 et H7) : quand la recherche du nom ne rend aucun produit, les formes
// de `searchForms` se cherchent UNE par UNE, à la suite (jamais en parallèle), à la cadence normale du `Pacer` (800 ms au moins entre deux
// requêtes), en s'arrêtant à la première qui répond. Au plus 1 + `MAX_FALLBACKS` requêtes, jamais deux fois la même. Une erreur du site (`BLOCKED`,
// `NOT_LOGGED_IN`, `NETWORK`, `CONTRACT_CHANGED`) remonte telle quelle et arrête le repli : rien ne la masque.
import type { Candidate, RetailerAdapter } from '../leclerc'
import { searchForms } from './search-forms'

/** Ce que la recherche d'un nom a donné : la recherche qui a répondu (le nom, ou une de ses formes) et ses produits. */
export interface NameSearch {
  /** Le nom quand lui-même a répondu, ou quand rien n'a répondu ; sinon la forme dérivée qui a répondu. */
  query: string
  candidates: Candidate[]
}

/**
 * Les produits que le site propose pour `name`, ou, à défaut, pour la première de ses formes qui en propose. Si rien ne répond, `query` reste
 * `name` et la liste est vide : « Aucun produit trouvé pour « name » ».
 * @throws {LeclercError} l'erreur de l'adaptateur, à traiter par l'appelant.
 */
export async function searchByName(
  adapter: Pick<RetailerAdapter, 'searchProducts'>,
  name: string,
): Promise<NameSearch> {
  const first = await adapter.searchProducts(name)
  if (first.length > 0) return { query: name, candidates: first }
  for (const form of searchForms(name)) {
    const candidates = await adapter.searchProducts(form)
    if (candidates.length > 0) return { query: form, candidates }
  }
  return { query: name, candidates: first }
}

/**
 * Le produit connu `id` (stock, prix du jour) : cherché par son libellé complet, comme avant ; s'il n'y figure pas, par les formes du libellé,
 * l'une après l'autre, jusqu'à ce qu'une le retrouve. `null` quand aucune ne le retrouve : « plus disponible » reste le dernier recours.
 * @throws {LeclercError} l'erreur de l'adaptateur, à traiter par l'appelant.
 */
export async function findKnownProduct(
  adapter: Pick<RetailerAdapter, 'readProductFromSearch'>,
  label: string,
  id: string,
): Promise<Candidate | null> {
  const seen = await adapter.readProductFromSearch(label, id)
  if (seen !== null) return seen
  for (const form of searchForms(label)) {
    const found = await adapter.readProductFromSearch(form, id)
    if (found !== null) return found
  }
  return null
}
