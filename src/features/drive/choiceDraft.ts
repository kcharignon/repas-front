import { LIMITS } from '@drive-protocol'

import type { DriveChoice, DriveChoicePayload, DriveChoiceProduct } from '@/api'

import type { RetailerId } from './retailers'

/**
 * La préférence d'un ingrédient en cours de modification : l'écran « Mes produits » travaille sur ce brouillon, puis l'envoie d'un
 * coup (`PUT /drive/choices/{slug}`). Le front ne décide que de l'ordre voulu ; le back valide (produits connus, bornes, doublons).
 */
export interface ChoiceDraft {
  haveAtHome: boolean
  /** Du préféré aux produits de secours. */
  accepted: DriveChoiceProduct[]
  rejected: DriveChoiceProduct[]
}

export const MAX_ACCEPTED = LIMITS.products
export const MAX_REJECTED = LIMITS.rejected

/** Le brouillon de départ : l'état lu, les produits acceptés dans l'ordre de leur rang. */
export function draftOf(choice: DriveChoice): ChoiceDraft {
  return {
    haveAtHome: choice.haveAtHome,
    accepted: [...choice.accepted].sort((a, b) => a.rank - b.rank).map((entry) => entry.product),
    rejected: [...choice.rejected],
  }
}

const without = (list: DriveChoiceProduct[], productId: string) =>
  list.filter((product) => product.productId !== productId)

/** Déplace le produit d'un rang vers le haut (`-1`) ou le bas (`+1`) ; sans effet aux extrémités. */
export function move(draft: ChoiceDraft, productId: string, step: -1 | 1): ChoiceDraft {
  const from = draft.accepted.findIndex((product) => product.productId === productId)
  const to = from + step
  if (from < 0 || to < 0 || to >= draft.accepted.length) return draft
  const accepted = [...draft.accepted]
  const [product] = accepted.splice(from, 1)
  accepted.splice(to, 0, product as DriveChoiceProduct)

  return { ...draft, accepted }
}

/** Retire le produit de la liste : il n'est ni accepté ni refusé. */
export function remove(draft: ChoiceDraft, productId: string): ChoiceDraft {
  return { ...draft, accepted: without(draft.accepted, productId) }
}

export const canReject = (draft: ChoiceDraft): boolean => draft.rejected.length < MAX_REJECTED
export const canAcceptAgain = (draft: ChoiceDraft): boolean => draft.accepted.length < MAX_ACCEPTED

/** « Ne plus jamais prendre » : le produit passe des acceptés aux refusés. */
export function reject(draft: ChoiceDraft, productId: string): ChoiceDraft {
  const product = draft.accepted.find((candidate) => candidate.productId === productId)
  if (product === undefined || !canReject(draft)) return draft

  return {
    ...draft,
    accepted: without(draft.accepted, productId),
    rejected: [...draft.rejected, product],
  }
}

/** « Accepter de nouveau » : le produit refusé revient à la fin des acceptés (dans la limite de la liste). */
export function acceptAgain(draft: ChoiceDraft, productId: string): ChoiceDraft {
  const product = draft.rejected.find((candidate) => candidate.productId === productId)
  if (product === undefined || !canAcceptAgain(draft)) return draft

  return {
    ...draft,
    accepted: [...draft.accepted, product],
    rejected: without(draft.rejected, productId),
  }
}

export function toggleHaveAtHome(draft: ChoiceDraft, haveAtHome: boolean): ChoiceDraft {
  return { ...draft, haveAtHome }
}

const ids = (list: DriveChoiceProduct[]) => list.map((product) => product.productId)

/** « J'en ai toujours » n'envoie aucun produit, mais le brouillon les garde : décocher rend la liste telle qu'elle était. */
export function toPayload(
  draft: ChoiceDraft,
  retailer: RetailerId,
  storeId: string,
): DriveChoicePayload {
  return {
    retailer,
    storeId,
    haveAtHome: draft.haveAtHome,
    accepted: draft.haveAtHome ? [] : ids(draft.accepted),
    rejected: draft.haveAtHome ? [] : ids(draft.rejected),
  }
}

/** Le brouillon diffère-t-il de l'état lu ? (ordre compris) */
export function isDirty(draft: ChoiceDraft, choice: DriveChoice): boolean {
  const start = draftOf(choice)

  return (
    draft.haveAtHome !== start.haveAtHome ||
    ids(draft.accepted).join() !== ids(start.accepted).join() ||
    ids(draft.rejected).join() !== ids(start.rejected).join()
  )
}

/** Un brouillon vide (rien d'accepté, rien de refusé, pas « j'en ai toujours ») : l'enregistrer oublie l'ingrédient. */
export const isEmpty = (draft: ChoiceDraft): boolean =>
  !draft.haveAtHome && draft.accepted.length === 0 && draft.rejected.length === 0
