// Faux back et faux pont natif des écrans du drive (DRV-404, DRV-405) : API simulée par `page.route`, `repasNative` par un script posé
// avant la page. Données inventées (magasin d'essai, produits de test), jamais une enseigne réelle.
import AxeBuilder from '@axe-core/playwright'
import type { Page, Route } from '@playwright/test'

export const BASE = 'https://courses-test.leclercdrive.fr/magasin-123456-123456'

const product = (rank: number, id: string, label: string, packs: number | null = 1) => ({
  rank,
  retailerProductId: id,
  ean: null,
  label,
  content: { value: 1000, unit: 'g' },
  packs,
  packsStatus: packs === null ? 'TO_CHECK' : 'COMPUTED',
  packSize: null,
})
const need = {
  quantity: 800,
  unitSymbol: 'g',
  dimension: 'WEIGHT',
  baseFactor: 1,
  unitSlug: 'gramme',
  unitName: 'gramme',
}
const known = (slug: string, name: string, products: unknown[], rejected: unknown[] = []) => ({
  ingredientSlug: slug,
  ingredientName: name,
  needed: need,
  status: 'KNOWN',
  products,
  rejected,
  searchQuery: name,
})
const fresh = (slug: string, name: string, status = 'NEW') => ({
  ingredientSlug: slug,
  ingredientName: name,
  needed: {
    ...need,
    unitSymbol: 'pièce',
    dimension: 'COUNT',
    unitSlug: 'piece',
    unitName: 'pièce',
  },
  status,
  products: [],
  rejected: [],
  searchQuery: name,
})

/** 12 lignes : 8 connues (dont Farine à deux produits classés et un refusé), 3 nouvelles, 1 « tu en as déjà ». */
export const plan = {
  shoppingListId: 'l1',
  listVersion: 7,
  retailer: 'leclerc',
  store: { id: '123456', label: null, baseUrl: BASE },
  generatedAt: '2026-10-18T10:00:00+02:00',
  counts: { known: 8, new: 3, haveAtHome: 1 },
  lines: [
    known(
      'farine',
      'Farine',
      [
        product(1, '123456', 'Farine de blé T55 Marque Repère 1 kg'),
        product(2, '222333', 'Farine de blé T45 1 kg', 2),
      ],
      [{ retailerProductId: '999000', label: 'Farine complète bio 1 kg' }],
    ),
    known('beurre', 'Beurre', [product(1, '300001', 'Beurre doux 250 g', null)]),
    ...['Lait', 'Riz', 'Sucre', 'Pates', 'Huile', 'Vinaigre'].map((name, index) =>
      known(name.toLowerCase(), name, [product(1, `30001${index}`, `${name} de test 1 kg`)]),
    ),
    fresh('poivre', 'Poivre'),
    fresh('curry', 'Curry'),
    fresh('moutarde', 'Moutarde'),
    fresh('sel', 'Sel', 'HAVE_AT_HOME'),
  ],
}

