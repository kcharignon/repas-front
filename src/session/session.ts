import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, createApiClient, unwrap } from '@/api'
import type { CurrentUser } from '@/api'

/** ADR 0015 §5 (back) : deux onglets qui rafraîchissent ensemble envoient le même cookie, le second perd la course. */
const RETRY_DELAY_MS = 300

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Indice « une session a existé sur ce navigateur » (pas un secret, aucun jeton) : sans lui, un visiteur qui ne s'est jamais
 * connecté ne sollicite pas `POST /api/auth/refresh` à chaque page (le back plafonne cette route par adresse IP).
 */
const HINT = 'repas.session'

const hasHint = (): boolean => {
  try {
    return localStorage.getItem(HINT) === '1'
  } catch {
    return false
  }
}

/**
 * Copie de l'utilisateur courant, pour retrouver la session quand le réseau manque au démarrage (liste lue hors-ligne). Pas de
 * jeton ici, seulement ce que `GET /api/v1/me` rend ; effacée avec la session.
 */
const SNAPSHOT = 'repas.user'

const readSnapshot = (): CurrentUser | null => {
  try {
    const raw = localStorage.getItem(SNAPSHOT)

    return raw ? (JSON.parse(raw) as CurrentUser) : null
  } catch {
    return null
  }
}

const writeSnapshot = (user: CurrentUser | null) => {
  try {
    if (user) localStorage.setItem(SNAPSHOT, JSON.stringify(user))
    else localStorage.removeItem(SNAPSHOT)
  } catch {
    // Stockage indisponible : pas de reprise hors-ligne, la connexion fonctionne comme avant.
  }
}

const setHint = (present: boolean) => {
  try {
    if (present) localStorage.setItem(HINT, '1')
    else localStorage.removeItem(HINT)
  } catch {
    // Stockage indisponible : la session se retrouvera simplement par la connexion.
  }
}

/**
 * Session de l'utilisateur : le jeton d'accès vit **en mémoire seulement** (jamais `localStorage`) ; au rechargement de la
 * page, le cookie `HttpOnly` de rafraîchissement en fournit un nouveau (ADR 0015 du back, ADR 0005 du front).
 */
export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(null)
  const user = ref<CurrentUser | null>(null)
  const restored = ref(false)
  let refreshing: Promise<string | null> | null = null
  /** Le dernier rafraîchissement a échoué faute de réseau (et non parce que la session est perdue). */
  let unreachable = false

  /** Un seul rafraîchissement à la fois : dix requêtes en 401 n'en déclenchent qu'un. */
  function refresh(): Promise<string | null> {
    refreshing ??= requestToken().finally(() => {
      refreshing = null
    })

    return refreshing
  }

  async function requestToken(): Promise<string | null> {
    unreachable = false
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, response } = await api.POST('/api/auth/refresh')
        if (response.ok && data?.token) {
          token.value = data.token
          setHint(true)

          return token.value
        }
        if (response.status !== 401) break
      } catch {
        // Pas de réseau : la session n'est pas perdue pour autant, on la garde pour le retour de la connexion.
        unreachable = true

        return null
      }
      if (attempt === 0) await sleep(RETRY_DELAY_MS)
    }
    clear()

    return null
  }

  const api = createApiClient({ auth: { token: () => token.value, refresh } })

  function clear() {
    token.value = null
    user.value = null
    setHint(false)
    writeSnapshot(null)
  }

  async function loadUser() {
    user.value = await unwrap(api.GET('/api/v1/me'))
    writeSnapshot(user.value)
  }

  /** Sans réseau au démarrage : l'utilisateur de la dernière session, pour lire ce qui a été gardé hors-ligne. */
  function resumeOffline() {
    user.value = readSnapshot()
  }

  /** Relit l'utilisateur (après un changement de réglages). */
  async function reloadUser() {
    await loadUser()
  }

  /** Au démarrage de l'application : retrouve la session grâce au cookie de rafraîchissement, une seule fois. */
  async function restore() {
    if (restored.value) return
    if (!hasHint()) {
      restored.value = true

      return
    }
    try {
      if ((await refresh()) !== null) await loadUser()
      else if (unreachable) resumeOffline()
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) resumeOffline()
      else clear()
    } finally {
      restored.value = true
    }
  }

  async function login(email: string, password: string) {
    const data = await unwrap(api.POST('/api/login_check', { body: { email, password } }))
    token.value = data.token ?? null
    await loadUser()
    setHint(true)
    restored.value = true
  }

  /** Crée le compte, en attente : le back envoie un lien de confirmation, la connexion n'est possible qu'après (ADR 0020 du back). */
  async function register(email: string, password: string, defaultServing: number) {
    await unwrap(api.POST('/api/v1/users', { body: { email, password, defaultServing } }))
  }

  /** Renvoie le lien de confirmation ; le back répond 204 sans dire si l'adresse a un compte en attente. */
  async function sendEmailVerification(email: string) {
    await unwrap(api.POST('/api/v1/users/email-verification/send', { body: { email } }))
  }

  /** Confirme l'adresse avec le secret du lien reçu : 422 si le lien est inconnu, déjà utilisé ou expiré. */
  async function confirmEmail(token: string) {
    await unwrap(api.POST('/api/v1/users/email-verification/confirm', { body: { token } }))
  }

  /** Révoque la connexion côté back (cookie compris) ; l'utilisateur est déconnecté même si le back est injoignable. */
  async function logout() {
    try {
      await api.POST('/api/auth/logout')
    } catch (error) {
      if (!(error instanceof TypeError) && !(error instanceof ApiError)) throw error
    } finally {
      clear()
    }
  }

  return {
    user,
    restored,
    api,
    isAuthenticated: computed(() => user.value !== null),
    isAdmin: computed(() => user.value?.isAdmin === true),
    restore,
    reloadUser,
    login,
    register,
    sendEmailVerification,
    confirmEmail,
    logout,
  }
})
