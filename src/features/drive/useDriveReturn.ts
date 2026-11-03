import { onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import type { ResultMessage } from '@drive-protocol'

import { basketSlugsOf } from './basket'
import { driveBridge } from './bridge'
import type { RunDraft } from './bridge'
import { buildChoiceBatches } from './choices'
import { useMarkBasketLines, useSaveChoices } from './queries'
import { restrictToPlan } from './restrictToPlan'
import { retailerOf } from './retailers'
import { useDriveReturnStore } from './returnStore'

/**
 * À appeler une fois, au démarrage de l'application (`App.vue`) : écoute le pont du drive pour que le résultat d'un passage soit gardé
 * même si aucun écran du drive n'est ouvert, puis mène à l'écran du retour. Le résultat `aborted` d'un passage que l'utilisateur a
 * lui-même abandonné (brouillon déjà effacé) n'a rien à lui montrer : il n'ouvre aucun écran. Mais l'application y met les lignes que l'agent
 * avait déjà faites (DRV-769) : elles sont recoupées avec le plan envoyé, puis enregistrées (choix appris) et cochées « au panier » sans écran, comme le fait
 * l'écran du retour, pour que l'envoi suivant ne remette pas les mêmes articles au panier.
 */
export function useDriveReturn() {
  const router = useRouter()
  const store = useDriveReturnStore()
  const save = useSaveChoices()
  const markBasket = useMarkBasketLines()

  /** Jamais bloquant, jamais dit : un échec laisse seulement les choix non appris ou les articles non cochés, comme sur l'écran du retour. */
  async function keepAbandonedWork(result: ResultMessage, draft: RunDraft) {
    const storeId = result.store?.id
    // Sans les lignes du plan envoyé, rien ne dit que le résultat est celui qu'on attend : rien n'est gardé
    if (draft.lines === undefined || storeId === undefined || result.lines.length === 0) return
    const kept = restrictToPlan(result, draft.lines).result
    const slugs = basketSlugsOf(kept)
    try {
      if (slugs.length > 0) await markBasket.mutateAsync({ listId: draft.listId, slugs })
    } catch {
      // Les articles restent non cochés
    }
    try {
      const batches = buildChoiceBatches(kept, undefined, retailerOf(draft.retailer))
      if (batches.length > 0) await save.mutateAsync({ storeId, retailer: draft.retailer, batches })
    } catch {
      // Les choix ne sont pas appris cette fois
    }
  }

  driveBridge.listen()
  const stop = driveBridge.onEvent((event) => {
    if (
      event.kind === 'stale' &&
      event.result.type === 'result' &&
      event.result.outcome === 'aborted'
    ) {
      if (event.abandoned !== undefined) void keepAbandonedWork(event.result, event.abandoned)
      return
    }
    store.receive(event)
    if (router.currentRoute.value.name !== 'drive-return')
      void router.push({ name: 'drive-return' })
  })
  onScopeDispose(stop)
}
