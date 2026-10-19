import type { PlanLine, PlanMessage } from '@drive-protocol'
import { PROTOCOL_VERSION, RETURN_PATH } from '@drive-protocol'

import type { DrivePlan, DrivePlanLine } from '@/api'
import { rayonHintsOf, type WithRayonHints } from './rayon'

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

/** Ce que le plan envoyé contient en plus (DRV-642) : les rayons conseillés, seulement si l'agent de l'application les connaît. */
export interface PlanOptions {
  rayonHints?: boolean
}

function translate(
  line: DrivePlanLine & WithRayonHints,
  changes: LineChanges,
  options: PlanOptions,
): PlanLine {
  const status = effectiveStatus(line, changes)
  const head = { ingredientSlug: line.ingredientSlug, name: line.ingredientName }
  if (status === 'HAVE_AT_HOME' || status === 'SKIP') return { ...head, status }

  const rejected = line.rejected.map(({ retailerProductId, label }) => ({
    id: retailerProductId,
    label,
  }))
  // La quantité demandée est recopiée telle quelle : le plan ne renvoie jamais de symbole vide (le nom de l'unité à défaut)
  const common = { ...head, rejected, searchQuery: line.searchQuery, needed: line.needed }
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
