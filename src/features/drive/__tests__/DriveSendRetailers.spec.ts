// Choisir le drive à l'envoi (DRV-710) : la règle (R1 à R5) est calculée par le back et lue dans `selection` ; ici ce que l'écran en fait. Faux back à deux drives
// (le verdict est dit par chaque test, jamais recalculé), faux pont natif qui annonce les drives qu'il sert ; valeurs inventées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { DRAFT_KEY } from '../bridge'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import type { SentMessage } from '../bridge/__tests__/fakeNative'
import DriveSendView from '../DriveSendView.vue'
import { plan } from './fixtures'
import { SECOND_STORE, secondPlan, severalSettings } from './severalDrives'

const RUN = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'

type Handlers = Parameters<typeof stubApi>[0]
type Settings = Parameters<typeof severalSettings>[0]

const noContent = () => new Response(null, { status: 204 })

/** Le faux pont : il annonce `retailers` (absent : une application d'avant les drives multiples). */
function installApp(retailers: string[] | undefined) {
  const native = fakeNative((message, reply) => {
    if (message.type === 'app.info')
      reply({
        v: 1,
        type: 'app.info',
        version: '1.0.0',
        versionCode: 1,
        drive: true,
        ...(retailers === undefined ? {} : { retailers }),
      })
  })
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

  return native
}

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

/** Les plans servis selon `?retailer=` : l'écran doit demander celui du drive choisi. */
const plans = (): Handlers => ({
  'GET /api/v1/drive/plans/l1': (request: Request) => {
    const asked = new URL(request.url).searchParams.get('retailer')

    return json(asked === 'auchan' ? secondPlan() : plan())
  },
})