/** L'estimation du coût de la liste `l1` (DRV-612) : 3 lignes estimées (5,72 €), 2 non estimées, 1 « déjà à la maison » ; couverture 3 sur 5. */
export const estimate = {
  shoppingListId: 'l1',
  retailer: 'leclerc',
  store: plan.store,
  estimatedTotalCents: 572,
  estimatedLines: 3,
  unestimatedLines: 2,
  coverage: 0.6,
  oldestPriceAt: '2026-10-12T09:30:00+02:00',
  newestPriceAt: '2026-10-18T10:00:00+02:00',
  lines: [
    {
      ingredientSlug: 'beurre',
      ingredientName: 'Beurre',
      productLabel: 'Beurre doux 250 g',
      packs: 1,
      unitPriceCents: 245,
      subtotalCents: 245,
      priceSeenAt: '2026-10-12T09:30:00+02:00',
      status: 'ESTIMATED',
    },
    {
      ingredientSlug: 'farine',
      ingredientName: 'Farine',
      productLabel: 'Farine de blé T55 Marque Repère 1 kg',
      packs: 1,
      unitPriceCents: 129,
      subtotalCents: 129,
      priceSeenAt: '2026-10-18T10:00:00+02:00',
      status: 'ESTIMATED',
    },
    {
      ingredientSlug: 'huile',
      ingredientName: 'Huile',
      productLabel: 'Huile de test 1 L',
      packs: null,
      unitPriceCents: null,
      subtotalCents: null,
      priceSeenAt: null,
      status: 'NO_PRICE',
    },
    {
      ingredientSlug: 'lait',
      ingredientName: 'Lait',
      productLabel: 'Lait demi-écrémé 1 L',
      packs: 2,
      unitPriceCents: 99,
      subtotalCents: 198,
      priceSeenAt: '2026-10-15T08:00:00+02:00',
      status: 'ESTIMATED',
    },
    {
      ingredientSlug: 'poivre',
      ingredientName: 'Poivre',
      productLabel: null,
      packs: null,
      unitPriceCents: null,
      subtotalCents: null,
      priceSeenAt: null,
      status: 'NO_PRODUCT',
    },
    {
      ingredientSlug: 'sel',
      ingredientName: 'Sel',
      productLabel: null,
      packs: null,
      unitPriceCents: null,
      subtotalCents: null,
      priceSeenAt: null,
      status: 'HAVE_AT_HOME',
    },
  ],
  disclaimer: 'Estimation d’après les derniers prix vus ; le prix réel est celui du drive.',
}

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

/** Rend les corps reçus par `PUT /drive/choices` et les appels reçus. */
export async function fakeBack(page: Page) {
  const received = { choices: [] as unknown[], calls: [] as string[] }
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      received.calls.push(key)
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
        case 'GET /api/v1/drive/plans/l1':
          return reply(route, plan)
        case 'GET /api/v1/drive/estimates/l1':
          return reply(route, estimate)
        case 'GET /api/v1/drive/settings':
          return reply(route, {
            enabled: true,
            retailer: 'leclerc',
            store: plan.store,
          })
        case 'GET /api/v1/shopping-lists/l1':
          return reply(route, { id: 'l1', displayName: 'Courses', version: 7, status: 'SENT' })
        case 'PUT /api/v1/drive/choices':
          received.choices.push(request.postDataJSON())
          return reply(route)
        case 'POST /api/v1/shopping-lists/l1/complete':
          return reply(route)
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )

  return received
}

declare global {
  interface Window {
    __sent: { type: string; plan?: { lines: { ingredientSlug: string; status: string }[] } }[]
  }
}

/**
 * Le faux pont de l'application. Au lancement du drive (`drive.start`), il répond par un résultat tiré du plan : `completed` (tout est
 * mis au panier, un produit de secours, des prix) ou `partial` (le beurre échoue, `BLOCKED`). Avec un résultat tout fait (sans son
 * `runId`, celui du plan reçu y est mis), il le renvoie tel quel : le parcours choisit alors lui-même ce que l'agent a fait. `version` est
 * celle que l'application annonce à `app.info` (`null` : elle ne répond pas), pour essayer une application trop ancienne (DRV-640).
 * `silent` : le drive est ouvert et l'utilisateur n'est pas encore revenu, l'application ne rend aucun résultat.
 */
