import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, rateLimited, stubApi } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import ProductDetailView from '../ProductDetailView.vue'
import ProductsView from '../ProductsView.vue'

const A = {
  productId: 'p-a',
  retailerProductId: '111111',
  ean: null,
  label: 'Farine de blé T55 Marque Repère 1 kg',
  content: { value: 1, unit: 'kg' },
}
const B = {
  productId: 'p-b',
  retailerProductId: '222222',
  ean: null,
  label: 'Farine T45 Marque Test',
  content: { value: 500, unit: 'g' },
}
const C = {
  productId: 'p-c',
  retailerProductId: '333333',
  ean: null,
  label: 'Farine complète Marque Test',
  content: null,
}
const D = {
  ...C,
  productId: 'p-d',
  label: 'Oeufs plein air x6',
  content: { value: 6, unit: 'piece' },
}

const farine = {
  ingredientSlug: 'farine',
  ingredientName: 'Farine',
  haveAtHome: false,
  accepted: [
    { rank: 1, product: A },
    { rank: 2, product: B },
  ],
  rejected: [C],
  updatedAt: '2026-10-18T10:00:00+02:00',
}
const farineWithSearch = { ...farine, searchQuery: 'farine de blé t55' }
const sel = {
  ingredientSlug: 'sel',
  ingredientName: 'Sel',
  haveAtHome: true,
  accepted: [],
  rejected: [],
  updatedAt: '2026-10-18T10:00:00+02:00',
}
const oeufs = {
  ingredientSlug: 'oeufs',
  ingredientName: 'Œufs',
  haveAtHome: false,
  accepted: [{ rank: 1, product: D }],
  rejected: [],
  updatedAt: '2026-10-18T10:00:00+02:00',
}

// DRV-652 : un fromage que la liste compte en tranches, dont la personne a donné la contenance (20 tranches)
const E = {
  productId: 'p-e',
  retailerProductId: '555701',
  ean: null,
  label: 'Fromage cheddar en tranches 20 Tranches - 340g',
  content: { value: 340, unit: 'g' },
  packSize: { value: 20, unitSlug: 'tranche' },
}
const cheddar = {
  ingredientSlug: 'cheddar',
  ingredientName: 'Cheddar en tranche',
  haveAtHome: false,
  accepted: [
    { rank: 1, product: E },
    { rank: 2, product: { ...B, packSize: null } },
  ],
  rejected: [],
  updatedAt: '2026-10-18T10:00:00+02:00',
}
const unitList = [
  { slug: 'tranche', name: 'tranche', symbol: '', dimension: null, baseFactor: null },
  { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
  { slug: 'unite', name: 'unité', symbol: '', dimension: 'COUNT', baseFactor: 1 },
  { slug: 'oeuf', name: 'œuf', symbol: '', dimension: 'COUNT', baseFactor: 1 },
]

const store = { id: '123456', baseUrl: 'https://exemple.leclercdrive.fr/magasin-123456-123456' }
const settings = { enabled: true, retailer: 'leclerc', store }

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}
const list =
  (...member: unknown[]) =>
  () =>
    json({ member, totalItems: member.length })
const noContent = () => new Response(null, { status: 204 })
const failure = (status: number, message: string) => () => json({ error: { message } }, { status })

async function signedIn() {
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()

  return context
}

async function open(
  view: typeof ProductsView | typeof ProductDetailView,
  path: string,
  handlers: Parameters<typeof stubApi>[0] = {},
) {
  const fetchMock = stubApi({
    ...session,
    'GET /api/v1/drive/settings': () => json(settings),
    'GET /api/v1/drive/choices': list(farine, sel, oeufs),
    'GET /api/v1/units': list(...unitList),
    ...handlers,
  })
  const context = await signedIn()
  await context.router.push(path)
  const wrapper = mount(view, { attachTo: document.body, global: { plugins: context.plugins } })
  await vi.waitFor(() =>
    expect(wrapper.find('h1').exists() || wrapper.find('p').exists()).toBe(true),
  )
  await flushPromises()

  return { wrapper, context, fetchMock }
}

