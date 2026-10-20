// Un faux back pour la fusion d'ingrédients (ING-007), sans compte ni base : l'API est simulée par `page.route`, avec un état qui suit les
// fusions et les « Pas le même ». Les cas viennent de la production, avec des données inventées : « Melon » en double (un perso, un adopté),
// « Épice guacamole » et « Épice pour guacamole », « Pâte » et « Pâte-2 ».
import type { Page, Route } from '@playwright/test'

export interface Side {
  slug: string
  name: string
  departmentSlug: string
  departmentName: string
  purchaseUnitName: string
  recipeCount: number
  listCount: number
}

export interface Pair {
  first: Side
  second: Side
  score: number
  level: string
  suggestedKeep: string
}

const side = (
  slug: string,
  name: string,
  recipeCount: number,
  listCount: number,
  departmentSlug = 'fruit-et-legume',
  departmentName = 'Fruit & légume',
): Side => ({
  slug,
  name,
  departmentSlug,
  departmentName,
  purchaseUnitName: 'kilo',
  recipeCount,
  listCount,
})

export const productionPairs = (): Pair[] => [
  {
    first: side('melon', 'Melon', 1, 0),
    second: side('melon-2', 'Melon', 0, 0),
    score: 1,
    level: 'EXACT',
    suggestedKeep: 'melon',
  },
  {
    first: side('epice-guacamole', 'Épice guacamole', 2, 1, 'epicerie', 'Épicerie'),
    second: side('epice-pour-guacamole', 'Épice pour guacamole', 5, 2, 'epicerie', 'Épicerie'),
    score: 0.93,
    level: 'SUGGESTION',
    suggestedKeep: 'epice-pour-guacamole',
  },
  {
    first: side('pate', 'Pâte', 3, 1, 'epicerie', 'Épicerie'),
    second: side('pate-2', 'Pâte', 1, 0, 'epicerie', 'Épicerie'),
    score: 1,
    level: 'EXACT',
    suggestedKeep: 'pate',
  },
]

const sideOf = (side: Side) => ({
  slug: side.slug,
  name: side.name,
  departmentSlug: side.departmentSlug,
  departmentName: side.departmentName,
  purchaseUnitName: side.purchaseUnitName,
})

export interface PreviewOverride {
  blockedBy?: string | null
  canMerge?: boolean
  missingUnits?: { slug: string; name: string }[]
  departmentChanges?: boolean
  listQuantitiesConverted?: boolean
}

export interface Options {
  pairs?: Pair[]
  /** Le verdict de l'aperçu de `absorbé>gardé`, sinon une fusion possible. */
  previews?: Record<string, PreviewOverride>
  /** Les réponses de la fusion dans l'ordre (une fois épuisées : `204`). */
  mergeAnswers?: { status: number; message?: string }[]
  /** Un retard avant que la liste des doublons ne réponde (pour voir l'état de chargement). */
  slowDuplicates?: number
}

const find = (pairs: Pair[], slug: string) =>
  pairs.flatMap((pair) => [pair.first, pair.second]).find((candidate) => candidate.slug === slug)

