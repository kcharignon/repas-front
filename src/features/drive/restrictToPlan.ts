import type { ResultLine, ResultMessage } from '@drive-protocol'

import type { DrivePlan } from '@/api'
import type { SentLine } from './bridge'

/**
 * Une ligne du plan telle que le résultat doit s'y rattacher. Le plan relu du back (`expectedFromPlan`) ne sait pas si l'utilisateur a
 * remplacé le produit d'une ligne connue pour ce passage : `replaceable` dit qu'un produit choisi sur le site y reste possible.
 */
export interface ExpectedLine extends SentLine {
  replaceable?: boolean
}

/**
 * Les lignes attendues quand le brouillon n'a pas gardé le plan envoyé : le plan relu du back. Il ne dit ni les remplacements ni les
 * lignes passées de ce passage, d'où `replaceable` sur les lignes connues.
 */
export function expectedFromPlan(plan: DrivePlan): ExpectedLine[] {
  return plan.lines.map((line) => ({
    ingredientSlug: line.ingredientSlug,
    status: line.status,
    products: line.products.map((product) => product.retailerProductId),
    ...(typeof line.needed.unitSlug === 'string' && { unitSlug: line.needed.unitSlug }),
    ...(line.status === 'KNOWN' ? { replaceable: true } : {}),
  }))
}

/** Une ligne de résultat est celle qu'a pu produire l'agent pour la ligne du plan qui porte son slug. */
function isExpected(line: ResultLine, sent: ExpectedLine | undefined): boolean {
  if (sent === undefined) return false
  switch (line.outcome) {
    case 'ADDED':
      // Un produit connu a été mis au panier : c'est l'un de ceux du plan
      return sent.status === 'KNOWN' && sent.products.includes(line.productId)
    case 'CHOSEN':
      // Un produit choisi sur le site : la ligne était à choisir (nouvelle, ou connue et remplacée), ou aucun produit connu n'était
      // disponible (l'agent le dit : `unavailableIds` les nomme tous)
      return (
        sent.status === 'NEW' ||
        (sent.status === 'KNOWN' &&
          (sent.replaceable === true ||
            (sent.products.length > 0 &&
              sent.products.every((id) => line.unavailableIds?.includes(id) === true))))
      )
    case 'HAVE_AT_HOME':
      return sent.status !== 'SKIP'
    default:
      // `SKIPPED`, `UNAVAILABLE`, `FAILED` : rien à enregistrer pour la ligne elle-même
      return true
  }
}

/**
 * Une contenance (DRV-652) ne vaut que dans l'unité de la ligne envoyée : celle d'une autre unité, ou pour une ligne dont le plan ne disait pas l'unité (un
 * agent qui ne la connaît pas n'en rend jamais), est retirée de la ligne, qui reste. Le back accepte n'importe quelle unité qui existe ; une unité qui n'est pas
 * celle de la ligne ne servirait à rien et faussait le calcul des paquets d'une autre liste.
 */
function inItsUnit(line: ResultLine, sent: ExpectedLine | undefined): ResultLine {
  if ((line.outcome !== 'ADDED' && line.outcome !== 'CHOSEN') || line.packSize === undefined)
    return line
  if (sent?.unitSlug !== undefined && line.packSize.unitSlug === sent.unitSlug) return line
  const { packSize: _removed, ...rest } = line

  return rest
}

/**
 * Ne retient d'un résultat que ce que le plan envoyé demandait (DRV-614, revue de sécurité C1) : la page de l'enseigne partage le monde
 * JavaScript de l'agent et peut poster un faux résultat. Une ligne dont le slug n'est pas dans le plan, ou dont l'issue n'est pas
 * possible pour la ligne du plan (produit ajouté qui n'est pas l'un des siens, produit choisi pour une ligne qui n'était pas à choisir),
 * est ignorée : jamais enregistrée, jamais affichée, seulement comptée.
 */
export function restrictToPlan(
  result: ResultMessage,
  expected: readonly ExpectedLine[],
): { result: ResultMessage; ignored: number } {
  const bySlug = new Map(expected.map((line) => [line.ingredientSlug, line]))
  const lines = result.lines
    .filter((line) => isExpected(line, bySlug.get(line.ingredientSlug)))
    .map((line) => inItsUnit(line, bySlug.get(line.ingredientSlug)))

  return { result: { ...result, lines }, ignored: result.lines.length - lines.length }
}
