import type { Router } from 'vue-router'

import { SESSION_HINT_KEY, useSessionStore } from './session'

const isLocalStorage = (area: Storage | null): boolean => {
  try {
    return area === localStorage
  } catch {
    return false
  }
}

/**
 * Suit la session d'une fenêtre à l'autre : quand une autre fenêtre met fin à la session (déconnexion, mot de passe changé, session
 * perdue), l'indice de session disparaît du navigateur et celle-ci l'apprend par l'événement `storage`. Elle oublie alors tout ce
 * qu'elle gardait (utilisateur, données en mémoire, copie hors-ligne : elle ne les réécrit plus) et mène à la connexion, sans
 * garder l'adresse de la page ouverte. À appeler une fois, au démarrage, quand le routeur existe. Rend la fonction qui arrête l'écoute.
 */
export function followSessionAcrossTabs(router: Router): () => void {
  const session = useSessionStore()
  const onStorage = (event: StorageEvent) => {
    // Un événement qui ne parle pas du stockage durable, ou d'une autre clé que l'indice (null : tout le stockage a été vidé)
    if (!isLocalStorage(event.storageArea)) return
    if (event.key !== null && event.key !== SESSION_HINT_KEY) return

    if (!session.endIfSignedOutElsewhere()) return
    const route = router.currentRoute.value
    if (route.meta.public === true || route.meta.guestOnly === true) return
    void router.push({ name: 'login' })
  }
  window.addEventListener('storage', onStorage)

  return () => window.removeEventListener('storage', onStorage)
}
