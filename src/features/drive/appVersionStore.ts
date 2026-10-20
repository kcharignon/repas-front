import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { ApiClient } from '@/api'
import { isReportableAppVersion } from './appVersion'
import { driveBridge } from './bridge'

/** Où en est la lecture de la version par le pont : `known` (elle a répondu), `unknown` (pas d'application, ou pas de réponse). */
export type AppVersionStatus = 'idle' | 'reading' | 'known' | 'unknown'

/**
 * La version de l'application qui tourne (DRV-637), lue une seule fois par le pont natif et partagée : l'envoi au serveur au démarrage et le
 * bandeau de « Moi » posent la même question. La version vient de l'application, donc d'une source non fiable : elle ne sert qu'à informer.
 */
export const useAppVersionStore = defineStore('appVersion', () => {
  const running = ref<string | null>(null)
  const status = ref<AppVersionStatus>('idle')
  let reading: Promise<string | null> | null = null
  /** Le compte pour qui la version a déjà été envoyée pendant cette session de connexion. */
  let reportedFor: string | null = null

  /** La version de l'application, ou `null` dans un navigateur ou si l'application ne répond pas. */
  function read(): Promise<string | null> {
    if (status.value === 'known' || status.value === 'unknown')
      return Promise.resolve(running.value)
    if (!driveBridge.isAvailable()) {
      status.value = 'unknown'

      return Promise.resolve(null)
    }
    status.value = 'reading'
    reading ??= driveBridge.info().then(
      (info) => {
        running.value = info.version
        status.value = 'known'

        return info.version
      },
      () => {
        status.value = 'unknown'

        return null
      },
    )

    return reading
  }

  /**
   * Envoie la version au serveur, une fois par session de connexion. Rien dans un navigateur, rien pour une construction de développement
   * ou une version mal formée ; un échec (réseau, `422`, autre) reste silencieux et n'est pas réessayé : le prochain démarrage le refera.
   */
  async function report(userId: string, api: ApiClient): Promise<void> {
    if (reportedFor === userId || !driveBridge.isAvailable()) return
    reportedFor = userId
    const version = await read()
    if (!isReportableAppVersion(version)) return
    try {
      await api.PUT('/api/v1/users/me/app-version', { body: { platform: 'android', version } })
    } catch {
      // Hors connexion ou serveur injoignable : la version sera envoyée au prochain démarrage.
    }
  }

  /** La session est fermée : la prochaine connexion enverra de nouveau la version. */
  function forget() {
    reportedFor = null
  }

  return { running, status, read, report, forget }
})