export async function fakeApp(
  page: Page,
  mode: 'completed' | 'partial' | 'silent' | Record<string, unknown> = 'completed',
  version: string | null = '1.0.0',
) {
  await page.addInitScript(
    ([mode, version]) => {
      const listeners = new Set<(event: { data: unknown }) => void>()
      window.__sent = []
      ;(window as unknown as { repasNative: unknown }).repasNative = {
        postMessage(text: string) {
          const message = JSON.parse(text)
          window.__sent.push(message)
          const emit = (data: string) => listeners.forEach((listener) => listener({ data }))
          // `version` nulle : l'application ne répond pas à `app.info` (une ancienne version qui ne dit pas la sienne)
          if (message.type === 'app.info' && version !== null) {
            const data = JSON.stringify({
              v: 1,
              type: 'app.info',
              version,
              versionCode: 1,
              drive: true,
            })
            setTimeout(() => emit(data), 0)
          }
          if (message.type === 'drive.start' && mode === 'silent') {
            // Le drive est ouvert, pas de retour pour l'instant
          } else if (message.type === 'drive.start' && typeof mode === 'object') {
            const result = { ...mode, runId: message.plan.runId }
            setTimeout(() => emit(JSON.stringify({ v: 1, type: 'drive.result', result })), 100)
          } else if (message.type === 'drive.start') {
            const lines = message.plan.lines.map(
              (line: {
                ingredientSlug: string
                name: string
                status: string
                products?: { id: string }[]
              }) => {
                const slug = line.ingredientSlug
                if (line.status === 'HAVE_AT_HOME')
                  return { ingredientSlug: slug, outcome: 'HAVE_AT_HOME' }
                if (line.status === 'SKIP') return { ingredientSlug: slug, outcome: 'SKIPPED' }
                if (line.status === 'NEW')
                  return {
                    ingredientSlug: slug,
                    outcome: 'CHOSEN',
                    quantity: 1,
                    placement: 'PRIMARY',
                    product: { id: '5551' + slug.length, label: line.name + ' choisi sur le site' },
                  }
                if (mode === 'partial' && slug === 'beurre')
                  return { ingredientSlug: slug, outcome: 'FAILED', error: 'BLOCKED' }
                const products = line.products ?? []
                return {
                  ingredientSlug: slug,
                  outcome: 'ADDED',
                  productId: products[products.length - 1]?.id,
                  quantity: 1,
                  usedRank: products.length,
                  ...(products.length > 1 ? { unavailableIds: [products[0]?.id] } : {}),
                  price: { cents: 189 },
                }
              },
            )
            const result = {
              v: 1,
              type: 'result',
              runId: message.plan.runId,
              agentVersion: '1.0.0',
              outcome: mode,
              store: { id: message.plan.store.id },
              lines,
              ...(mode === 'partial'
                ? { error: { code: 'BLOCKED', message: 'Trop de demandes' } }
                : {}),
            }
            setTimeout(() => emit(JSON.stringify({ v: 1, type: 'drive.result', result })), 100)
          }
        },
        addEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
          void listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
          void listeners.delete(listener),
      }
    },
    [mode, version] as const,
  )
}

/**
 * Compte les gestes de l'utilisateur dans la page : un clic ou une touche de clavier de confiance (`isTrusted`, donc jamais un clic fait par le
 * code de la page). À appeler avant d'ouvrir la page. C'est la preuve de « une intention = un clic » : entre la confirmation de l'envoi et
 * l'ouverture du drive, le compte ne bouge plus.
 */
export async function trackTaps(page: Page): Promise<{ total: () => Promise<number> }> {
  await page.addInitScript(() => {
    const w = window as unknown as { __taps: number }
    w.__taps = 0
    for (const type of ['click', 'keydown'])
      document.addEventListener(
        type,
        (event) => {
          if (event.isTrusted) w.__taps += 1
        },
        true,
      )
  })
  return { total: () => page.evaluate(() => (window as unknown as { __taps: number }).__taps) }
}

/** La phrase de synthèse de l'écran d'envoi pour le plan de `plan` : 8 connus, 3 à choisir, 1 « j'en ai toujours » (DRV-622). */
export const SUMMARY_12 =
  '12 articles : 8 sont déjà choisis, 3 sont à choisir sur Leclerc, 1 ne sera pas mis au panier.'

/** Déplie la liste des articles de l'écran d'envoi : elle est repliée au-delà de 6 articles (DRV-622). */
export const openArticles = (page: Page) => page.getByText('Voir les articles').click()

/** Déplie « Détails » du récapitulatif : les articles, le code et le reste y sont repliés (DRV-622). */
export const openDetails = (page: Page) => page.getByText('Détails', { exact: true }).click()

export const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

/** Une capture à relire, seulement avec `E2E_SHOTS=<dossier>` : aucune image n'est écrite par défaut. */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SHOTS
  if (dir === undefined) return
  await page.screenshot({ path: `${dir}/${name}.png` })
}
