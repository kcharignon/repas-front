// Faux back de l'écran d'envoi à plusieurs drives (DRV-710), sans back ni compte : l'API est simulée par `page.route`. Le verdict de la règle de choix
// (`selection`) est dit par le test, jamais recalculé ici (la règle est testée dans le back). Données inventées : deux magasins d'essai, produits de test.
import type { Page, Route } from '@playwright/test'

import { estimate, plan } from './drive'

type Id = 'leclerc' | 'auchan'

const FIRST_STORE = {
  id: '123456',
  label: 'Ville-Test',
  baseUrl: 'https://exemple.leclercdrive.fr/magasin-123456-123456',
}
export const SECOND_STORE = {
  id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
  label: null,
  baseUrl: 'https://www.auchan.fr/',
}
const NAMES = { leclerc: 'Leclerc', auchan: 'Auchan' } as const

const needed = {
  quantity: 800,
  unitSymbol: 'g',
  dimension: 'WEIGHT',
  baseFactor: 1,
  unitSlug: 'gramme',
  unitName: 'gramme',
}

/** Le plan de la liste `l1` chez le second drive : un produit connu (identifiants à tirets) et un article à choisir. */
export const secondPlan = {
  shoppingListId: 'l1',
  listVersion: 7,
  retailer: 'auchan',
  store: { id: SECOND_STORE.id, label: null, baseUrl: SECOND_STORE.baseUrl },
  generatedAt: '2026-10-18T10:00:00+02:00',
  counts: { known: 1, new: 1, haveAtHome: 0 },
  lines: [
    {
      ingredientSlug: 'farine',
      ingredientName: 'Farine',
      needed,
      status: 'KNOWN',
      products: [
        {
          rank: 1,
          retailerProductId: '5d3c2b1a-9f8e-4d7c-8b6a-0123456789ab',
          offerId: 'c3b2a1d0-5e4f-4a6b-9c8d-7e6f5a4b3c2d',
          ean: null,
          label: 'Farine de blé T55 1 kg',
          content: { value: 1000, unit: 'g' },
          packs: 1,
          packsStatus: 'COMPUTED',
          packSize: null,
        },
      ],
      rejected: [],
      searchQuery: 'Farine',
    },
    {
      ingredientSlug: 'poivre',
      ingredientName: 'Poivre',
      needed: {
        ...needed,
        quantity: 2,
        unitSymbol: 'pièce',
        dimension: 'COUNT',
        unitSlug: 'piece',
        unitName: 'pièce',
      },
      status: 'NEW',
      products: [],
      rejected: [],
      searchQuery: 'Poivre',
    },
  ],
}

export interface SendBackOptions {
  /** Le verdict du back : `NONE`, `AUTO` (le drive habituel ou le seul configuré) ou `ASK` (la question). */
  mode: 'NONE' | 'AUTO' | 'ASK'
  retailer: Id | null
  /** Les drives configurés ; les deux par défaut. */
  configured?: Id[]
  habitual?: Id | null
  lastUsed?: Id | null
  /** Une réponse de réglages d'avant les drives multiples (ni `retailers` ni `selection`). */
  legacy?: boolean
}

export interface SendBack {
  /** Les appels reçus, `'GET /api/v1/drive/plans/l1?retailer=auchan'`. */
  received: string[]
  /** Les corps de `PUT /drive/last-retailer` et de `PUT /drive/choices`, dans l'ordre. */
  lastRetailers: unknown[]
  choices: unknown[]
  /** Les corps de `POST /drive/plans/l1/basket-lines` (les articles mis au panier, cochés dans la liste, DRV-747). */
  baskets: unknown[]
}

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

/** Un faux back où la personne est connectée, le drive allumé et deux drives servis (selon `options`). */
export async function fakeSendBack(page: Page, options: SendBackOptions): Promise<SendBack> {
  const back: SendBack = { received: [], lastRetailers: [], choices: [], baskets: [] }
  const configured = options.configured ?? (['leclerc', 'auchan'] as Id[])
  const stores = { leclerc: FIRST_STORE, auchan: SECOND_STORE }
  const current: Id = options.retailer ?? configured[0] ?? 'leclerc'
  const settings = options.legacy
    ? { enabled: true, retailer: current, store: stores[current] }
    : {
        enabled: true,
        retailer: current,
        store: configured.includes(current) ? stores[current] : null,
        retailers: (['leclerc', 'auchan'] as const).map((id) => ({
          retailer: id,
          name: NAMES[id],
          configured: configured.includes(id),
          isDefault: options.habitual === id,
          store: configured.includes(id) ? stores[id] : null,
        })),
        defaultRetailer: options.habitual ?? null,
        lastUsedRetailer: options.lastUsed ?? null,
        selection: { mode: options.mode, retailer: options.retailer, candidates: configured },
      }

  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const key = `${request.method()} ${url.pathname}`
      back.received.push(`${key}${url.search}`)
      const asked = url.searchParams.get('retailer')

      switch (key) {
        case 'POST /api/auth/refresh':
          return reply(route, { token: 'jeton' })
        case 'GET /api/v1/me':
          return reply(route, {
            id: 'u1',
            email: 'alexiane@example.com',
            roles: ['ROLE_USER'],
            isAdmin: false,
            defaultServing: 4,
          })
        case 'GET /api/v1/drive/settings':
          return reply(route, settings)
        case 'GET /api/v1/drive/plans/l1':
          return reply(route, asked === 'auchan' ? secondPlan : plan)
        case 'GET /api/v1/drive/estimates/l1':
          return reply(route, asked === 'auchan' ? { ...estimate, retailer: 'auchan' } : estimate)
        case 'GET /api/v1/shopping-lists/l1':
          return reply(route, { id: 'l1', displayName: 'Courses', version: 7, status: 'SENT' })
        case 'PUT /api/v1/drive/last-retailer':
          back.lastRetailers.push(request.postDataJSON())
          return reply(route)
        case 'PUT /api/v1/drive/choices':
          back.choices.push(request.postDataJSON())
          return reply(route)
        case 'POST /api/v1/drive/plans/l1/basket-lines':
          back.baskets.push(request.postDataJSON())
          return reply(route)
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )

  return back
}
