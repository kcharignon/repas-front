import { registerSW } from 'virtual:pwa-register'

import { watchForUpdates } from './pwaUpdate'

/**
 * Enregistre le service worker (coque de l'application disponible hors-ligne). Mise à jour automatique : une nouvelle version
 * s'active seule (`skipWaiting` et `clientsClaim`, vite.config.ts) puis l'application se recharge. Production seulement.
 */
export function registerServiceWorker() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (registration !== undefined) watchForUpdates(registration)
    },
  })
}