const detail = (handlers: Parameters<typeof stubApi>[0] = {}, slug = 'farine') =>
  open(ProductDetailView, `/drive/produits/${slug}`, handlers)

type Wrapper = Awaited<ReturnType<typeof open>>['wrapper']
const buttonsOf = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('button').filter((button) => button.text().startsWith(label))
const press = async (wrapper: Wrapper, label: string, index = 0) => {
  await buttonsOf(wrapper, label)[index]?.trigger('click')
  await flushPromises()
}
const acceptedLabels = (wrapper: Wrapper) =>
  wrapper.findAll('ol li').map((item) => item.find('p.font-bold').text())
const puts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .map(([input]) => input as Request)
    .findIndex((request) => request.method === 'PUT')

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  window.dispatchEvent(new Event('online'))
})

describe('Mes produits : la liste des ingrédients', () => {
  it('montre le produit préféré, les secours et les refusés, ou « J’en ai toujours »', async () => {
    const { wrapper, fetchMock } = await open(ProductsView, '/drive/produits')

    const rows = wrapper.findAll('li a')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.text()).toContain('Farine')
    expect(rows[0]?.text()).toContain('Produit habituel : Farine de blé T55 Marque Repère 1 kg')
    expect(rows[0]?.text()).toContain('1 produit de remplacement · 1 produit à ne plus proposer')
    expect(rows[1]?.text()).toContain('J’en ai toujours')
    expect(rows[1]?.text()).not.toContain('Produit habituel')
    expect(rows[2]?.text()).not.toContain('remplacement')
    expect(rows[0]?.attributes('href')).toBe('/drive/produits/farine')
    expect(calls(fetchMock)).toContain('GET /api/v1/drive/choices')
    const read = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((r) => r.url.includes('/drive/choices'))
    const query = new URL(read?.url ?? 'http://x').searchParams
    expect(query.get('retailer')).toBe('leclerc')
  })

  it('montre en lecture seule la recherche mémorisée de l’article, seulement quand il y en a une (DRV-650)', async () => {
    const { wrapper } = await open(ProductsView, '/drive/produits', {
      'GET /api/v1/drive/choices': list(farineWithSearch, { ...sel, searchQuery: null }, oeufs),
    })

    const rows = wrapper.findAll('li a')
    expect(rows[0]?.text()).toContain('Recherche sur le drive : farine de blé t55')
    expect(rows[1]?.text()).not.toContain('Recherche sur le drive')
    expect(rows[2]?.text()).not.toContain('Recherche sur le drive')
    expect(wrapper.findAll('[data-testid="searched-as"]')).toHaveLength(1)
    expect(wrapper.find('li a input, li a textarea').exists()).toBe(false)
  })

  it('affiche la recherche mémorisée comme du texte, jamais comme du HTML', async () => {
    const hostile = '<img src=x onerror="window.pwned=1"><b>gras</b>'
    const { wrapper } = await open(ProductsView, '/drive/produits', {
      'GET /api/v1/drive/choices': list({ ...farine, searchQuery: hostile }),
    })

    expect(wrapper.find('[data-testid="searched-as"]').text()).toBe(
      `Recherche sur le drive : ${hostile}`,
    )
    expect(wrapper.find('li a img').exists()).toBe(false)
    expect(wrapper.find('li a b').exists()).toBe(false)
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()
  })

  it('cherche par nom, sans tenir compte des accents ni des majuscules', async () => {
    const { wrapper } = await open(ProductsView, '/drive/produits')

    await wrapper.find('input[type="search"]').setValue('OEUF')
    expect(wrapper.findAll('li a')).toHaveLength(1)
    expect(wrapper.find('li a').text()).toContain('Œufs')

    await wrapper.find('input[type="search"]').setValue('zzz')
    expect(wrapper.findAll('li a')).toHaveLength(0)
    expect(wrapper.text()).toContain('Aucun article ne correspond à ta recherche.')
  })

  it('explique quand aucun produit n’est mémorisé', async () => {
    const { wrapper } = await open(ProductsView, '/drive/produits', {
      'GET /api/v1/drive/choices': list(),
    })

    expect(wrapper.text()).toContain('Repas ne se souvient encore d’aucun produit.')
    expect(wrapper.find('input[type="search"]').exists()).toBe(false)
  })

  it('ne lit rien quand le drive est coupé ou sans magasin', async () => {
    const off = await open(ProductsView, '/drive/produits', {
      'GET /api/v1/drive/settings': () => json({ enabled: false, retailer: 'leclerc' }),
    })
    expect(off.wrapper.text()).toContain('L’envoi au drive n’est pas disponible pour le moment.')
    expect(calls(off.fetchMock)).not.toContain('GET /api/v1/drive/choices')
    off.wrapper.unmount()

    const noStore = await open(ProductsView, '/drive/produits', {
      'GET /api/v1/drive/settings': () => json({ enabled: true, retailer: 'leclerc', store: null }),
    })
    expect(noStore.wrapper.text()).toContain('Tu n’as pas encore enregistré ton magasin')
    expect(noStore.wrapper.find('a[href="/drive/reglages"]').exists()).toBe(true)
    expect(calls(noStore.fetchMock)).not.toContain('GET /api/v1/drive/choices')
  })

  it('dit quand la lecture échoue', async () => {
    const { wrapper } = await open(ProductsView, '/drive/produits', {
      'GET /api/v1/drive/choices': failure(500, 'boom'),
    })

    expect(wrapper.find('[role="alert"]').text()).toContain('Le serveur est injoignable')
  })
})

