import { onScopeDispose, watch } from 'vue'

import { useSessionStore } from '@/session/session'
import { useAppVersionStore } from './appVersionStore'

/**
 * À appeler une fois, au démarrage de l'application (`App.vue`) (DRV-637). La version de l'application est lue par le pont dès le
 * démarrage, sans attendre ni bloquer l'affichage : elle part alors dans l'en-tête de chaque requête à l'API (`createAuthFetch`), le serveur
 * l'apprend dès la première. L'envoi explicite (`PUT /users/me/app-version`) est le filet, retenté tant qu'il n'a pas réussi : à
 * l'ouverture de session, quand la version devient connue ou change, et au retour de la page au premier plan. Dans un navigateur, rien n'est
 * envoyé.
 */
export function useAppVersionReport() {
  const session = useSessionStore()
  const versions = useAppVersionStore()

  void versions.read()

  const report = () => {
    const userId = session.user?.id ?? null
    if (userId !== null) void versions.report(userId, session.api)
  }

  watch(
    () => session.user?.id ?? null,
    (userId) => {
      if (userId === null) versions.forget()
      else report()
    },
    { immediate: true },
  )
  // La version devient connue (pont en retard) ou change (application mise à jour pendant que le site restait ouvert)
  watch(() => versions.running, report)

  // Retour au premier plan : l'application a pu être mise à jour, et un envoi échoué est retenté
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    void versions.reread().then(report)
  }
  document.addEventListener('visibilitychange', onVisible)
  onScopeDispose(() => document.removeEventListener('visibilitychange', onVisible))
}
