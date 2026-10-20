import { watch } from 'vue'

import { useSessionStore } from '@/session/session'
import { useAppVersionStore } from './appVersionStore'

/**
 * À appeler une fois, au démarrage de l'application (`App.vue`) : dès qu'une session est ouverte (connexion, ou session retrouvée au
 * démarrage), l'application dit sa version au serveur (DRV-637), une seule fois par session. Dans un navigateur, rien n'est envoyé.
 */
export function useAppVersionReport() {
  const session = useSessionStore()
  const versions = useAppVersionStore()

  watch(
    () => session.user?.id ?? null,
    (userId) => {
      if (userId === null) versions.forget()
      else void versions.report(userId, session.api)
    },
    { immediate: true },
  )
}
