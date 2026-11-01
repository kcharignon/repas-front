import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { ApiClient } from '@/api'
import { isReportableAppVersion } from './appVersion'
import { driveBridge } from './bridge'

/** Où en est la lecture de la version par le pont : `known` (elle a répondu), `unknown` (pas d'application, ou pas de réponse). */
export type AppVersionStatus = 'idle' | 'reading' | 'known' | 'unknown'

/** Combien de fois la lecture de la version par le pont peut rester sans réponse avant qu'on la tienne pour inconnue. */
const MAX_READ_FAILURES = 3
/** Combien de fois le même couple compte + version est envoyé sans succès avant qu'on s'arrête (le prochain démarrage recommence). */
const MAX_REPORT_ATTEMPTS = 5

/**
 * La version de l'application qui tourne (DRV-637), lue par le pont natif et partagée : l'en-tête `X-App-Version` de chaque requête, l'envoi
 * au serveur et le bandeau de « Moi » posent la même question. La version vient de l'application, donc d'une source non fiable : elle ne sert
 * qu'à informer.
 */
export const useAppVersionStore = defineStore('appVersion', () => {
  const running = ref<string | null>(null)
  /** L'application sait se mettre à jour elle-même (DRV-639, `app.info` : `selfUpdate`). Faux tant qu'elle ne l'a pas dit, ou si elle ne le sait pas. */
  const selfUpdate = ref(false)
  const status = ref<AppVersionStatus>('idle')
  let reading: Promise<string | null> | null = null
  let readFailures = 0
  /** Le dernier couple compte + version que le serveur a ACCEPTÉ (ou refusé pour de bon, `422`) : le même n'est pas renvoyé. */
  let settled: string | null = null
  /** Les essais du couple compte + version courant. */
  let attempts: { key: string; count: number } | null = null
  /** Les envois se suivent un à un : deux déclencheurs proches ne font pas deux requêtes, le second voit le résultat du premier. */
  let queue: Promise<void> = Promise.resolve()
  /** Change à chaque fermeture de session : un envoi parti avant ne dit pas « fait » pour la session d'après. */
  let generation = 0

  function learn(info: { version: string; selfUpdate?: boolean }): string {
    running.value = info.version
    selfUpdate.value = info.selfUpdate === true
    status.value = 'known'

    return info.version
  }

  /**
   * La version de l'application, ou `null` dans un navigateur ou si l'application ne répond pas. Une lecture sans réponse (le pont peut
   * répondre trop tard) est refaite à l'appel suivant, trois fois au plus ; dans un navigateur, rien n'est jamais figé.
   */
  function read(): Promise<string | null> {
    if (
      status.value === 'known' ||
      (status.value === 'unknown' && readFailures >= MAX_READ_FAILURES)
    )
      return Promise.resolve(running.value)
    if (!driveBridge.isAvailable()) {
      status.value = 'unknown'

      return Promise.resolve(null)
    }
    status.value = 'reading'
    reading ??= driveBridge
      .info()
      .then(learn, () => {
        readFailures++
        status.value = 'unknown'

        return null
      })
      .finally(() => {
        reading = null
      })

    return reading
  }

  /**
   * Redemande sa version à l'application (retour au premier plan) : elle a pu être mise à jour pendant que le site restait ouvert. Sans
   * réponse, la version déjà connue reste.
   */
  async function reread(): Promise<void> {
    if (!driveBridge.isAvailable()) return
    try {
      learn(await driveBridge.info())
    } catch {
      // Pas de réponse : on garde ce qu'on sait.
    }
  }

  async function send(userId: string, api: ApiClient): Promise<void> {
    if (!driveBridge.isAvailable()) return
    const version = await read()
    if (!isReportableAppVersion(version)) return
    const key = `${userId} ${version}`
    const mine = generation
    if (settled === key) return
    if (attempts?.key !== key) attempts = { key, count: 0 }
    if (attempts.count >= MAX_REPORT_ATTEMPTS) return
    attempts.count++
    try {
      const { response } = await api.PUT('/api/v1/users/me/app-version', {
        body: { platform: 'android', version },
      })
      if (mine === generation && (response.ok || response.status === 422)) settled = key
    } catch {
      // Hors connexion ou serveur injoignable : un prochain appel retentera.
    }
  }

  /**
   * Dit la version au serveur (`PUT /api/v1/users/me/app-version`). Rien dans un navigateur, rien pour une construction de développement
   * ou une version mal formée. Un envoi n'est tenu pour fait qu'une fois RÉUSSI : un échec (réseau, 5xx, pont en retard) se retente au
   * prochain appel (connexion, version qui change, retour au premier plan), cinq fois au plus par couple compte + version ; un `422` est
   * définitif. La même version déjà acceptée n'est pas renvoyée ; une version qui change l'est. Le serveur l'apprend aussi par l'en-tête
   * de n'importe quelle requête (`createAuthFetch`) : cet envoi est le filet.
   */
  function report(userId: string, api: ApiClient): Promise<void> {
    queue = queue.then(() => send(userId, api))

    return queue
  }

  /** La session est fermée : la prochaine connexion enverra de nouveau la version. */
  function forget() {
    generation++
    settled = null
    attempts = null
  }

  return { running, selfUpdate, status, read, reread, report, forget }
})
