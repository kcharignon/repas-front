import { computed } from 'vue'

import { useSessionStore } from '@/session/session'
import { offersAppUpdate } from './appVersion'
import { useAppUpdateStore } from './appUpdateStore'
import { useAppVersionStore } from './appVersionStore'
import { driveBridge } from './bridge'

/**
 * « Une version plus récente de l'application est disponible » : la règle unique de l'invitation de « Moi » (`AppUpdateBanner`) et de la
 * pastille de l'onglet « Moi ». Seulement dans l'application ; une application qui se met à jour seule dit elle-même s'il y a plus récent
 * (« à jour » : rien, même si le serveur croit l'ancienne version) ; sinon le serveur (`GET /me`, `appUpdate`). L'invitation reste pendant
 * un téléchargement.
 */
export function useAppUpdateAvailable() {
  const session = useSessionStore()
  const versions = useAppVersionStore()
  const updates = useAppUpdateStore()
  const inApp = driveBridge.isAvailable()

  /** Le serveur dit qu'une version plus récente est publiée (`GET /me`, comparée à la version que l'application donne). */
  const serverOffers = computed(() => offersAppUpdate(versions.running, session.user?.appUpdate))

  // Tant que le pont n'a pas répondu, rien : rien n'apparaît pour disparaître aussitôt
  const available = computed(() => {
    if (!inApp || (versions.status !== 'known' && versions.status !== 'unknown')) return false
    if (!updates.supported) return serverOffers.value
    // L'utilisateur a touché « Mettre à jour » : l'invitation reste jusqu'au bout (téléchargement, erreur à réessayer)
    if (updates.engaged) return updates.state.status !== 'aJour'
    if (updates.state.status === 'aJour') return false
    if (updates.offered) return true
    // Pas encore de réponse de l'application : on attend ; une erreur de recherche (hors connexion) retombe sur ce que dit le serveur
    return updates.state.status === 'erreur' && serverOffers.value
  })

  return { available, inApp }
}
