import type { PlanLine, PlanMessage } from '@drive-protocol'
import {
  cleanText,
  LIMITS,
  PROTOCOL_VERSION,
  RETURN_PATH,
  toPackSize,
  UNIT_SLUG,
} from '@drive-protocol'

import type { DrivePlan, DrivePlanLine } from '@/api'
import { catalogIdOf } from './choices'

/**
 * Les rayons conseillés d'une ligne tels qu'ils partent à l'agent : les valeurs valides seulement (jamais un message que l'agent refuserait en
 * bloc), sans doublon, trois au plus, dans l'ordre reçu. Vide quand le back n'en donne pas.
 */
export function rayonHintsOf(line: { rayonHints?: readonly number[] | null }): number[] {
  const hints: number[] = []
  for (const value of line.rayonHints ?? []) {
    const id = catalogIdOf(value)
    if (id !== null && !hints.includes(id)) hints.push(id)
    if (hints.length === LIMITS.rayonHints) break
  }

  return hints
}

/**
 * Ce que l'utilisateur change pour ce passage seulement (rien n'est mémorisé) :
 *  - `REPLACE` : « Choisir un autre produit », une ligne connue devient à choisir sur le site (`replaces` nomme le produit préféré) ;
 *  - `SKIP` : « Passer cette fois », la ligne n'est pas mise au panier.
 */
export type LineChange = 'REPLACE' | 'SKIP'
export type LineChanges = Readonly<Record<string, LineChange | undefined>>

/** Ce que sera la ligne dans le message envoyé : le statut du plan du back, ou ce que l'utilisateur en a fait. */
export function effectiveStatus(line: DrivePlanLine, changes: LineChanges): PlanLine['status'] {
  const change = changes[line.ingredientSlug]
  if (line.status === 'HAVE_AT_HOME') return 'HAVE_AT_HOME'
  if (change === 'SKIP') return 'SKIP'
  if (change === 'REPLACE' && line.status === 'KNOWN') return 'NEW'

  return line.status
}

/**
 * Ce que le plan envoyé contient en plus, seulement si l'agent de l'application le connaît (un agent plus ancien rejette le plan entier à la moindre
 * clé inconnue) : les rayons conseillés (DRV-642) et, pour la contenance d'un produit dans l'unité de la liste (DRV-652), le slug et le nom de l'unité de
 * chaque ligne (`needed.unitSlug`, `needed.unitName`) et la contenance déjà donnée de chaque produit (`packSize`).
 */
export interface PlanOptions {
  rayonHints?: boolean
  packSize?: boolean
}

type Needed = NonNullable<PlanLine['needed']>

/**
 * La quantité demandée d'une ligne, sans copier ce que le back ajoute un jour (une clé inconnue de l'agent ferait rejeter tout le plan) : les quatre clés du
 * protocole d'avant, plus le slug et le nom de l'unité (DRV-652) quand l'agent de l'application les connaît et que le back les a donnés tels que le protocole
 * les accepte (un slug d'unité, un nom propre de 1 à 255 caractères). L'un sans l'autre n'est pas envoyé : l'agent redemande alors le nombre de produits.
 */
function neededOf(needed: DrivePlanLine['needed'], options: PlanOptions): Needed {
  const { quantity, unitSymbol, dimension, baseFactor } = needed
  const base: Needed = {
    quantity,
    unitSymbol,
    ...(dimension === undefined ? {} : { dimension }),
    ...(baseFactor === undefined ? {} : { baseFactor }),
  }
  if (options.packSize !== true) return base
  const slug: unknown = needed.unitSlug
  const name = typeof needed.unitName === 'string' ? cleanText(needed.unitName) : ''
  const named =
    typeof slug === 'string' &&
    UNIT_SLUG.test(slug) &&
    name !== '' &&
    [...name].length <= LIMITS.label

  return named ? { ...base, unitSlug: slug, unitName: name } : base
}

function translate(line: DrivePlanLine, changes: LineChanges, options: PlanOptions): PlanLine {
  const status = effectiveStatus(line, changes)
  const head = { ingredientSlug: line.ingredientSlug, name: line.ingredientName }
  if (status === 'HAVE_AT_HOME' || status === 'SKIP') return { ...head, status }

  const rejected = line.rejected.map(({ retailerProductId, label }) => ({
    id: retailerProductId,
    label,
  }))
  // La quantité demandée, par liste blanche : le plan ne renvoie jamais de symbole vide (le nom de l'unité à défaut)
  const common = {
    ...head,
    rejected,
    searchQuery: line.searchQuery,
    needed: neededOf(line.needed, options),
  }
  // Les rayons conseillés rangent la liste de l'écran de choix : ils ne servent qu'aux lignes que l'utilisateur choisit sur le site
  const hints = options.rayonHints === true ? rayonHintsOf(line) : []
  const rayons = hints.length > 0 ? { rayonHints: hints } : {}
  if (status === 'NEW') {
    // Un produit remplacé : le préféré (rang 1), pour que l'agent demande ce que devient le nouveau
    const preferred = line.products[0]

    return {
      ...common,
      ...rayons,
      status,
      products: [],
      ...(preferred === undefined
        ? {}
        : { replaces: { id: preferred.retailerProductId, label: preferred.label } }),
    }
  }

  return {
    ...common,
    ...rayons,
    status,
    products: [...line.products]
      .sort((a, b) => a.rank - b.rank)
      .map((product) => ({
        id: product.retailerProductId,
        label: product.label,
        ...(product.content ? { content: product.content } : {}),
        packs: product.packs ?? null,
        packsStatus: product.packsStatus,
        // La contenance déjà donnée pour ce produit (DRV-652) : l'agent ne repose pas la question et n'écrase pas le calcul du plan par le contenu lu
        ...(options.packSize === true && { packSize: toPackSize(product.packSize) }),
      })),
  }
}

/**
 * Traduit le plan du back en message `plan` du protocole v1 (DRV-404) : `retailerProductId` devient `id`, `ingredientName` devient
 * `name`, `needed` est recopié, l'hôte du magasin se déduit de `baseUrl`. Les produits gardent l'ordre de priorité du back. Aucun
 * calcul : `packs` et `packsStatus` viennent du plan. La validation complète est celle du pont (`startRun`). `options.rayonHints` (DRV-642) recopie
 * les rayons conseillés de chaque ligne ; à n'allumer que pour une application dont l'agent les connaît (`isRayonHintsAppVersion`).
 */
export function buildPlanMessage(
  plan: DrivePlan,
  changes: LineChanges,
  runId: string,
  options: PlanOptions = {},
): PlanMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'plan',
    runId,
    retailer: plan.retailer,
    store: { id: plan.store.id, host: new URL(plan.store.baseUrl).host },
    returnPath: RETURN_PATH,
    lines: plan.lines.map((line) => translate(line, changes, options)),
  }
}
