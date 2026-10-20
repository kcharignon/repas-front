// Chercher un nom, puis ses formes (ticket D de l'audit du 2026-10-18, H3 et H7) : quand la recherche du nom ne rend aucun produit, les formes
// de `searchForms` se cherchent UNE par UNE, à la suite (jamais en parallèle), à la cadence normale du `Pacer` (800 ms au moins entre deux
// requêtes), en s'arrêtant à la première qui répond. Au plus 1 + `MAX_FALLBACKS` requêtes, jamais deux fois la même. Une erreur du site (`BLOCKED`,
// `NOT_LOGGED_IN`, `NETWORK`, `CONTRACT_CHANGED`) remonte telle quelle et arrête le repli : rien ne la masque.
import type { Candidate, RetailerAdapter } from '../leclerc'
import { productSearchForms, searchForms } from './search-forms'

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

/** Un texte à chercher : `forms` dit si ses formes dérivées sont essayées aussi (un nom : oui ; le libellé d'un produit : non, il a ses propres formes). */
export interface SearchStep {
  text: string
  forms: boolean
}

/** Le texte d'une requête, espaces réduites : deux requêtes qui ne diffèrent que par les espaces sont la même. */
const spaced = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Deux étapes qui ne diffèrent que par la casse ou les espaces sont la même étape (et leurs formes dérivées, les mêmes). */
const sameStep = (text: string): string => spaced(text).toLowerCase()

/**
 * La pré-recherche d'une ligne (DRV-650) : `first` (la `searchQuery` du plan : la recherche mémorisée de l'article quand il y en a une, sinon son nom) avec
 * ses formes dérivées, puis, SI elle ne rend aucun produit, chaque étape de `then` dans l'ordre (le libellé du produit mémorisé, puis le nom de
 * l'ingrédient), et s'arrête à la première qui rend au moins un produit. Une requête n'est jamais envoyée deux fois, même si deux étapes partagent une
 * forme dérivée. Si rien ne répond, `query` reste `first` et la liste est vide.
 * @throws {LeclercError} l'erreur de l'adaptateur, à traiter par l'appelant.
 */
export async function searchInOrder(
  adapter: Pick<RetailerAdapter, 'searchProducts'>,
  first: string,
  then: readonly SearchStep[],
): Promise<NameSearch> {
  const sent = new Set<string>()
  const once = {
    searchProducts: async (query: string): Promise<Candidate[]> => {
      const key = spaced(query)
      if (sent.has(key)) return []
      sent.add(key)
      return adapter.searchProducts(query)
    },
  }
  const answer = await searchByName(once, first)
  if (answer.candidates.length > 0) return answer
  const seen = new Set([sameStep(first)])
  for (const { text, forms } of then) {
    if (seen.has(sameStep(text))) continue
    seen.add(sameStep(text))
    const found = forms
      ? await searchByName(once, text)
      : { query: text, candidates: await once.searchProducts(text) }
    if (found.candidates.length > 0) return found
  }
  return answer
}

/** Ce que la recherche d'un produit habituel a donné : le produit retrouvé (ou `null`) et le nombre de recherches faites pour le retrouver. */
export interface KnownSearch {
  product: Candidate | null
  /** Le libellé tel quel compte pour une : au plus `1 + MAX_PRODUCT_FORMS`, jamais deux fois la même (DRV-635). */
  tried: number
}

/**
 * Le produit connu `id` (stock, prix du jour) : cherché par son libellé TEL QUEL (apostrophe comprise), puis par ses formes (`productSearchForms` :
 * sans accents, sans signes, sans mots de liaison, mots-clés), l'une après l'autre, jusqu'à ce qu'une le retrouve. Au plus 5 requêtes, en série, à la
 * cadence du `Pacer`. `product` est `null` quand aucune ne le retrouve : INTROUVABLE, ce qui ne prouve jamais qu'il est indisponible (DRV-635).
 * @throws {LeclercError} l'erreur de l'adaptateur, à traiter par l'appelant.
 */
export async function lookUpKnownProduct(
  adapter: Pick<RetailerAdapter, 'readProductFromSearch'>,
  label: string,
  id: string,
): Promise<KnownSearch> {
  let tried = 1
  const seen = await adapter.readProductFromSearch(label, id)
  if (seen !== null) return { product: seen, tried }
  for (const form of productSearchForms(label)) {
    tried += 1
    const found = await adapter.readProductFromSearch(form, id)
    if (found !== null) return { product: found, tried }
  }
  return { product: null, tried }
}

/** Le produit connu `id`, ou `null` quand aucune des recherches de `lookUpKnownProduct` ne le retrouve. */
export async function findKnownProduct(
  adapter: Pick<RetailerAdapter, 'readProductFromSearch'>,
  label: string,
  id: string,
): Promise<Candidate | null> {
  return (await lookUpKnownProduct(adapter, label, id)).product
}
