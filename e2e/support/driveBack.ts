// Faux back du drive pour les tests de bout en bout (sans back ni compte) : l'API est simulée par `page.route`, avec un état qui suit
// les écritures. Données inventées uniquement (magasin `123456`, produits « Marque Repère » et « Marque Test »).
import type { Page, Route } from '@playwright/test'

interface Product {
  productId: string
  retailerProductId: string
  ean: null
  label: string
  content: { value: number; unit: string } | null
  /** La contenance dans l'unité de la liste (DRV-652), `null` quand la personne n'en a pas donné. */
  packSize?: { value: number; unitSlug: string } | null
}
interface Choice {
  ingredientSlug: string
  ingredientName: string
  haveAtHome: boolean
  accepted: { rank: number; product: Product }[]
  rejected: Product[]
  updatedAt: string
}

const product = (
  id: string,
  label: string,
  content: Product['content'] = { value: 1, unit: 'kg' },
): Product => ({
  productId: `p-${id}`,
  retailerProductId: `${id}00000`.slice(0, 6),
  ean: null,
  label,
  content,
})

const choice = (
  slug: string,
  name: string,
  accepted: Product[],
  rejected: Product[] = [],
  haveAtHome = false,
): Choice => ({
  ingredientSlug: slug,
  ingredientName: name,
  haveAtHome,
  accepted: accepted.map((item, index) => ({ rank: index + 1, product: item })),
  rejected,
  updatedAt: '2026-10-18T10:00:00+02:00',
})

/** Un fromage que la liste compte en tranches, dont la personne a donné la contenance (DRV-652). */
export const cheddar = {
  ...product('5', 'Fromage cheddar en tranches 20 Tranches - 340g', { value: 340, unit: 'g' }),
  packSize: { value: 20, unitSlug: 'tranche' },
}
export const cheddarChoice = choice('cheddar', 'Cheddar en tranche', [cheddar])

export const farineA = product('1', 'Farine de blé T55 Marque Repère 1 kg')
export const farineB = product('2', 'Farine T45 Marque Test 1 kg')
export const farineC = product('3', 'Farine complète Marque Test 1 kg')

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

export interface DriveBackOptions {
  enabled?: boolean
  store?: { id: string; baseUrl: string; label?: string } | null
  choices?: Choice[]
}

export interface DriveBack {
  /** Les appels reçus, sous la forme `'PUT /api/v1/drive/choices/farine'`. */
  received: string[]
  /** Les corps JSON des écritures, dans l'ordre. */
  bodies: unknown[]
  choices: Choice[]
  /** Le magasin enregistré, `null` s'il n'y en a pas. */
  store: { id: string; baseUrl: string; label?: string | null } | null
}

/** Un faux back où l'utilisateur est connecté, le drive allumé, un magasin et trois ingrédients ayant une préférence. */
export async function fakeDriveBack(
  page: Page,
  options: DriveBackOptions = {},
): Promise<DriveBack> {
  const back: DriveBack = {
    received: [],
    bodies: [],
    // Une copie : le faux back écrit dans ses choix (la contenance corrigée), et les constantes du module servent à tous les tests du processus
    choices: structuredClone(
      options.choices ?? [
        choice('farine', 'Farine', [farineA, farineB], [farineC]),
        choice('oeufs', 'Œufs', [product('4', 'Œufs plein air x6', { value: 6, unit: 'piece' })]),
        choice('sel', 'Sel', [], [], true),
      ],
    ),
    store:
      options.store === undefined
        ? { id: '123456', baseUrl: 'https://exemple.leclercdrive.fr/magasin-123456-123456' }
        : options.store,
  }
  const find = (slug: string) => back.choices.find((item) => item.ingredientSlug === slug)

  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const key = `${request.method()} ${path}`
      back.received.push(key)
      const slug = /^\/api\/v1\/drive\/choices\/([a-z0-9-]+)$/.exec(path)?.[1]

      if (key === 'POST /api/auth/refresh') return reply(route, { token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return reply(route, {
          id: 'u1',
          email: 'alexiane@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/drive/settings')
        return reply(route, {
          enabled: options.enabled ?? true,
          retailer: 'leclerc',
          store: back.store,
        })
      if (key === 'PUT /api/v1/drive/settings') {
        const body = request.postDataJSON() as { store: NonNullable<DriveBack['store']> }
        back.bodies.push(body)
        const valid = /^https:\/\/[a-z0-9-]+\.leclercdrive\.fr\/magasin-(\d+)-\d+$/.exec(
          body.store.baseUrl,
        )
        if (valid?.[1] !== body.store.id)
          return reply(route, { error: { message: 'DRIVE_STORE_INVALID' } }, 422)
        back.store = body.store

        return reply(route)
      }
      if (key === 'GET /api/v1/drive/choices')
        return reply(route, { member: back.choices, totalItems: back.choices.length })
      if (key === 'GET /api/v1/units')
        return reply(route, {
          member: [
            { slug: 'tranche', name: 'tranche', symbol: '', dimension: null, baseFactor: null },
            { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
          ],
          totalItems: 2,
        })
      // La contenance d'un produit corrigée (DRV-652) : un ADD_PRODUCT du même produit, qui remplace sa contenance
      if (key === 'PUT /api/v1/drive/choices') {
        const body = request.postDataJSON() as {
          choices: {
            ingredientSlug: string
            action: string
            product: { retailerProductId: string; packSize?: Product['packSize'] }
          }[]
        }
        back.bodies.push(body)
        for (const intent of body.choices) {
          const accepted = find(intent.ingredientSlug)?.accepted ?? []
          const known = accepted.find(
            (entry) => entry.product.retailerProductId === intent.product.retailerProductId,
          )
          if (known && intent.product.packSize !== undefined)
            known.product.packSize = intent.product.packSize
        }

        return reply(route)
      }
      if (slug !== undefined && request.method() === 'PUT') {
        const body = request.postDataJSON() as {
          haveAtHome: boolean
          accepted: string[]
          rejected: string[]
        }
        back.bodies.push(body)
        const known = new Map(
          back.choices.flatMap((item) =>
            [...item.accepted.map((entry) => entry.product), ...item.rejected].map(
              (candidate) => [candidate.productId, candidate] as const,
            ),
          ),
        )
        const pick = (ids: string[]) => ids.map((id) => known.get(id)).filter((item) => item)
        const next = choice(
          slug,
          find(slug)?.ingredientName ?? slug,
          pick(body.accepted) as Product[],
          pick(body.rejected) as Product[],
          body.haveAtHome,
        )
        back.choices = back.choices.map((item) => (item.ingredientSlug === slug ? next : item))

        return reply(route)
      }
      if (slug !== undefined && request.method() === 'DELETE') {
        back.choices = back.choices.filter((item) => item.ingredientSlug !== slug)

        return reply(route)
      }

      return reply(route, { error: { message: 'inconnu' } }, 404)
    },
  )

  return back
}
