import createClient from 'openapi-fetch'

import { ApiError } from './errors'
import type { paths } from './schema'

/** Ce que le client attend de la session : le jeton d'accès courant et un moyen d'en obtenir un neuf (refresh). */
export interface AuthProvider {
  token(): string | null
  /** Échange le cookie de rafraîchissement contre un nouveau jeton ; `null` si la session est perdue. */
  refresh(): Promise<string | null>
  /**
   * Le dernier renouvellement n'a pas dit si la session tient (réseau, 429, 5xx) : la requête échoue alors comme un réseau coupé
   * (« injoignable »), pas comme une session perdue (401).
   */
  unreachable?(): boolean
}

export interface ApiClientOptions {
  baseUrl?: string
  auth: AuthProvider
  /**
   * La version de l'application Android qui fait tourner le site, quand elle est connue et envoyable (`null` sinon : navigateur, construction
   * de développement, pont qui n'a pas encore répondu). Lue de façon synchrone à CHAQUE requête vers l'API de Repas : le serveur retient ainsi
   * la version dès la première requête d'une session (en-têtes `X-App-Version` et `X-App-Platform`), jamais vers un autre hôte.
   */
  appVersion?: () => string | null
  /** Pour les tests ; par défaut le `fetch` du navigateur. */
  fetch?: typeof globalThis.fetch
}

/** Connexion et rafraîchissement n'ont pas de jeton à renouveler : un 401 y signifie « identifiants refusés ». */
const WITHOUT_REFRESH = ['/api/login_check', '/api/auth/']

const withBearer = (request: Request, token: string | null): Request => {
  if (token === null) return request
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)

  return new Request(request, { headers })
}

/** Les en-têtes par lesquels le serveur apprend la version de l'application (DRV-637) ; leurs noms sont fixés avec le back. */
export const APP_VERSION_HEADER = 'X-App-Version'
export const APP_PLATFORM_HEADER = 'X-App-Platform'

/** Origine de l'API de Repas : la requête n'y est jointe d'une version que si elle y va (le site ne parle qu'à son API, on le vérifie quand même). */
const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const withAppVersion = (
  request: Request,
  version: string | null,
  apiOrigin: string | null,
): Request => {
  if (version === null || apiOrigin === null || originOf(request.url) !== apiOrigin) return request
  const headers = new Headers(request.headers)
  headers.set(APP_VERSION_HEADER, version)
  headers.set(APP_PLATFORM_HEADER, 'android')

  return new Request(request, { headers })
}

/**
 * `fetch` qui pose le jeton d'accès et, sur un 401, demande un jeton neuf puis rejoue la requête **une seule fois**.
 */
export function createAuthFetch({
  auth,
  appVersion,
  baseUrl,
  fetch: baseFetch = (...args) => globalThis.fetch(...args),
}: ApiClientOptions) {
  const apiOrigin = originOf(baseUrl ?? globalThis.location?.origin ?? '')
  const stamp = (request: Request): Request =>
    withAppVersion(request, appVersion?.() ?? null, apiOrigin)

  return async (request: Request): Promise<Response> => {
    const replay = stamp(request.clone())
    const first = await baseFetch(withBearer(stamp(request), auth.token()))
    const { pathname } = new URL(request.url)
    if (first.status !== 401 || WITHOUT_REFRESH.some((prefix) => pathname.startsWith(prefix)))
      return first

    const token = await auth.refresh()
    if (token !== null) return baseFetch(withBearer(replay, token))
    if (auth.unreachable?.() === true) throw new TypeError('Session injoignable')

    return first
  }
}

/** Client typé par le contrat de l'API : chemins, paramètres, corps et réponses viennent de `schema.d.ts` (généré). */
export function createApiClient(options: ApiClientOptions) {
  return createClient<paths>({
    baseUrl: options.baseUrl ?? globalThis.location?.origin ?? '',
    fetch: createAuthFetch({ ...options, baseUrl: options.baseUrl ?? globalThis.location?.origin }),
  })
}

export type ApiClient = ReturnType<typeof createApiClient>

interface Result<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Rend les données d'une réponse réussie ; une réponse en erreur (ou le réseau) lève une `ApiError`. */
export async function unwrap<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>
  try {
    result = await request
  } catch (cause) {
    throw ApiError.network(cause)
  }
  if (!result.response.ok) throw ApiError.fromResponse(result.response, result.error)

  return result.data as T
}
