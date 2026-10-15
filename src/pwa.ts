import { registerSW } from 'virtual:pwa-register'

/** Enregistre le service worker (coque de l'application disponible hors-ligne, mise à jour automatique). Production seulement. */
export function registerServiceWorker() {
  registerSW({ immediate: true })
}