describe('Mes produits : un ingrédient', () => {
  it('montre les produits acceptés classés et les refusés, sans phrase de règle (DRV-628)', async () => {
    const { wrapper } = await detail()

    expect(wrapper.find('h1').text()).toBe('Farine')
    expect(wrapper.text()).not.toContain('Repas prend le premier produit')
    expect(wrapper.text()).not.toContain('jamais pris')
    expect(acceptedLabels(wrapper)).toEqual([A.label, B.label])
    const items = wrapper.findAll('ol li')
    expect(items[0]?.text()).toContain('Habituel')
    expect(items[0]?.text()).toContain('1 kg')
    expect(items[0]?.text()).toContain('Produit 1 sur 2')
    expect(items[1]?.text()).toContain('Remplacement')
    expect(items[1]?.text()).toContain('Produit 2 sur 2')
    expect(wrapper.text()).toContain(C.label)
    expect(wrapper.find('ol').attributes('aria-label')).toBe('Produits acceptés')
  })

  it('montre en lecture seule la recherche mémorisée de l’article, sans champ ni bouton pour la corriger (DRV-650)', async () => {
    const { wrapper } = await detail({ 'GET /api/v1/drive/choices': list(farineWithSearch) })

    const line = wrapper.find('[data-testid="searched-as"]')
    expect(line.text()).toBe('Recherche sur le drive : farine de blé t55')
    expect(wrapper.find('h1').element.parentElement?.contains(line.element)).toBe(true)
    expect(wrapper.find('input[type="text"], input[type="search"], textarea').exists()).toBe(false)
  })

  it('n’en dit rien quand aucune recherche n’est mémorisée ou pour « J’en ai toujours »', async () => {
    const withoutOne = await detail({
      'GET /api/v1/drive/choices': list({ ...farine, searchQuery: null }),
    })
    expect(withoutOne.wrapper.find('[data-testid="searched-as"]').exists()).toBe(false)
    const atHome = await detail({ 'GET /api/v1/drive/choices': list(sel) }, 'sel')
    expect(atHome.wrapper.find('[data-testid="searched-as"]').exists()).toBe(false)
  })

  it('descend le préféré puis enregistre : l’ordre voulu part au back', async () => {
    const { wrapper, fetchMock } = await detail({
      'PUT /api/v1/drive/choices/farine': noContent,
    })
    expect(wrapper.text()).not.toContain('Modifications non enregistrées')
    expect(buttonsOf(wrapper, 'Enregistrer')[0]?.attributes('disabled')).toBeDefined()

    await press(wrapper, 'Descendre')
    expect(acceptedLabels(wrapper)).toEqual([B.label, A.label])
    expect(wrapper.text()).toContain('Modifications non enregistrées')
    // La modification est annoncée, et le focus suit le produit déplacé : son bouton « Monter » (le texte de <body> contient « Monter » aussi)
    expect(wrapper.find('[role="status"]').text()).toContain('position 2 sur 2')
    const focused = document.activeElement as HTMLElement
    expect(focused.getAttribute('data-action')).toBe('up')
    expect(focused.closest('li')?.getAttribute('data-product')).toBe(A.productId)

    await press(wrapper, 'Enregistrer')

    const index = puts(fetchMock)
    expect(await bodyOf(fetchMock, index)).toEqual({
      retailer: 'leclerc',
      storeId: '123456',
      haveAtHome: false,
      accepted: ['p-b', 'p-a'],
      rejected: ['p-c'],
    })
    expect(useNotificationsStore().items.map((item) => item.text)).toContain(
      'Produits enregistrés.',
    )
  })

  it('accepte de nouveau un refusé en troisième, puis bloque à cinq produits', async () => {
    const six = {
      ...farine,
      accepted: [
        A,
        B,
        { ...C, productId: 'p-x1', label: 'Farine X1' },
        { ...C, productId: 'p-x2', label: 'Farine X2' },
      ].map((product, index) => ({ rank: index + 1, product })),
      rejected: [C, { ...C, productId: 'p-r2', label: 'Farine R2' }],
    }
    const { wrapper } = await detail({ 'GET /api/v1/drive/choices': list(six) })

    await press(wrapper, 'Accepter de nouveau')
    expect(acceptedLabels(wrapper)).toEqual([A.label, B.label, 'Farine X1', 'Farine X2', C.label])
    expect(wrapper.text()).toContain('Tu as déjà 5 produits acceptés')
    expect(buttonsOf(wrapper, 'Accepter de nouveau')[0]?.attributes('disabled')).toBeDefined()
  })

  it('accepte de nouveau le refusé en troisième position', async () => {
    const { wrapper, fetchMock } = await detail({ 'PUT /api/v1/drive/choices/farine': noContent })

    await press(wrapper, 'Accepter de nouveau')
    expect(acceptedLabels(wrapper)).toEqual([A.label, B.label, C.label])
    expect(wrapper.text()).toContain('Aucun produit à ne plus proposer.')
    await press(wrapper, 'Enregistrer')

    expect((await bodyOf(fetchMock, puts(fetchMock))) as object).toMatchObject({
      accepted: ['p-a', 'p-b', 'p-c'],
      rejected: [],
    })
  })

  it('« Ne plus proposer » déplace le produit vers les refusés', async () => {
    const { wrapper, fetchMock } = await detail({ 'PUT /api/v1/drive/choices/farine': noContent })

    await press(wrapper, 'Ne plus proposer')
    expect(acceptedLabels(wrapper)).toEqual([B.label])
    expect(wrapper.text()).toContain(A.label)
    await press(wrapper, 'Enregistrer')

    expect((await bodyOf(fetchMock, puts(fetchMock))) as object).toMatchObject({
      accepted: ['p-b'],
      rejected: ['p-c', 'p-a'],
    })
  })

  it('retire un produit sans le refuser', async () => {
    const { wrapper, fetchMock } = await detail({ 'PUT /api/v1/drive/choices/farine': noContent })

    await press(wrapper, 'Retirer')
    expect(acceptedLabels(wrapper)).toEqual([B.label])
    await press(wrapper, 'Enregistrer')

    expect((await bodyOf(fetchMock, puts(fetchMock))) as object).toMatchObject({
      accepted: ['p-b'],
      rejected: ['p-c'],
    })
  })

  it('« J’en ai toujours » masque les listes et n’envoie aucun produit', async () => {
    const { wrapper, fetchMock } = await detail({ 'PUT /api/v1/drive/choices/farine': noContent })

    await press(wrapper, 'J’en ai toujours')
    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Produits à ne plus proposer')
    await press(wrapper, 'Enregistrer')

    expect(await bodyOf(fetchMock, puts(fetchMock))).toEqual({
      retailer: 'leclerc',
      storeId: '123456',
      haveAtHome: true,
      accepted: [],
      rejected: [],
    })
  })

  it('annule les modifications : l’état lu revient', async () => {
    const { wrapper, fetchMock } = await detail()

    await press(wrapper, 'Descendre')
    await press(wrapper, 'Retirer')
    await press(wrapper, 'Annuler les modifications')

    expect(acceptedLabels(wrapper)).toEqual([A.label, B.label])
    expect(wrapper.text()).not.toContain('Modifications non enregistrées')
    expect(puts(fetchMock)).toBe(-1)
  })

  it('affiche le refus du back (422) à côté de l’action et garde les modifications', async () => {
    const { wrapper } = await detail({
      'PUT /api/v1/drive/choices/farine': failure(422, 'DRIVE_CHOICE_INVALID'),
    })

    await press(wrapper, 'Descendre')
    await press(wrapper, 'Enregistrer')

    expect(wrapper.find('[role="alert"]').text()).toContain('Ce choix n’est pas valable')
    expect(acceptedLabels(wrapper)).toEqual([B.label, A.label])
    expect(useNotificationsStore().items).toHaveLength(0)
  })

  it('dit le plafond atteint (422 DRIVE_LIMIT_REACHED), autrement que le refus d’une préférence', async () => {
    const { wrapper } = await detail({
      'PUT /api/v1/drive/choices/farine': failure(422, 'DRIVE_LIMIT_REACHED'),
    })

    await press(wrapper, 'Descendre')
    await press(wrapper, 'Enregistrer')

    const alert = wrapper.find('[role="alert"]').text()
    expect(alert).toContain(
      'Repas se souvient déjà de trop de produits, ou il y a eu trop d’écritures aujourd’hui',
    )
    expect(alert).toContain('réessaie demain')
    expect(alert).not.toContain('Ce choix n’est pas valable')
    expect(acceptedLabels(wrapper)).toEqual([B.label, A.label])
  })

  it('trop d’écritures (429) : le dit autrement que le plafond de quantité, garde les modifications et ne relit rien', async () => {
    const { wrapper, fetchMock } = await detail({
      'PUT /api/v1/drive/choices/farine': rateLimited(1),
    })

    await press(wrapper, 'Descendre')
    const before = calls(fetchMock).filter((call) => call.includes('/drive/settings')).length
    await press(wrapper, 'Enregistrer')

    const alert = wrapper.find('[role="alert"]').text()
    expect(alert).toBe(
      'Trop de demandes en peu de temps. Rien n’est perdu. Attends une minute, puis réessaie.',
    )
    expect(alert).not.toContain('demain')
    expect(acceptedLabels(wrapper)).toEqual([B.label, A.label])
    expect(useNotificationsStore().items).toHaveLength(0)
    // Rien n'a changé côté serveur : les écrans du drive ne sont pas relus
    expect(calls(fetchMock).filter((call) => call.includes('/drive/settings'))).toHaveLength(before)
  })

  it('relit les écrans du drive quand le magasin a changé (409)', async () => {
    const { wrapper, fetchMock } = await detail({
      'PUT /api/v1/drive/choices/farine': failure(409, 'DRIVE_STORE_MISMATCH'),
    })

    await press(wrapper, 'Descendre')
    const before = calls(fetchMock).filter((call) => call.includes('/drive/settings')).length
    await press(wrapper, 'Enregistrer')

    expect(wrapper.find('[role="alert"]').text()).toContain('Ton magasin a changé')
    await vi.waitFor(() =>
      expect(calls(fetchMock).filter((call) => call.includes('/drive/settings')).length).toBe(
        before + 1,
      ),
    )
  })

  it('oublie l’ingrédient après confirmation, puis revient à la liste', async () => {
    const { wrapper, context, fetchMock } = await detail({
      'DELETE /api/v1/drive/choices/farine': noContent,
    })

    await press(wrapper, 'Oublier cet article')
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      'Oublier Farine ?',
    )
    expect(calls(fetchMock)).not.toContain('DELETE /api/v1/drive/choices/farine')

    const confirm = [...document.body.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent.trim() === 'Oublier',
    ) as HTMLButtonElement
    confirm.click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-products'))

    const request = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((candidate) => candidate.method === 'DELETE') as Request
    const query = new URL(request.url).searchParams
    expect(query.get('retailer')).toBe('leclerc')
    expect(query.get('storeId')).toBe('123456')
  })

  it('trop d’écritures (429) à l’oubli : le dit et reste sur l’ingrédient', async () => {
    const { wrapper, context } = await detail({
      'DELETE /api/v1/drive/choices/farine': rateLimited(1),
    })

    await press(wrapper, 'Oublier cet article')
    ;(
      [...document.body.querySelectorAll('[role="dialog"] button')].find(
        (button) => button.textContent.trim() === 'Oublier',
      ) as HTMLButtonElement
    ).click()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Trop de demandes en peu de temps. Rien n’est perdu. Attends une minute, puis réessaie.',
    )
    expect(context.router.currentRoute.value.name).not.toBe('drive-products')
  })

  it('dit pourquoi l’oubli échoue (404 déjà oublié)', async () => {
    const { wrapper } = await detail({
      'DELETE /api/v1/drive/choices/farine': failure(404, 'DRIVE_CHOICE_NOT_FOUND'),
    })

    await press(wrapper, 'Oublier cet article')
    ;(
      [...document.body.querySelectorAll('[role="dialog"] button')].find(
        (button) => button.textContent.trim() === 'Oublier',
      ) as HTMLButtonElement
    ).click()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text()).toContain(
      'ne se souvient plus de produit pour cet article',
    )
  })

  it('une préférence vidée puis enregistrée est oubliée par le back : retour à la liste', async () => {
    const { wrapper, context } = await detail(
      {
        'PUT /api/v1/drive/choices/farine': noContent,
      },
      'farine',
    )

    await press(wrapper, 'Retirer')
    await press(wrapper, 'Retirer')
    await press(wrapper, 'Accepter de nouveau')
    await press(wrapper, 'Retirer')
    await press(wrapper, 'Enregistrer')

    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-products'))
  })

  it('sans réseau : lecture seule, aucune action possible', async () => {
    const { wrapper } = await detail()

    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    expect(wrapper.text()).toContain('Hors connexion')
    const actions = wrapper.findAll('button')
    expect(actions.length).toBeGreaterThan(5)
    expect(actions.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })

  it('dit quand l’ingrédient n’a pas de préférence', async () => {
    const { wrapper } = await detail({}, 'inconnu')

    expect(wrapper.text()).toContain('Repas ne se souvient d’aucun produit pour cet article.')
    expect(wrapper.find('a').attributes('href')).toBe('/drive/produits')
  })

  it('« j’en ai toujours » : l’ingrédient s’ouvre sans liste', async () => {
    const { wrapper } = await detail({}, 'sel')

    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.find('button[aria-pressed="true"]').text()).toBe('J’en ai toujours')
  })

  it('compte les pièces au pluriel et au singulier', async () => {
    const { wrapper } = await detail({}, 'oeufs')

    expect(wrapper.find('ol li').text()).toContain('6 pièces')
  })
})

