import type { PlanLine, PlanMessage } from '@drive-protocol'
import { LIMITS, PROTOCOL_VERSION, RETURN_PATH } from '@drive-protocol'

import type { DrivePlan, DrivePlanLine } from '@/api'

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
 * La quantité demandée, telle que le plan la donne. Le protocole refuse un symbole vide (une unité « pièce » n'en a pas toujours) :
 * sans `needed` la ligne reste valable, l'agent demande alors la quantité à l'utilisateur, au lieu de faire échouer tout le passage.
 */
function neededOf({ needed }: DrivePlanLine): PlanLine['needed'] {
  const usable =
    needed.unitSymbol !== '' &&
    needed.unitSymbol.length <= LIMITS.unitSymbol &&
    needed.quantity > 0 &&
    needed.quantity <= LIMITS.quantity

  return usable ? needed : undefined
}

function translate(line: DrivePlanLine, changes: LineChanges): PlanLine {
  const status = effectiveStatus(line, changes)
  const head = { ingredientSlug: line.ingredientSlug, name: line.ingredientName }
  if (status === 'HAVE_AT_HOME' || status === 'SKIP') return { ...head, status }

  const rejected = line.rejected.map(({ retailerProductId, label }) => ({
    id: retailerProductId,
    label,
  }))
  const needed = neededOf(line)
  const common = {
    ...head,
    rejected,
    searchQuery: line.searchQuery,
    ...(needed === undefined ? {} : { needed }),
  }
  if (status === 'NEW') {
    // Un produit remplacé : le préféré (rang 1), pour que l'agent demande ce que devient le nouveau
    const preferred = line.products[0]

    return {
      ...common,
      status,
      products: [],
      ...(preferred === undefined
        ? {}
        : { replaces: { id: preferred.retailerProductId, label: preferred.label } }),
    }
  }

  return {
    ...common,
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
 * calcul : `packs` et `packsStatus` viennent du plan. La validation complète est celle du pont (`startRun`).
 */
export function buildPlanMessage(
  plan: DrivePlan,
  changes: LineChanges,
  runId: string,
): PlanMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'plan',
    runId,
    retailer: plan.retailer,
    store: { id: plan.store.id, host: new URL(plan.store.baseUrl).host },
    returnPath: RETURN_PATH,
    lines: plan.lines.map((line) => translate(line, changes)),
  }
}
