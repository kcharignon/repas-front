import { onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'

import { driveBridge } from './bridge'
import { useDriveReturnStore } from './returnStore'

/**
 * À appeler une fois, au démarrage de l'application (`App.vue`) : écoute le pont du drive pour que le résultat d'un passage soit gardé
 * même si aucun écran du drive n'est ouvert, puis mène à l'écran du retour. Le résultat `aborted` d'un passage que l'utilisateur a
 * lui-même abandonné (brouillon déjà effacé) est ignoré : il n'y a rien à lui montrer.
 */
export function useDriveReturn() {
  const router = useRouter()
  const store = useDriveReturnStore()

  driveBridge.listen()
  const stop = driveBridge.onEvent((event) => {
    if (
      event.kind === 'stale' &&
      event.result.type === 'result' &&
      event.result.outcome === 'aborted'
    )
      return
    store.receive(event)
    if (router.currentRoute.value.name !== 'drive-return')
      void router.push({ name: 'drive-return' })
  })
  onScopeDispose(stop)
}