describe('Mes produits : la contenance d’un produit dans l’unité de la liste (DRV-652)', () => {
  const withSize = { 'GET /api/v1/drive/choices': list(cheddar, farine) }
  const field = (wrapper: Wrapper) =>
    wrapper.find<HTMLInputElement>('[data-testid="pack-size"] input')

  it('la liste dit « Contenu : 20 tranches » sous l’article, seulement quand le produit habituel en a une', async () => {
    const { wrapper } = await open(ProductsView, '/drive/produits', withSize)

    const rows = wrapper.findAll('li a')
    expect(rows[0]?.find('[data-testid="pack-size"]').text()).toBe('Contenu : 20 tranches')
    expect(rows[1]?.find('[data-testid="pack-size"]').exists()).toBe(false)
  })

  it('la liste ne dit rien pour « J’en ai toujours » ni sans contenance', async () => {
    const { wrapper } = await open(ProductsView, '/drive/produits')

    expect(wrapper.find('[data-testid="pack-size"]').exists()).toBe(false)
  })

  it('une unité absente de la liste des unités se dit par son slug lisible, un pluriel au-dessus de 1', async () => {
    const odd = {
      ...cheddar,
      accepted: [
        { rank: 1, product: { ...E, packSize: { value: 1, unitSlug: 'cuillere-a-soupe' } } },
      ],
    }
    const { wrapper } = await open(ProductsView, '/drive/produits', {
      'GET /api/v1/drive/choices': list(odd),
      'GET /api/v1/units': list(),
    })

    expect(wrapper.find('[data-testid="pack-size"]').text()).toBe('Contenu : 1 cuillere a soupe')
  })

  it('la fiche dit la contenance du produit qui en a une, et rien pour les autres', async () => {
    const { wrapper } = await detail(withSize, 'cheddar')

    const items = wrapper.findAll('ol li')
    expect(items[0]?.find('[data-testid="pack-size"]').text()).toContain('Contenu : 20 tranches')
    expect(items[1]?.find('[data-testid="pack-size"]').exists()).toBe(false)
    // Rien à régler avant : pas de champ tant qu’on ne touche pas « Corriger »
    expect(field(wrapper).exists()).toBe(false)
  })

  it('« Corriger » ouvre un champ prérempli ; enregistrer envoie UN ADD_PRODUCT de secours du même produit avec la contenance remplacée, rien d’autre', async () => {
    const { wrapper, fetchMock } = await detail(
      { ...withSize, 'PUT /api/v1/drive/choices': noContent },
      'cheddar',
    )

    await press(wrapper, 'Corriger')
    expect(field(wrapper).element.value).toBe('20')
    expect(wrapper.text()).toContain('Combien de tranches y a-t-il dans ce produit ?')
    expect(document.activeElement).toBe(field(wrapper).element)
    // Tant que le nombre n’a pas changé, rien à enregistrer
    expect(
      buttonsOf(wrapper, 'Enregistrer')
        .find((b) => b.element.closest('form'))
        ?.attributes('disabled'),
    ).toBeDefined()
    await field(wrapper).setValue('12,5')
    await wrapper.find('[data-testid="pack-size"] form').trigger('submit')
    await flushPromises()

    const index = puts(fetchMock)
    expect(await bodyOf(fetchMock, index)).toEqual({
      retailer: 'leclerc',
      storeId: '123456',
      choices: [
        {
          ingredientSlug: 'cheddar',
          action: 'ADD_PRODUCT',
          placement: 'FALLBACK',
          product: {
            retailerProductId: '555701',
            label: E.label,
            ean: null,
            content: { value: 340, unit: 'g' },
            price: null,
            packSize: { value: 12.5, unitSlug: 'tranche' },
          },
        },
      ],
    })
    expect(useNotificationsStore().items.map((item) => item.text)).toContain('Contenu enregistré.')
    expect(field(wrapper).exists()).toBe(false)
  })

  it.each([[''], ['0'], ['abc'], ['10000'], ['1,2345'], ['1 000']])(
    'refuse « %s » : « Enregistrer » inactif, rien ne part',
    async (typed) => {
      const { wrapper, fetchMock } = await detail(
        { ...withSize, 'PUT /api/v1/drive/choices': noContent },
        'cheddar',
      )
      await press(wrapper, 'Corriger')

      await field(wrapper).setValue(typed)
      await wrapper.find('[data-testid="pack-size"] form').trigger('submit')
      await flushPromises()

      const save = buttonsOf(wrapper, 'Enregistrer').find((b) => b.element.closest('form'))
      expect(save?.attributes('disabled')).toBeDefined()
      expect(puts(fetchMock)).toBe(-1)
    },
  )

  it('un nombre mal formé est dit en une phrase', async () => {
    const { wrapper } = await detail(withSize, 'cheddar')
    await press(wrapper, 'Corriger')

    await field(wrapper).setValue('vingt')

    expect(wrapper.find('[data-testid="pack-size"]').text()).toContain(
      'Entre un nombre, par exemple 20 ou 12,5.',
    )
  })

  it('un refus du back s’affiche à côté du champ, la saisie reste', async () => {
    const { wrapper } = await detail(
      { ...withSize, 'PUT /api/v1/drive/choices': failure(422, 'DRIVE_PACK_SIZE_INVALID') },
      'cheddar',
    )
    await press(wrapper, 'Corriger')
    await field(wrapper).setValue('8')

    await wrapper.find('[data-testid="pack-size"] form').trigger('submit')
    await flushPromises()

    expect(field(wrapper).element.value).toBe('8')
    expect(wrapper.find('[data-testid="pack-size"] [id$="-error"]').exists()).toBe(true)
  })

  it('« Annuler » referme le champ sans rien envoyer', async () => {
    const { wrapper, fetchMock } = await detail(withSize, 'cheddar')
    await press(wrapper, 'Corriger')
    await field(wrapper).setValue('8')

    await wrapper
      .findAll('[data-testid="pack-size"] button')
      .find((button) => button.text() === 'Annuler')
      ?.trigger('click')

    expect(field(wrapper).exists()).toBe(false)
    expect(puts(fetchMock)).toBe(-1)
  })

  it('le produit refusé puis accepté de nouveau dans le brouillon n’a pas de contenance à corriger (rien d’enregistré pour lui)', async () => {
    const refused = {
      ...cheddar,
      accepted: [{ rank: 1, product: E }],
      rejected: [{ ...B, packSize: null }],
    }
    const { wrapper } = await detail({ 'GET /api/v1/drive/choices': list(refused) }, 'cheddar')

    await press(wrapper, 'Accepter de nouveau')

    expect(wrapper.findAll('ol li')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="pack-size"]')).toHaveLength(1)
  })

  it('hors connexion, « Corriger » est inactif', async () => {
    const { wrapper } = await detail(withSize, 'cheddar')
    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    expect(buttonsOf(wrapper, 'Corriger')[0]?.attributes('disabled')).toBeDefined()
  })

  it.each([
    ['unite', 'Combien d’unités y a-t-il dans ce produit ?'],
    ['oeuf', 'Combien d’œufs y a-t-il dans ce produit ?'],
    ['tranche', 'Combien de tranches y a-t-il dans ce produit ?'],
    ['gramme', 'Combien de grammes y a-t-il dans ce produit ?'],
  ])('la question de « Corriger » élide « de » : %s', async (unitSlug, question) => {
    const choice = {
      ...cheddar,
      accepted: [{ rank: 1, product: { ...E, packSize: { value: 6, unitSlug } } }],
    }
    const { wrapper } = await detail({ 'GET /api/v1/drive/choices': list(choice) }, 'cheddar')

    await press(wrapper, 'Corriger')

    expect(wrapper.text()).toContain(question)
    expect(wrapper.text()).not.toContain('Combien de unités')
  })
})
