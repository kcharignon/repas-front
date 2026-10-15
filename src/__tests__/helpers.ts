import { vi } from 'vitest'
import type { Plugin } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { createQueryClient } from '@/api/query'
import { i18n } from '@/i18n'
import { routes } from '@/router'

export const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init })

export type Handler = (request: Request) => Response | Promise<Response>

/**
 * Remplace `fetch` par un faux back : une entrée par route (`'POST /api/login_check'`). Un appel non prévu fait échouer le
 * test (le back n'est jamais joint pour de vrai). Rend le double pour vérifier les appels.
 */
export function stubApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const request = input as Request
    const key = `${request.method} ${new URL(request.url).pathname}`
    const handler = handlers[key]
    if (handler === undefined) throw new Error(`Appel d'API non prévu dans le test : ${key}`)

    return handler(request)
  })
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

/** Appels reçus par le faux back, sous la forme `'POST /api/login_check'`. */
export const calls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.map(([input]) => {
    const request = input as Request

    return `${request.method} ${new URL(request.url).pathname}`
  })

/** Pinia, routeur en mémoire (sans garde de session), données serveur sans réessai et i18n : de quoi monter une vue. */
export function appContext() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  // Le vrai client (avec ses retours d'erreur d'écriture), sans réessai pour ne pas attendre dans les tests
  const queryClient = createQueryClient()
  const defaults = queryClient.getDefaultOptions()
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } })

  const plugins: (Plugin | [Plugin, ...unknown[]])[] = [
    pinia,
    i18n,
    router,
    [VueQueryPlugin, { queryClient }],
  ]

  return { pinia, router, queryClient, plugins }
}

export const me = {
  id: 'u1',
  email: 'alexiane@example.com',
  roles: ['ROLE_USER'],
  isAdmin: false,
  defaultServing: 4,
}

/** Corps JSON de la requête n° `index` reçue par le faux back. */
export async function bodyOf(
  fetchMock: ReturnType<typeof stubApi>,
  index: number,
): Promise<unknown> {
  const call = fetchMock.mock.calls[index]
  if (call === undefined) throw new Error(`Aucune requête n° ${index}`)

  return (call[0] as Request).json()
}
