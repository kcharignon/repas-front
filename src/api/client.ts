import createClient from 'openapi-fetch'

import { ApiError } from './errors'
import type { paths } from './schema'

/** Ce que le client attend de la session : le jeton d'accès courant et un moyen d'en obtenir un neuf (refresh). */
export interface AuthProvider {
  token(): string | null
  /** Échange le cookie de rafraîchissement contre un nouveau jeton ; `null` si la session est perdue. */
  refresh(): Promise<string | null>
}

export interface ApiClientOptions {
  baseUrl?: string
  auth: AuthProvider
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

/**
 * `fetch` qui pose le jeton d'accès et, sur un 401, demande un jeton neuf puis rejoue la requête **une seule fois**.
 */
export function createAuthFetch({
  auth,
  fetch: baseFetch = (...args) => globalThis.fetch(...args),
}: ApiClientOptions) {
  return async (request: Request): Promise<Response> => {
    const replay = request.clone()
    const first = await baseFetch(withBearer(request, auth.token()))
    const { pathname } = new URL(request.url)
    if (first.status !== 401 || WITHOUT_REFRESH.some((prefix) => pathname.startsWith(prefix)))
      return first

    const token = await auth.refresh()

    return token === null ? first : baseFetch(withBearer(replay, token))
  }
}

/** Client typé par le contrat de l'API : chemins, paramètres, corps et réponses viennent de `schema.d.ts` (généré). */
export function createApiClient(options: ApiClientOptions) {
  return createClient<paths>({
    baseUrl: options.baseUrl ?? globalThis.location?.origin ?? '',
    fetch: createAuthFetch(options),
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