async function open(settings: Settings, handlers: Handlers = {}, query = '') {
  const fetchMock = stubApi({
    ...session,
    'GET /api/v1/drive/settings': () => json(severalSettings(settings)),
    ...plans(),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(`/drive/envoi/l1${query}`)
  const wrapper = mount(DriveSendView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

  return { wrapper, fetchMock }
}

const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === label,
  ) as HTMLButtonElement | undefined

const press = async (label: string) => {
  const target = button(label)
  if (target === undefined) throw new Error(`Bouton absent : ${label}`)
  target.click()
  await flushPromises()
}

const started = (native: ReturnType<typeof fakeNative>) =>
  native.sent.filter((message: SentMessage) => message.type === 'drive.start')

/** Les plans demandés, avec leur `?retailer=`. */
const planRequests = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .map(([input]) => new URL((input as Request).url))
    .filter((url) => url.pathname === '/api/v1/drive/plans/l1')
    .map((url) => url.searchParams.get('retailer'))

const tiles = () => [...document.body.querySelectorAll('input[name="send-drive"]')]
const tileNames = () =>
  tiles().map((tile) => tile.closest('label')?.textContent.replace(/\s+/g, ' ').trim())
const checked = () =>
  (tiles().find((tile) => (tile as HTMLInputElement).checked) as HTMLInputElement | undefined)
    ?.value

beforeEach(() => localStorage.clear())

afterEach(() => {
  vi.unstubAllGlobals()
  delete (globalThis as { repasNative?: unknown }).repasNative
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('un seul drive : l’écran d’avant', () => {
  it('ni question, ni lien, « Remplir mon panier », rien n’est retenu comme dernier drive', async () => {
    const native = installApp(['leclerc'])
    const { wrapper, fetchMock } = await open(
      { mode: 'AUTO', retailer: 'leclerc', configured: ['leclerc'] },
      {},
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('Magasin …456'))

    expect(tiles()).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Envoyer ailleurs')
    expect(wrapper.text()).not.toContain('Où envoyer ta liste')
    expect(button('Remplir mon panier')).toBeDefined()
    expect(planRequests(fetchMock)).toEqual(['leclerc'])

    await press('Remplir mon panier')

    expect(started(native)).toHaveLength(1)
    expect(started(native)[0]?.plan?.retailer).toBe('leclerc')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/last-retailer')
  })

  it('une application qui n’annonce rien sert Leclerc : aucune phrase de mise à jour', async () => {
    installApp(undefined)
    const { wrapper } = await open(
      { mode: 'AUTO', retailer: 'leclerc', configured: ['leclerc'] },
      {},
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('Magasin …456'))

    expect(wrapper.text()).not.toContain('Mets à jour')
    expect(button('Remplir mon panier')).toBeDefined()
  })
})

describe('plusieurs drives configurés, aucun drive habituel (R4)', () => {
  it('propose les deux drives, le dernier utilisé coché, un seul bouton « Remplir le panier {nom} »', async () => {
    installApp(['leclerc', 'auchan'])
    const { wrapper, fetchMock } = await open({
      mode: 'ASK',
      retailer: 'auchan',
      lastUsed: 'auchan',
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('à choisir sur Auchan'))

    expect(wrapper.text()).toContain('Où envoyer ta liste ?')
    expect(tileNames()).toEqual(['LeclercTon magasin : …456', 'AuchanTon magasin : …abc'])
    expect(checked()).toBe('auchan')
    expect(button('Remplir le panier Auchan')).toBeDefined()
    // Une petite icône de panier décorative devant le texte (DRV-744)
    const icon = button('Remplir le panier Auchan')?.querySelector('svg')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(button('Remplir mon panier')).toBeUndefined()
    // Le plan est demandé pour le drive présélectionné
    expect(planRequests(fetchMock)).toEqual(['auchan'])
    // L'écran ne dit jamais « enseigne » ni « retailer »
    expect(wrapper.text()).not.toMatch(/enseigne|retailer/i)
  })

  it('« Remplir le panier Auchan » retient le dernier drive AVANT drive.start, puis lance le plan de ce drive', async () => {
    const native = installApp(['leclerc', 'auchan'])
    const { wrapper, fetchMock } = await open(
      { mode: 'ASK', retailer: 'auchan', lastUsed: 'auchan' },
      {
        'PUT /api/v1/drive/last-retailer': (request: Request) => {
          // Au moment où le back reçoit l'écriture, l'application n'a encore rien reçu : l'écriture part d'abord
          expect(started(native)).toHaveLength(0)

          return request
            .clone()
            .json()
            .then(() => noContent())
        },
      },
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('à choisir sur Auchan'))

    await press('Remplir le panier Auchan')

    const put = fetchMock.mock.calls.find(([input]) =>
      (input as Request).url.endsWith('/drive/last-retailer'),
    )
    expect(await (put![0] as Request).json()).toEqual({ retailer: 'auchan' })
    expect(started(native)).toHaveLength(1)
    const message = started(native)[0]!.plan!
    expect(message.retailer).toBe('auchan')
    expect(message.store).toEqual({ id: SECOND_STORE.id, host: 'www.auchan.fr' })
    // Le brouillon porte le drive du passage
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')).toMatchObject({
      listId: 'l1',
      retailer: 'auchan',
    })
    // Les réglages sont relus pour la présélection suivante
    await vi.waitFor(() =>
      expect(calls(fetchMock).filter((call) => call === 'GET /api/v1/drive/settings')).toHaveLength(
        2,
      ),
    )
  })

  it('toucher l’autre tuile redemande le plan de ce drive et nomme le bouton', async () => {
    const native = installApp(['leclerc', 'auchan'])
    const { wrapper, fetchMock } = await open(
      { mode: 'ASK', retailer: 'auchan', lastUsed: 'auchan' },
      { 'PUT /api/v1/drive/last-retailer': noContent },
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('à choisir sur Auchan'))

    const leclerc = tiles().find((tile) => (tile as HTMLInputElement).value === 'leclerc')!
    ;(leclerc as HTMLInputElement).click()
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.text()).toContain('à choisir sur Leclerc'))

    expect(checked()).toBe('leclerc')
    expect(planRequests(fetchMock)).toEqual(['auchan', 'leclerc'])
    expect(wrapper.text()).toContain('sont à choisir sur Leclerc')
    await press('Remplir le panier Leclerc')
    expect(started(native)[0]?.plan?.retailer).toBe('leclerc')
  })

  it('une écriture du dernier drive qui échoue n’empêche pas l’ouverture', async () => {
    const native = installApp(['leclerc', 'auchan'])
    const { wrapper } = await open(
      { mode: 'ASK', retailer: 'leclerc' },
      {
        'PUT /api/v1/drive/last-retailer': () =>
          json({ error: { message: 'DRIVE_RETAILER_NOT_CONFIGURED' } }, { status: 422 }),
      },
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('à choisir sur Leclerc'))

    await press('Remplir le panier Leclerc')

    expect(started(native)).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Rien n’a été mis au panier')
  })

  it('une demande d’ouverture (« Envoyer au drive ») ne devine pas : l’écran garde la question', async () => {
    const native = installApp(['leclerc', 'auchan'])
    const { wrapper } = await open({ mode: 'ASK', retailer: 'leclerc' }, {}, '?ouvrir=1')
    await vi.waitFor(() => expect(tiles()).toHaveLength(2))
    await flushPromises()

    expect(started(native)).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Ouverture du drive')
    expect(button('Remplir le panier Leclerc')).toBeDefined()
  })

  it('une application qui ne connaît pas le drive coché le nomme dans la phrase de mise à jour, et l’autre reste proposé', async () => {
    const native = installApp(['leclerc'])
    const { wrapper } = await open({ mode: 'ASK', retailer: 'auchan', lastUsed: 'auchan' })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Mets à jour'))

    expect(wrapper.text()).toContain('Mets à jour l’application pour envoyer ta liste à Auchan.')
    expect(wrapper.text()).toContain('Mettre à jour')
    expect(button('Remplir le panier Auchan')).toBeUndefined()
    // Le repli : un lien de recherche par article, sur le site de ce drive
    const search = wrapper.findAll('a').map((link) => link.attributes('href') ?? '')
    expect(search).toContain('https://www.auchan.fr/recherche?text=Farine')

    const leclerc = tiles().find((tile) => (tile as HTMLInputElement).value === 'leclerc')!
    ;(leclerc as HTMLInputElement).click()
    await flushPromises()
    await vi.waitFor(() => expect(button('Remplir le panier Leclerc')).toBeDefined())
    expect(wrapper.text()).not.toContain('Mets à jour')

    await press('Remplir le panier Leclerc')
    expect(started(native)).toHaveLength(1)
  })
})

describe('un drive habituel et plusieurs drives configurés (DRV-737)', () => {
  it('la question est posée, le drive habituel est coché, aucun lien « Envoyer ailleurs », même avec ?ouvrir', async () => {
    const native = installApp(['leclerc', 'auchan'])
    const { wrapper } = await open(
      { mode: 'ASK', retailer: 'auchan', habitual: 'auchan' },
      { 'PUT /api/v1/drive/last-retailer': noContent },
      '?ouvrir=1',
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('à choisir sur Auchan'))

    expect(tileNames()).toHaveLength(2)
    expect(checked()).toBe('auchan')
    expect(button('Remplir le panier Auchan')).toBeDefined()
    expect(wrapper.text()).not.toContain('Envoyer ailleurs')
    expect(started(native)).toHaveLength(0)
  })

  it('toucher une autre tuile change le drive de cet envoi seulement : le drive habituel ne change pas', async () => {
    const native = installApp(['leclerc', 'auchan'])
    const { wrapper, fetchMock } = await open(
      { mode: 'ASK', retailer: 'leclerc', habitual: 'leclerc' },
      { 'PUT /api/v1/drive/last-retailer': noContent },
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('à choisir sur Leclerc'))
    expect(checked()).toBe('leclerc')

    const auchan = tiles().find((tile) => (tile as HTMLInputElement).value === 'auchan')
    ;(auchan as HTMLInputElement).click()
    await vi.waitFor(() => expect(button('Remplir le panier Auchan')).toBeDefined())
    await press('Remplir le panier Auchan')

    expect(started(native)[0]?.plan?.retailer).toBe('auchan')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/default-retailer')
    expect(calls(fetchMock)).toContain('PUT /api/v1/drive/last-retailer')
  })
})

describe('un envoi en attente de son résultat', () => {
  it('se rouvre sur le drive du brouillon, sans retenir de nouveau le dernier drive', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        runId: RUN,
        listId: 'l1',
        retailer: 'auchan',
        startedAt: new Date().toISOString(),
      }),
    )
    const native = installApp(['leclerc', 'auchan'])
    const { wrapper, fetchMock } = await open({ mode: 'ASK', retailer: 'leclerc' })
    await vi.waitFor(() => expect(wrapper.text()).toContain('En attente du récapitulatif'))

    // Le drive du passage, pas celui que la règle désigne aujourd’hui ; pas de question pendant l’attente
    expect(planRequests(fetchMock)).toEqual(['auchan'])
    expect(tiles()).toHaveLength(0)

    await press('Rouvrir le drive')

    expect(started(native)[0]?.plan?.runId).toBe(RUN)
    expect(started(native)[0]?.plan?.retailer).toBe('auchan')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/last-retailer')
  })

  it('un brouillon écrit avant les drives multiples (sans drive) est celui du drive d’alors', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ runId: RUN, listId: 'l1', startedAt: new Date().toISOString() }),
    )
    installApp(['leclerc', 'auchan'])
    const { wrapper, fetchMock } = await open({ mode: 'ASK', retailer: 'auchan' })
    await vi.waitFor(() => expect(wrapper.text()).toContain('En attente du récapitulatif'))

    expect(planRequests(fetchMock)).toEqual(['leclerc'])
  })
})

describe('le plan reste celui d’un drive', () => {
  it('le produit choisi sur le site d’un autre drive garde sa forme dans le brouillon', async () => {
    installApp(['leclerc', 'auchan'])
    const { wrapper } = await open({ mode: 'ASK', retailer: 'auchan' })
    await vi.waitFor(() => expect(wrapper.text()).toContain('à choisir sur Auchan'))
    await press('Remplir le panier Auchan')

    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as {
      lines: { ingredientSlug: string; products: string[] }[]
    }
    expect(draft.lines.find((line) => line.ingredientSlug === 'farine')?.products).toEqual([
      '5d3c2b1a-9f8e-4d7c-8b6a-0123456789ab',
    ])
  })
})
