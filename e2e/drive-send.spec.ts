// Écran d'envoi au drive (DRV-404), sans back ni compte : l'API est simulée par `page.route`, et le pont natif `repasNative` de
// l'application par un faux installé avant la page. Données inventées (magasin d'essai, produits de test). Joué sur bureau et Pixel 7.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const BASE = 'https://courses-test.leclercdrive.fr/magasin-123456-123456'

const product = (rank: number, id: string, label: string, packs: number | null = 1) => ({
  rank,
  retailerProductId: id,
  ean: null,
  label,
  content: { value: 1000, unit: 'g' },
  packs,
  packsStatus: packs === null ? 'TO_CHECK' : 'COMPUTED',
})
const need = { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 }
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
  needed: { ...need, unitSymbol: 'pièce', dimension: 'COUNT' },
  status,
  products: [],
  rejected: [],
  searchQuery: name,
})

/** 12 lignes : 8 connues (dont Farine à deux produits classés et un refusé), 3 nouvelles, 1 « vous en avez déjà ». */
const plan = {
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

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

async function fakeBack(page: Page) {
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      switch (`${request.method()} ${new URL(request.url()).pathname}`) {
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
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )
}

declare global {
  interface Window {
    __sent: { type: string; plan?: { lines: { ingredientSlug: string; status: string }[] } }[]
  }
}

/** Le faux pont de l'application : enregistre ce que la page envoie et répond à `app.info`. */
async function fakeApp(page: Page) {
  await page.addInitScript(() => {
    const listeners = new Set<(event: { data: unknown }) => void>()
    window.__sent = []
    ;(window as unknown as { repasNative: unknown }).repasNative = {
      postMessage(text: string) {
        const message = JSON.parse(text)
        window.__sent.push(message)
        if (message.type === 'app.info') {
          const data = JSON.stringify({
            v: 1,
            type: 'app.info',
            version: '1.0.0',
            versionCode: 1,
            drive: true,
          })
          setTimeout(() => listeners.forEach((listener) => listener({ data })), 0)
        }
      },
      addEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
        void listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
        void listeners.delete(listener),
    }
  })
}

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

test('dans l’application : choisir un autre produit, passer une ligne, ouvrir le drive, retrouver l’attente après rechargement', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')
  await expect(page.getByRole('heading', { level: 1, name: 'Envoi au drive' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Votre liste (12)' })).toBeVisible()

  const farine = page.getByRole('listitem').filter({ hasText: 'Farine de blé T55' }).first()
  await expect(farine).toContainText('1. Farine de blé T55 Marque Repère 1 kg')
  await expect(farine).toContainText('2. Farine de blé T45 1 kg (secours)')
  await expect(farine).toContainText('Refusés : Farine complète bio 1 kg')
  await expect(page.getByRole('listitem').filter({ hasText: 'Beurre doux' }).first()).toContainText(
    'quantité à vérifier',
  )

  await page.getByRole('button', { name: 'Choisir un autre produit : Farine' }).click()
  await page.getByRole('button', { name: 'Passer cette fois : Lait' }).click()
  await expect(page.getByText('Vous choisirez un autre produit sur Leclerc')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  await page.getByRole('button', { name: 'Ouvrir le drive' }).click()
  await expect(page.getByText('En attente du retour du drive…')).toBeVisible()

  const start = await page.evaluate(() => window.__sent.find((m) => m.type === 'drive.start'))
  expect(start?.plan?.lines).toHaveLength(12)
  const status = Object.fromEntries(start!.plan!.lines.map((l) => [l.ingredientSlug, l.status]))
  expect(status).toMatchObject({
    farine: 'NEW',
    lait: 'SKIP',
    beurre: 'KNOWN',
    sel: 'HAVE_AT_HOME',
  })

  // Le brouillon survit à un rechargement (service worker de production)
  await page.reload()
  await expect(page.getByText('En attente du retour du drive…')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`hors de l’application : message, installation et recherche par ligne, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/drive/envoi/l1')

    await expect(page.getByText('L’envoi automatique n’est pas disponible ici')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ouvrir le drive' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Installer l’application' })).toHaveAttribute(
      'href',
      '/drive/aide',
    )
    await expect(page.getByRole('link', { name: /^Chercher sur Leclerc/ })).toHaveCount(11)
    await expect(page.getByRole('link', { name: /Chercher sur Leclerc : Farine/ })).toHaveAttribute(
      'href',
      `${BASE}/recherche.aspx?TexteRecherche=Farine`,
    )
    expect((await scan(page)).violations).toEqual([])
  })
}
