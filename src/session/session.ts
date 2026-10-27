import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, createApiClient, unwrap } from '@/api'
import type { CurrentUser } from '@/api'
import { forgetAccountData } from './accountData'

/** ADR 0015 §5 (back) : deux onglets qui rafraîchissent ensemble envoient le même cookie, le second perd la course. */
const RETRY_DELAY_MS = 300

/**
 * Un renouvellement qui n'a pas abouti sans que la session soit perdue (réseau, 429, 5xx) n'est pas redemandé tout de suite : les appels
 * qui arrivent pendant ce délai n'en lancent pas un autre. Le délai double à chaque échec de suite, de 2 s à 30 s.
 */
const HOLD_OFF_BASE_MS = 2_000
const HOLD_OFF_MAX_MS = 30_000
/** Le délai que le back annonce (`Retry-After`) est suivi, jusqu'à cette limite. */
const RETRY_AFTER_MAX_MS = 60_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Une réponse qui ne dit rien de la session : le back est injoignable, occupé ou en cours de redéploiement (réseau, 429, 5xx). */
const isUnreachable = (status: number): boolean => status === 0 || status === 429 || status >= 500

/** Le délai demandé par `Retry-After` (en secondes), en millisecondes ; 0 s'il manque ou s'il est illisible. */
function retryAfterMs(response: Response | null): number {
  const seconds = Number(response?.headers.get('Retry-After'))

  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, RETRY_AFTER_MAX_MS) : 0
}

/**
 * Indice « une session a existé sur ce navigateur » (pas un secret, aucun jeton) : sans lui, un visiteur qui ne s'est jamais
 * connecté ne sollicite pas `POST /api/auth/refresh` à chaque page (le back plafonne cette route par adresse IP). Les autres
 * fenêtres le relisent : quand l'une met fin à la session, il disparaît et toutes les autres suivent (`crossTab.ts`).
 */
export const SESSION_HINT_KEY = 'repas.session'
const HINT = SESSION_HINT_KEY

export const hasSessionHint = (): boolean => {
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
  /** Le dernier rafraîchissement n'a pas abouti sans que la session soit perdue (réseau, 429, 5xx : le back ne dit rien d'elle). */
  let unreachable = false
  /** Pas de nouvelle demande de rafraîchissement avant cet instant (`Date.now()`) : voir `holdOff`. */
  let holdOffUntil = 0
  let failuresInARow = 0

  /** Un seul rafraîchissement à la fois : dix requêtes en 401 n'en déclenchent qu'un, et pas un de plus pendant un délai d'attente. */
  function refresh(): Promise<string | null> {
    if (refreshing === null && Date.now() < holdOffUntil) {
      unreachable = true

      return Promise.resolve(null)
    }
    refreshing ??= requestToken().finally(() => {
      refreshing = null
    })

    return refreshing
  }

  /** La session n'est pas perdue : on garde l'indice, l'utilisateur et la copie hors-ligne, et on ne redemande qu'après un délai. */
  function holdOff(response: Response | null) {
    unreachable = true
    failuresInARow = Math.min(failuresInARow + 1, 10)
    const backoff = Math.min(HOLD_OFF_BASE_MS * 2 ** (failuresInARow - 1), HOLD_OFF_MAX_MS)
    holdOffUntil = Date.now() + Math.max(backoff, retryAfterMs(response))
  }

  function stopHoldingOff() {
    holdOffUntil = 0
    failuresInARow = 0
  }

  /**
   * Échange le cookie contre un jeton neuf. Seule une réponse 401 dit que la session est perdue (cookie absent, expiré, déjà utilisé,
   * compte désactivé : elle est retentée une fois, course entre onglets) ; toute autre réponse (429, 5xx, réseau) laisse la session
   * telle quelle.
   */
  async function requestToken(): Promise<string | null> {
    unreachable = false
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response
      try {
        const answer = await api.POST('/api/auth/refresh')
        response = answer.response
        if (response.ok && answer.data?.token) {
          token.value = answer.data.token
          setHint(true)
          stopHoldingOff()

          return token.value
        }
      } catch {
        // Pas de réseau : la session n'est pas perdue pour autant, on la garde pour le retour de la connexion.
        holdOff(null)

        return null
      }
      if (response.status !== 401) {
        holdOff(response)

        return null
      }
      if (attempt === 0) await sleep(RETRY_DELAY_MS)
    }
    clear()

    return null
  }

  const api = createApiClient({ auth: { token: () => token.value, refresh } })

  /** Met fin à la session de ce navigateur : jeton, utilisateur, indice, copie de l'utilisateur et ce que le drive gardait pour lui. */
  function clear() {
    token.value = null
    user.value = null
    stopHoldingOff()
    setHint(false)
    writeSnapshot(null)
    forgetAccountData()
  }

  /**
   * Une autre fenêtre a mis fin à la session (l'indice a disparu du navigateur) : celle-ci y met fin aussi, sans attendre sa prochaine
   * requête. Rend vrai quand elle vient de le faire.
   */
  function endIfSignedOutElsewhere(): boolean {
    if (hasSessionHint() || (token.value === null && user.value === null)) return false
    clear()

    return true
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
    if (!hasSessionHint()) {
      restored.value = true

      return
    }
    try {
      if ((await refresh()) !== null) await loadUser()
      else if (unreachable) resumeOffline()
    } catch (error) {
      if (error instanceof ApiError && isUnreachable(error.status)) resumeOffline()
      else clear()
    } finally {
      restored.value = true
    }
  }

  async function login(email: string, password: string) {
    const data = await unwrap(api.POST('/api/login_check', { body: { email, password } }))
    token.value = data.token ?? null
    stopHoldingOff()
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

  /** Demande le lien de réinitialisation ; le back répond 204 que l'adresse ait un compte ou non (ADR 0026 du back). */
  async function sendPasswordReset(email: string) {
    await unwrap(api.POST('/api/v1/users/password-reset/send', { body: { email } }))
  }

  /**
   * Fixe le nouveau mot de passe avec le secret du lien reçu : 422 `INVALID_PASSWORD_RESET_TOKEN` si le lien est inconnu, déjà
   * utilisé ou expiré. Le back ferme toutes les sessions du compte et n'en ouvre aucune (ADR 0026 du back) : la copie locale de
   * la session, devenue périmée, est effacée pour que la page de connexion qui suit ne renvoie pas à l'accueil.
   */
  async function resetPassword(token: string, password: string) {
    await unwrap(api.POST('/api/v1/users/password-reset/confirm', { body: { token, password } }))
    clear()
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
    endIfSignedOutElsewhere,
    reloadUser,
    login,
    register,
    sendEmailVerification,
    confirmEmail,
    sendPasswordReset,
    resetPassword,
    logout,
  }
})
