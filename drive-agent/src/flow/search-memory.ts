// La recherche mémorisée d'un article (DRV-650) : « Céréale coussin » est le mot de la maison, pas celui du drive. Le plan porte, dans
// `searchQuery`, la recherche qui a fait trouver le produit choisi la dernière fois (ou, à défaut, le nom de l'ingrédient). Deux choses ici :
//  - de quoi chercher quand le produit habituel n'est plus là (`fallbackSteps`) : la recherche du plan d'abord (dans `phase-b.ts`), puis le libellé
//    du produit mémorisé, puis le nom de l'ingrédient ;
//  - la recherche à rendre à Repas avec le produit choisi (`rememberedSearch`), seulement quand elle diffère de celle du plan.
// Rien ici n'est propre à une enseigne : la valeur l'est, le mécanisme non. Aucun texte de la personne n'est écrit dans un journal ou un rapport.
import { cleanSearchQuery, type PlanLine, type PlanProduct } from '../../protocol'
import type { PendingLine } from './types'
import type { SearchStep } from './search-by-name'

/**
 * Ce que l'agent cherche si la recherche du plan ne rend aucun produit exploitable, dans l'ordre :
 * 1. le libellé du produit mémorisé que la phase A n'a pas mis au panier (ou, à défaut, celui du produit à remplacer), nettoyé et coupé à 80 caractères,
 *    tel quel, sans formes dérivées : il en a, et la phase A les a déjà toutes essayées quand le produit était INTROUVABLE (`NOT_FOUND`, DRV-635), cas où
 *    cette étape est donc écartée plutôt que de redemander la même chose ;
 * 2. le nom de l'ingrédient, avec ses formes dérivées.
 * Une étape identique à la recherche du plan, ou à une étape précédente, n'est pas redemandée (`searchInOrder`).
 */
export function fallbackSteps(
  line: PlanLine,
  unavailable: readonly PlanProduct[],
  reasons: PendingLine['reasons'],
): SearchStep[] {
  const lost = unavailable.find((product) => reasons?.get(product.id) !== 'NOT_FOUND')
  const label = cleanSearchQuery(lost?.label ?? line.replaces?.label ?? '')
  return [
    ...(label === null ? [] : [{ text: label, forms: false }]),
    { text: line.name, forms: true },
  ]
}

/**
 * La recherche à rendre à Repas avec le produit choisi : celle dont la liste affichée est la réponse (`listed`), nettoyée, SEULEMENT si elle diffère de
 * la recherche du plan (sinon la valeur mémorisée par Repas est gardée, la clé reste absente). `null` : rien à rendre (moins de 2 caractères une fois
 * nettoyée, ou même recherche que le plan).
 */
export function rememberedSearch(line: PlanLine, listed: string | null): string | null {
  const shown = listed === null ? null : cleanSearchQuery(listed)
  if (shown === null) return null
  return shown === cleanSearchQuery(line.searchQuery ?? line.name) ? null : shown
}
