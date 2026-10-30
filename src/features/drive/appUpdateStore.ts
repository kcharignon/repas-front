import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { useAppVersionStore } from './appVersionStore'
import { driveBridge } from './bridge'
import type { AppUpdateState } from './bridge'

/** Les états où l'application a dit qu'une version plus récente est publiée (ou qu'elle est en train de s'installer). */
const OFFERED = ['miseAJourDisponible', 'telechargement', 'pretAInstaller'] as const

/** Attente d'une réponse de l'application à `update.check`, en millisecondes : au-delà, l'état devient une erreur de vérification. */
const CHECK_TIMEOUT_MS = 30_000

/** Au plus une recherche « au passage » toutes les cinq minutes (le plafond de l'application). */
const CHECK_EVERY_MS = 5 * 60_000

/**
 * La mise à jour de l'application par elle-même (DRV-639), partagée par le bandeau de « Moi » et la page d'aide : l'état que l'application
 * dit (`update.state`) et les deux gestes de l'utilisateur, « chercher » et « Mettre à jour ». Tout se passe dans l'application (qui cherche,
 * télécharge dans son espace privé, vérifie l'empreinte SHA-256 et ouvre l'installateur d'Android) ; la page n'envoie aucune adresse, aucune
 * version, aucune empreinte, et ne passe ni par GitHub, ni par Chrome, ni par le dossier de fichiers.
 *
 * Hors de l'application, ou dans une application qui ne sait pas se mettre à jour (ancienne, variante de Google Play, construction de
 * débogage) : `supported` est faux et rien n'est envoyé. L'appelant garde alors l'ancien comportement (le lien vers l'aide).
 */
export const useAppUpdateStore = defineStore('appUpdate', () => {
  const versions = useAppVersionStore()
  const state = ref<AppUpdateState>({ status: 'inconnu' })
  /** L'utilisateur a touché « Mettre à jour » : l'invitation reste à l'écran jusqu'à ce que l'application soit installée ou à jour. */
  const engaged = ref(false)
  let lastCheckAt = Number.NEGATIVE_INFINITY
  let attaching: Promise<boolean> | null = null
  const waiters = new Set<() => void>()

  const supported = computed(() => versions.selfUpdate)
  /** L'application a dit qu'elle a trouvé une version plus récente (ou qu'elle la télécharge). */
  const offered = computed(() => OFFERED.some((status) => status === state.value.status))

  function receive(next: AppUpdateState) {
    state.value = next
    if (next.status !== 'inconnu' && next.status !== 'verification') {
      for (const wake of waiters) wake()
      waiters.clear()
    }
  }

  /**
   * Branche l'écoute de l'état (une seule fois) et redemande l'état actuel. Rend faux hors de l'application ou si elle ne sait pas se
   * mettre à jour : rien n'est alors envoyé.
   */
  function attach(): Promise<boolean> {
    attaching ??= versions.read().then(() => {
      if (!versions.selfUpdate) return false
      driveBridge.onUpdate(receive)
      try {
        driveBridge.updateStatus()
      } catch {
        // L'état se redemandera à la prochaine ouverture
      }

      return true
    })

    return attaching
  }

  /**
   * Attend le PROCHAIN état « connu » que l'application dit (autre chose que « inconnu » et « vérification »), ou le délai. À poser avant d'envoyer
   * la demande : l'application peut répondre aussitôt.
   */
  function nextSettled(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(done)
        receive({ status: 'erreur', code: 'CHECK_FAILED', version: null })
        resolve()
      }, CHECK_TIMEOUT_MS)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      waiters.add(done)
    })
  }

  /** Demande à l'application de chercher une version plus récente, et attend sa réponse. Sans effet si elle ne sait pas se mettre à jour. */
  async function check(): Promise<void> {
    if (!(await attach())) return
    // Un téléchargement ou une installation en cours n'est pas interrompu par une recherche
    if (state.value.status === 'telechargement' || state.value.status === 'pretAInstaller') return
    const answered = nextSettled()
    try {
      driveBridge.checkForUpdate()
    } catch {
      receive({ status: 'erreur', code: 'CHECK_FAILED', version: null })
    }
    await answered
  }

  /**
   * Une recherche « au passage » (ouverture de l'application, retour au premier plan, écran « Moi ») : au plus une toutes les cinq minutes,
   * le plafond de l'application, partagé par tous ces points d'entrée. Sans effet si l'application ne sait pas se mettre à jour.
   */
  async function checkIfDue(): Promise<void> {
    const now = Date.now()
    if (now - lastCheckAt < CHECK_EVERY_MS) return
    lastCheckAt = now
    await check()
  }

  /**
   * « Mettre à jour » : cherche si besoin puis lance le téléchargement, la vérification et l'installateur d'Android. Un seul geste de
   * l'utilisateur. Rend faux hors de l'application ou dans une application qui ne sait pas se mettre à jour : l'appelant propose alors
   * l'ancien chemin.
   */
  async function start(): Promise<boolean> {
    if (!(await attach())) return false
    engaged.value = true
    const retryable = state.value.status === 'erreur' && state.value.version !== null
    if (state.value.status !== 'miseAJourDisponible' && !retryable) await check()
    const now = state.value
    if (now.status === 'miseAJourDisponible' || (now.status === 'erreur' && now.version !== null)) {
      try {
        driveBridge.startUpdate()
      } catch {
        receive({ status: 'erreur', code: 'DOWNLOAD_FAILED', version: now.version })
      }
    }

    return true
  }

  return { state, engaged, supported, offered, attach, check, checkIfDue, start }
})