export async function fakeIngredientsBack(page: Page, options: Options = {}) {
  let pairs = options.pairs ?? productionPairs()
  const mergeAnswers = [...(options.mergeAnswers ?? [])]
  const received: { key: string; body: unknown; query: string }[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))

  const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
    route.fulfill(
      body === undefined
        ? { status }
        : { status, contentType: 'application/json', body: JSON.stringify(body) },
    )

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const key = `${request.method()} ${url.pathname}`
      received.push({
        key,
        body: request.postData() === null ? null : (request.postDataJSON() as unknown),
        query: url.search,
      })
      const [, , , , slug = '', action = ''] = url.pathname.split('/')

      if (key === 'POST /api/auth/refresh') return reply(route, { token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return reply(route, {
          id: 'u1',
          email: 'alexiane@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return reply(route, {
          shoppingListId: null,
          quantityByIngredientSlug: {},
          plannedRecipeIds: [],
        })
      if (key === 'GET /api/v1/departments')
        return reply(route, {
          member: [
            { slug: 'fruit-et-legume', name: 'Fruit & légume', image: '' },
            { slug: 'epicerie', name: 'Épicerie', image: '' },
          ],
          totalItems: 2,
        })
      if (key === 'GET /api/v1/units')
        return reply(route, {
          member: [{ slug: 'kilo', name: 'Kilo', symbol: 'kg' }],
          totalItems: 1,
        })
      if (url.pathname.endsWith('/ingredients') && url.pathname.startsWith('/api/v1/departments/'))
        return reply(route, { member: [], totalItems: 0 })

      if (key === 'GET /api/v1/ingredients/duplicates') {
        if (options.slowDuplicates !== undefined)
          await new Promise((resolve) => setTimeout(resolve, options.slowDuplicates))
        return reply(route, { member: pairs, totalItems: pairs.length })
      }

      if (action === 'merge-preview') {
        const into = url.searchParams.get('into') ?? ''
        const absorbed = find(pairs, slug)
        const kept = find(pairs, into)
        const override = options.previews?.[`${slug}>${into}`] ?? {}
        return reply(route, {
          keep: sideOf(kept ?? side(into, into, 0, 0)),
          absorbed: sideOf(absorbed ?? side(slug, slug, 0, 0)),
          recipeCount: absorbed?.recipeCount ?? 0,
          listCount: absorbed?.listCount ?? 0,
          driveChoiceCount: 0,
          departmentChanges: false,
          listQuantitiesConverted: false,
          missingUnits: [],
          blockedBy: null,
          canMerge: true,
          ...override,
        })
      }

      if (key.startsWith('POST') && action === 'merge') {
        const answer = mergeAnswers.shift()
        if (answer !== undefined && answer.status !== 204)
          return reply(route, { error: { message: answer.message ?? 'x' } }, answer.status)
        pairs = pairs.filter((pair) => pair.first.slug !== slug && pair.second.slug !== slug)
        return reply(route)
      }

      if (key.startsWith('POST') && action === 'distinct-from') {
        const other = (request.postDataJSON() as { other: string }).other
        pairs = pairs.filter(
          (pair) =>
            !(
              [pair.first.slug, pair.second.slug].includes(slug) &&
              [pair.first.slug, pair.second.slug].includes(other)
            ),
        )
        return reply(route)
      }

      if (action === 'merge-candidates') {
        const search = (url.searchParams.get('q') ?? '').toLowerCase()
        const all = [
          {
            slug: 'tomate',
            name: 'Tomate',
            departmentSlug: 'fruit-et-legume',
            departmentName: 'Fruit & légume',
            purchaseUnitName: 'kilo',
            recipeCount: 12,
            listCount: 3,
            sameDepartment: true,
            veryClose: true,
          },
          {
            slug: 'tomate-cerise',
            name: 'Tomate cerise',
            departmentSlug: 'fruit-et-legume',
            departmentName: 'Fruit & légume',
            purchaseUnitName: 'barquette',
            recipeCount: 2,
            listCount: 0,
            sameDepartment: true,
            veryClose: false,
          },
          {
            slug: 'tomate-surgelee',
            name: 'Tomate',
            departmentSlug: 'surgele',
            departmentName: 'Surgelé',
            purchaseUnitName: 'kilo',
            recipeCount: 1,
            listCount: 0,
            sameDepartment: false,
            veryClose: false,
          },
        ]
        const member = all.filter((candidate) => candidate.name.toLowerCase().includes(search))
        return reply(route, { member, totalItems: member.length })
      }

      if (key === 'GET /api/v1/ingredients/tomates' || key === 'GET /api/v1/ingredients/sel') {
        const common = slug === 'sel'
        return reply(route, {
          slug,
          name: common ? 'Sel' : 'Tomates',
          image: '',
          departmentSlug: 'fruit-et-legume',
          departmentName: 'Fruit & légume',
          cookingUnitSlug: 'kilo',
          cookingUnitName: 'Kilo',
          purchaseUnitSlug: 'kilo',
          purchaseUnitName: 'Kilo',
          purchaseUnitSymbol: 'kg',
          hasSameUnit: true,
          coefficient: null,
          creatorId: common ? null : 'u1',
          canEdit: !common,
          recipeCount: common ? 0 : 7,
          listCount: common ? 0 : 2,
        })
      }

      return reply(route, { error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return {
    received,
    /** Les appels reçus sous la forme `'POST /api/v1/ingredients/melon-2/merge'`. */
    keys: () => received.map((entry) => entry.key),
    bodyOf: (key: string) => received.find((entry) => entry.key === key)?.body,
  }
}
