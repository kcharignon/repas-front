import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, rateLimited, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { DRAFT_KEY } from '../bridge'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import type { SentMessage } from '../bridge/__tests__/fakeNative'
import DriveSendView from '../DriveSendView.vue'
import { estimate } from './estimateFixtures'
import { plan, storeBaseUrl } from './fixtures'

// Données SYNTHÉTIQUES : magasin d'essai et produits inventés.
const RUN = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'
const OTHER_RUN = '0b6d1a3e-7c1f-4a55-9a8e-2f4d9c3b7e10'

type Handlers = Parameters<typeof stubApi>[0]

const noContent = () => new Response(null, { status: 204 })
const failure = (status: number, message: string) => () => json({ error: { message } }, { status })
const appInfo = (drive: boolean) => ({
  v: 1,
  type: 'app.info',
  version: '1.0.0',
  versionCode: 1,
  drive,
})

const draftOf = (listId: string, runId = RUN) =>
  JSON.stringify({ runId, listId, startedAt: new Date().toISOString() })

/** Le faux pont de l'application, posé sur la fenêtre comme le ferait `addWebMessageListener`. */
function installApp(drive = true, onStart?: (message: SentMessage) => void) {
  const native = fakeNative((message, reply) => {
    if (message.type === 'app.info') reply(appInfo(drive))
    onStart?.(message)
  })
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

  return native
}

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

async function open(handlers: Handlers = {}, listId = 'l1', query = '') {
  const fetchMock = stubApi({
    ...session,
    'GET /api/v1/drive/plans/l1': () => json(plan()),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(`/drive/envoi/${listId}${query}`)
  const wrapper = mount(DriveSendView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

  return { wrapper, context, fetchMock }
}

// Le plan est lu : le magasin s'affiche sous le titre, quel que soit l'état de l'écran (envoi, attente, hors application)
const loaded = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  vi.waitFor(() => expect(wrapper.text()).toContain('Magasin'))

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

/** La phrase de synthèse : construite avec les comptes, elle suit les choix de l'utilisateur. */
const summary = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  wrapper.find('p.text-xl').text()

const started = (native: ReturnType<typeof fakeNative>) =>
  native.sent.filter((message) => message.type === 'drive.start')

beforeEach(() => localStorage.clear())

afterEach(() => {
  vi.unstubAllGlobals()
  delete (globalThis as { repasNative?: unknown }).repasNative
  document.body.innerHTML = ''
  localStorage.clear()
  window.dispatchEvent(new Event('online'))
})

describe('écran d’envoi au drive, dans l’application', () => {
  it('dit la liste en une phrase, garde « Ouvrir le drive » avant les articles, qui sont repliés au-delà de 6 lignes', async () => {
    installApp()
    const { wrapper, fetchMock } = await open()
    await loaded(wrapper)

    expect(calls(fetchMock)).toContain('GET /api/v1/drive/plans/l1')
    expect(wrapper.find('h1').text()).toBe('Ta liste est prête pour le drive')
    expect(wrapper.text()).toContain('Magasin …456')
    expect(summary(wrapper)).toBe(
      '12 articles : 8 sont déjà choisis, 3 sont à choisir sur Leclerc, 1 ne sera pas mis au panier.',
    )
    // Une phrase de synthèse et le bouton : plus de phrase d'explication (DRV-628)
    expect(wrapper.text()).not.toContain('va se remplir')
    // Plus de bloc de compteurs ; la liste est repliée et le bouton passe avant elle (et avant l’estimation)
    expect(wrapper.find('dl').exists()).toBe(false)
    expect(wrapper.find('details > summary').text()).toBe('Voir les articles')
    const html = wrapper.html()
    expect(html.indexOf('Ouvrir le drive')).toBeLessThan(html.indexOf('Voir les articles'))
    expect(wrapper.findAll('main > section ul > li')).toHaveLength(12)

    const farine = wrapper.findAll('main > section ul > li')[0]!
    expect(farine.text()).toContain('À acheter : 800 g')
    expect(farine.findAll('ol > li').map((item) => item.text().replace(/\s+/g, ' '))).toEqual([
      '1. Farine de blé T55 Marque Repère 1 kg · 1 produit',
      '2. Farine de blé T45 1 kg (remplacement) · 2 produits',
    ])
    expect(farine.text()).toContain('Ne plus proposer : Farine complète bio 1 kg')

    const beurre = wrapper.findAll('main > section ul > li')[1]!
    expect(beurre.find('ol > li').text().replace(/\s+/g, ' ')).toBe(
      '1. Beurre doux 250 g · quantité à vérifier',
    )
    // Lu par les lecteurs d'écran avant la liste : le mot de Repas (« produit habituel »), jamais « préférence » (DRV-626)
    expect(farine.find('p.sr-only').text()).toBe('Produits retenus :')
    expect(beurre.find('p.sr-only').text()).toBe('Produit habituel :')
    expect(wrapper.text()).not.toMatch(/préférence/i)

    const poivre = wrapper.findAll('main > section ul > li')[8]!
    expect(poivre.text()).toContain('Nouveau : tu choisiras le produit sur Leclerc.')
    expect(wrapper.findAll('main > section ul > li')[11]!.text()).toContain(
      'J’en ai toujours : rien à mettre au panier.',
    )
  })

  it('ne replie pas une liste de 6 articles ou moins, et dit « tous » quand un seul état reste', async () => {
    installApp()
    const six = plan()
    six.lines = six.lines.slice(0, 6)
    const { wrapper } = await open({ 'GET /api/v1/drive/plans/l1': () => json(six) })
    await loaded(wrapper)

    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.find('h2').text()).toBe('Tes articles')
    expect(wrapper.findAll('main > section ul > li')).toHaveLength(6)
    expect(summary(wrapper)).toBe('6 articles : tous sont déjà choisis.')
  })

  it('montre l’estimation du coût de la liste entre le bouton et les articles', async () => {
    installApp()
    const { wrapper, fetchMock } = await open({
      'GET /api/v1/drive/settings': () =>
        json({ enabled: true, retailer: 'leclerc', store: estimate().store }),
      'GET /api/v1/drive/estimates/l1': () => json(estimate()),
    })
    await loaded(wrapper)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Estimation du coût'))

    expect(wrapper.text().replace(/\s/g, ' ')).toContain('12,47 €')
    expect(calls(fetchMock)).toContain('GET /api/v1/drive/estimates/l1')
    // Le bouton, puis l'estimation, puis les articles
    const html = wrapper.html()
    expect(html.indexOf('Ouvrir le drive')).toBeLessThan(html.indexOf('Estimation du coût'))
    expect(html.indexOf('Estimation du coût')).toBeLessThan(html.indexOf('Voir les articles'))
  })

  it('« Choisir un autre produit » et « Passer cette fois » changent la ligne et les compteurs, et s’annulent', async () => {
    installApp()
    const { wrapper } = await open()
    await loaded(wrapper)

    await press('Choisir un autre produit')
    expect(wrapper.findAll('main > section ul > li')[0]!.text()).toContain(
      'Tu choisiras un autre produit sur Leclerc, à la place de : Farine de blé T55 Marque Repère 1 kg.',
    )
    expect(summary(wrapper)).toBe(
      '12 articles : 7 sont déjà choisis, 4 sont à choisir sur Leclerc, 1 ne sera pas mis au panier.',
    )

    await wrapper.find('button[aria-label="Pas cette fois : Lait"]').trigger('click')
    expect(summary(wrapper)).toBe(
      '12 articles : 6 sont déjà choisis, 4 sont à choisir sur Leclerc, 2 ne seront pas mis au panier.',
    )
    expect(wrapper.findAll('main > section ul > li')[2]!.text()).toContain(
      'Pas cette fois : rien ne sera mis au panier.',
    )

    // L'annulation : les mêmes boutons, pressés une seconde fois
    await wrapper.find('button[aria-label="Choisir un autre produit : Farine"]').trigger('click')
    await wrapper.find('button[aria-label="Pas cette fois : Lait"]').trigger('click')
    expect(summary(wrapper)).toContain('8 sont déjà choisis')
    expect(wrapper.findAll('main > section ul > li')[0]!.find('ol').exists()).toBe(true)
  })

  it('n’offre aucun choix pour une ligne « tu en as déjà », ni « autre produit » pour une ligne à choisir', async () => {
    installApp()
    const { wrapper } = await open()
    await loaded(wrapper)

    const items = wrapper.findAll('main > section ul > li')
    expect(items[11]!.find('button').exists()).toBe(false)
    expect(items[8]!.findAll('button').map((item) => item.text())).toEqual(['Pas cette fois'])
    expect(items[0]!.findAll('button').map((item) => item.text())).toEqual([
      'Choisir un autre produit',
      'Pas cette fois',
    ])
  })

  it('« Ouvrir le drive » garde le brouillon, envoie le plan de 12 lignes avec les surcharges, puis attend le retour', async () => {
    const native = installApp()
    const { wrapper } = await open()
    await loaded(wrapper)
    await press('Choisir un autre produit')
    await wrapper.find('button[aria-label="Pas cette fois : Lait"]').trigger('click')

    await press('Ouvrir le drive')

    const [start] = started(native)
    expect(start?.plan?.lines).toHaveLength(12)
    expect(start?.plan).toMatchObject({
      type: 'plan',
      retailer: 'leclerc',
      store: { id: '123456', host: new URL(storeBaseUrl).host },
      returnPath: '/drive/retour',
    })
    const lines = Object.fromEntries(start!.plan!.lines.map((line) => [line.ingredientSlug, line]))
    expect(lines.farine).toMatchObject({
      status: 'NEW',
      products: [],
      replaces: { id: '123456', label: 'Farine de blé T55 Marque Repère 1 kg' },
      rejected: [{ id: '999000', label: 'Farine complète bio 1 kg' }],
    })
    expect(lines.lait).toEqual({ ingredientSlug: 'lait', name: 'Lait', status: 'SKIP' })
    expect(lines.beurre).toMatchObject({
      status: 'KNOWN',
      products: [{ id: '300001', packs: null }],
    })

    // Le brouillon est écrit, avec le runId du message
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')).toMatchObject({
      runId: start!.plan!.runId,
      listId: 'l1',
    })
    expect(wrapper.text()).toContain('En attente du récapitulatif…')
    expect(wrapper.find('p.text-xl').exists()).toBe(false)
  })

  it('retrouve un passage en cours après un rechargement : « Rouvrir le drive » garde le même passage', async () => {
    localStorage.setItem(DRAFT_KEY, draftOf('l1'))
    const native = installApp()
    const { wrapper } = await open()
    await vi.waitFor(() => expect(wrapper.text()).toContain('En attente du récapitulatif…'))

    await press('Rouvrir le drive')

    expect(started(native)[0]?.plan?.runId).toBe(RUN)
    expect(wrapper.text()).toContain('En attente du récapitulatif…')
  })

  it('« Recommencer » abandonne le passage et revient à la liste', async () => {
    localStorage.setItem(DRAFT_KEY, draftOf('l1'))
    const native = installApp()
    const { wrapper } = await open()
    await vi.waitFor(() => expect(wrapper.text()).toContain('En attente du récapitulatif…'))

    await press('Recommencer')

    expect(native.sent.map((message) => message.type)).toContain('drive.cancel')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    await loaded(wrapper)
    expect(wrapper.text()).not.toContain('En attente du récapitulatif…')

    // Un nouveau passage a un nouveau runId
    await press('Ouvrir le drive')
    expect(started(native)[0]?.plan?.runId).not.toBe(RUN)
  })

  it('« Rouvrir la liste » demande confirmation, rouvre avec la version du plan, abandonne le passage', async () => {
    localStorage.setItem(DRAFT_KEY, draftOf('l1'))
    const native = installApp()
    const { wrapper, context, fetchMock } = await open({
      'POST /api/v1/shopping-lists/l1/reopen': noContent,
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('En attente du récapitulatif…'))

    await press('Rouvrir la liste')
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      'L’envoi en cours est abandonné et la liste redevient modifiable.',
    )
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/reopen')
    ;[...document.body.querySelectorAll('[role="dialog"] button')]
      .find((item) => item.textContent.trim() === 'Rouvrir la liste')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await vi.waitFor(() =>
      expect(context.router.currentRoute.value.name).toBe('shopping-list-detail'),
    )
    const request = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((candidate) => candidate.url.endsWith('/reopen'))
    expect(request?.headers.get('If-Match')).toBe('"7"')
    expect(native.sent.map((message) => message.type)).toContain('drive.cancel')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('un passage d’une autre liste bloque : le voir ou l’abandonner', async () => {
    localStorage.setItem(DRAFT_KEY, draftOf('l2', OTHER_RUN))
    const native = installApp()
    const { wrapper } = await open()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Un autre envoi est en cours'))

    expect(wrapper.find('a[href="/drive/envoi/l2"]').text()).toBe('Voir cet envoi')
    expect(wrapper.find('p.text-xl').exists()).toBe(false)

    await press('Abandonner cet envoi')

    expect(native.sent.map((message) => message.type)).toContain('drive.cancel')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    await loaded(wrapper)
  })

  it('un passage apparu dans un autre onglet est repris au lieu d’en lancer un second', async () => {
    const native = installApp()
    const { wrapper } = await open()
    await loaded(wrapper)
    localStorage.setItem(DRAFT_KEY, draftOf('l1', OTHER_RUN))

    await press('Ouvrir le drive')

    expect(started(native)).toHaveLength(0)
    expect(wrapper.text()).toContain('En attente du récapitulatif…')
  })

  it('une adresse avec « lignes » ne reprend que les articles nommés, le plan envoyé aussi', async () => {
    const native = installApp()
    const { wrapper } = await open({}, 'l1', '?lignes=beurre,poivre')
    await loaded(wrapper)

    expect(wrapper.findAll('main > section ul > li')).toHaveLength(2)
    expect(summary(wrapper)).toBe('2 articles : 1 est déjà choisi, 1 est à choisir sur Leclerc.')
    expect(wrapper.text()).toContain('Reprise des articles en échec : 2 articles')
    expect(wrapper.find('a[href="/drive/envoi/l1"]').text()).toBe('Voir toute la liste')

    await press('Ouvrir le drive')

    expect(started(native)[0]?.plan?.lines.map((line) => line.ingredientSlug)).toEqual([
      'beurre',
      'poivre',
    ])
  })

  it('désactive le drive sans réseau, et le dit', async () => {
    installApp()
    const { wrapper } = await open()
    await loaded(wrapper)

    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    expect(button('Ouvrir le drive')?.disabled).toBe(true)
    expect(wrapper.text()).toContain('Hors connexion')
  })

  it('refuse d’ouvrir le drive quand l’application dit qu’il n’est pas utilisable', async () => {
    installApp(false)
    const { wrapper } = await open()

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Le drive ne fonctionne pas sur ce téléphone'),
    )
    expect(button('Ouvrir le drive')?.disabled).toBe(true)
    expect(wrapper.find('a[href="/drive/aide"]').exists()).toBe(true)
  })

  it('une liste sans ligne n’a rien à envoyer', async () => {
    installApp()
    const { wrapper } = await open({
      'GET /api/v1/drive/plans/l1': () =>
        json(plan({ lines: [], counts: { known: 0, new: 0, haveAtHome: 0 } })),
    })
    await loaded(wrapper)

    expect(wrapper.text()).toContain('Cette liste n’a aucun article à envoyer.')
    expect(button('Ouvrir le drive')?.disabled).toBe(true)
  })

  describe('erreurs du lancement', () => {
    it('une liste de plus de 100 articles ne part pas', async () => {
      const native = installApp()
      const many = plan()
      many.lines = Array.from({ length: 101 }, (_, index) => ({
        ...many.lines[8]!,
        ingredientSlug: `article-${index}`,
        ingredientName: `Article ${index}`,
      }))
      const { wrapper } = await open({ 'GET /api/v1/drive/plans/l1': () => json(many) })
      await loaded(wrapper)

      await press('Ouvrir le drive')

      expect(wrapper.find('[role="alert"]').text()).toContain('plus de 100 articles')
      expect(started(native)).toHaveLength(0)
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('un plan de plus de 64 Ko est signalé', async () => {
      installApp()
      const heavy = plan()
      const label = 'é'.repeat(250)
      heavy.lines = Array.from({ length: 60 }, (_, index) => ({
        ...heavy.lines[0]!,
        ingredientSlug: `article-${index}`,
        products: [1, 2, 3, 4, 5].map((rank) => ({
          ...heavy.lines[0]!.products[0]!,
          rank,
          retailerProductId: `${index}${rank}`,
          label,
        })),
      }))
      const { wrapper } = await open({ 'GET /api/v1/drive/plans/l1': () => json(heavy) })
      await loaded(wrapper)

      await press('Ouvrir le drive')

      expect(wrapper.find('[role="alert"]').text()).toContain('trop gros pour l’application')
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('un plan invalide est signalé sans rien envoyer', async () => {
      const native = installApp()
      const broken = plan()
      broken.lines[0]!.ingredientSlug = 'Pas un slug'
      const { wrapper } = await open({ 'GET /api/v1/drive/plans/l1': () => json(broken) })
      await loaded(wrapper)

      await press('Ouvrir le drive')

      expect(wrapper.find('[role="alert"]').text()).toContain('Repas n’a pas pu préparer l’envoi')
      expect(started(native)).toHaveLength(0)
    })

    it('un pont qui refuse l’envoi est signalé, le brouillon n’est pas gardé', async () => {
      const native = installApp()
      const { wrapper } = await open()
      await loaded(wrapper)
      vi.mocked(native.bridge.postMessage).mockImplementation(() => {
        throw new Error('pont fermé')
      })

      await press('Ouvrir le drive')

      expect(wrapper.find('[role="alert"]').text()).toContain('n’a pas pu ouvrir le drive')
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('une application qui ne répond plus : trois phrases et le bouton pour la mettre à jour', async () => {
      installApp()
      const { wrapper } = await open()
      await loaded(wrapper)
      delete (globalThis as { repasNative?: unknown }).repasNative

      await press('Ouvrir le drive')

      const alert = wrapper.find('[role="alert"]')
      expect(alert.find('p').text()).toBe(
        'Le drive n’a pas répondu comme prévu. Rien n’a été perdu. Mets l’application à jour, puis réessaie.',
      )
      expect(alert.find('a[href="/drive/aide#mise-a-jour"]').text()).toBe(
        'Mettre à jour l’application',
      )
      expect(alert.text()).not.toMatch(/[A-Z]{2,}_[A-Z_]+/)
    })

    it('un envoi trop gros ou trop long dit quoi faire, sans bouton de plus', async () => {
      installApp()
      const many = plan()
      many.lines = Array.from({ length: 101 }, (_, index) => ({
        ...many.lines[8]!,
        ingredientSlug: `article-${index}`,
        ingredientName: `Article ${index}`,
      }))
      const { wrapper } = await open({ 'GET /api/v1/drive/plans/l1': () => json(many) })
      await loaded(wrapper)

      await press('Ouvrir le drive')

      const alert = wrapper.find('[role="alert"]')
      expect(alert.text()).toBe(
        'Cette liste a plus de 100 articles : c’est trop pour un seul envoi. Ta liste n’a pas changé. Retire des articles, puis renvoie-la.',
      )
      expect(alert.find('a').exists()).toBe(false)
    })

    it('une adresse de magasin illisible est signalée', async () => {
      installApp()
      const broken = plan()
      broken.store.baseUrl = 'pas une adresse'
      const { wrapper } = await open({ 'GET /api/v1/drive/plans/l1': () => json(broken) })
      await loaded(wrapper)

      await press('Ouvrir le drive')

      expect(wrapper.find('[role="alert"]').text()).toContain('Repas n’a pas pu préparer l’envoi')
    })
  })
})

describe('écran d’envoi au drive, hors de l’application', () => {
  it('explique, renvoie vers l’installation et propose une recherche Leclerc par ligne', async () => {
    const { wrapper } = await open()
    await loaded(wrapper)

    expect(wrapper.text()).toContain('L’envoi automatique n’est pas disponible ici')
    expect(wrapper.find('a[href="/drive/aide"]').text()).toBe('Installer l’application')
    expect(button('Ouvrir le drive')).toBeUndefined()
    expect(wrapper.findAll('main > section ul > li button')).toHaveLength(0)

    const links = wrapper.findAll('main > section ul > li > a')
    // Une recherche par ligne, sauf « tu en as déjà »
    expect(links).toHaveLength(11)
    expect(links[0]!.attributes()).toMatchObject({
      href: `${storeBaseUrl}/recherche.aspx?TexteRecherche=Farine`,
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    expect(links[0]!.attributes('aria-label')).toBe(
      'Chercher sur Leclerc : Farine (s’ouvre dans un nouvel onglet)',
    )
    expect(links[6]!.attributes('href')).toBe(
      `${storeBaseUrl}/recherche.aspx?TexteRecherche=P%C3%A2tes`,
    )
  })
})

describe('écran d’envoi au drive, version de l’application (DRV-640)', () => {
  const sentence = 'Mets à jour l’application pour envoyer ta liste.'

  /** Une application qui annonce cette version (`null` : elle ne répond pas à `app.info`). */
  function installVersion(version: string | null) {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info' && version !== null)
        reply({ v: 1, type: 'app.info', version, versionCode: 1, drive: true })
    })
    ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

    return native
  }

  it.each(['0.1.8', '0.1.9'])(
    'une application %s : une phrase et « Mettre à jour », ni le drive ni l’agent, les recherches restent',
    async (version) => {
      const native = installVersion(version)
      const { wrapper } = await open()
      await loaded(wrapper)

      await vi.waitFor(() => expect(wrapper.text()).toContain(sentence))
      const message = wrapper.find('section[role="status"]')
      expect(message.text()).toContain(sentence)
      const update = message.find('a')
      expect(update.text()).toBe('Mettre à jour')
      expect(update.attributes('href')).toBe('/drive/aide')

      expect(button('Ouvrir le drive')).toBeUndefined()
      expect(wrapper.text()).not.toContain('sont déjà choisis')
      // Le repli à la main : un lien de recherche par article, liste ouverte
      const links = wrapper.findAll('main > section ul > li > a')
      expect(links).toHaveLength(11)
      expect(links[0]!.attributes('href')).toBe(
        `${storeBaseUrl}/recherche.aspx?TexteRecherche=Farine`,
      )
      expect(wrapper.findAll('main > section ul > li button')).toHaveLength(0)
      expect(wrapper.find('details').exists()).toBe(false)
      expect(started(native)).toHaveLength(0)
    },
  )

  it('une application qui ne dit pas sa version est traitée comme trop ancienne', async () => {
    installVersion(null)
    const { wrapper } = await open({}, 'l1', '')
    await loaded(wrapper)

    await vi.waitFor(() => expect(wrapper.text()).toContain(sentence), { timeout: 6000 })
    expect(button('Ouvrir le drive')).toBeUndefined()
    expect(wrapper.findAll('main > section ul > li > a')).toHaveLength(11)
  }, 10000)

  it('une réponse mal formée est traitée comme une version inconnue', async () => {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info') reply({ v: 1, type: 'app.info', version: 7 })
    })
    ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge
    const { wrapper } = await open()
    await loaded(wrapper)

    await vi.waitFor(() => expect(wrapper.text()).toContain(sentence))
    expect(button('Ouvrir le drive')).toBeUndefined()
  })

  it.each(['0.1.10', '0.2.0', '1.0.0'])(
    'une application %s : le comportement habituel, sans la phrase',
    async (version) => {
      const native = installVersion(version)
      const { wrapper } = await open()
      await loaded(wrapper)

      await vi.waitFor(() => expect(native.sent.map((m) => m.type)).toContain('app.info'))
      await flushPromises()
      expect(wrapper.text()).not.toContain(sentence)
      expect(button('Ouvrir le drive')?.disabled).toBe(false)
      await press('Ouvrir le drive')
      expect(started(native)).toHaveLength(1)
    },
  )

  it('un navigateur (sans pont) garde son message « installe l’application », sans la phrase', async () => {
    const { wrapper } = await open()
    await loaded(wrapper)

    expect(wrapper.text()).not.toContain(sentence)
    expect(wrapper.text()).toContain('L’envoi automatique n’est pas disponible ici')
    expect(wrapper.find('a[href="/drive/aide"]').text()).toBe('Installer l’application')
    expect(wrapper.findAll('main > section ul > li > a')).toHaveLength(11)
  })

  it('un passage déjà commencé garde « Rouvrir le drive », même avec une application ancienne', async () => {
    installVersion('0.1.8')
    localStorage.setItem(DRAFT_KEY, draftOf('l1'))
    const { wrapper } = await open()
    await loaded(wrapper)

    expect(wrapper.text()).toContain('En attente du récapitulatif…')
    expect(button('Rouvrir le drive')).toBeDefined()
  })
})

describe('lecture du plan', () => {
  it('mène aux réglages quand aucun magasin n’est enregistré (409 DRIVE_NOT_CONFIGURED)', async () => {
    installApp()
    const { context } = await open({
      'GET /api/v1/drive/plans/l1': failure(409, 'DRIVE_NOT_CONFIGURED'),
    })

    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-settings'))
    // L'écran du magasin sait où nous rendre : l'écran de l'envoi de cette liste
    expect(context.router.currentRoute.value.query).toEqual({
      magasin: 'requis',
      retour: 'envoi',
      liste: 'l1',
    })
  })

  it.each([
    [
      409,
      'SHOPPING_LIST_NOT_SENT',
      'Cette liste n’est plus envoyée au drive. Rien n’a été changé. Ouvre la liste pour voir où elle en est.',
    ],
    [403, 'SHOPPING_LIST_FORBIDDEN', 'Tu n’as pas le droit de faire cela.'],
    [404, 'SHOPPING_LIST_NOT_FOUND', 'Cet élément n’existe plus.'],
  ])('explique le refus %i %s', async (status, code, message) => {
    installApp()
    const { wrapper } = await open({ 'GET /api/v1/drive/plans/l1': failure(status, code) })

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text().replace(/'/g, '’')).toBe(
      message.replace(/'/g, '’'),
    )
    expect(wrapper.find('p.text-xl').exists()).toBe(false)
  })

  it('trop de lectures (429) : le dit comme un refus passager, sans relire tout seul, puis réessaie à la demande', async () => {
    installApp()
    let limited = true
    const { wrapper, fetchMock } = await open({
      'GET /api/v1/drive/plans/l1': () => (limited ? rateLimited(1)() : json(plan())),
    })
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Trop de demandes en peu de temps. Rien n’est perdu. Attends une minute, puis réessaie.',
    )
    expect(wrapper.find('p.text-xl').exists()).toBe(false)
    await flushPromises()
    expect(calls(fetchMock).filter((call) => call.includes('/drive/plans/'))).toHaveLength(1)

    limited = false
    await press('Réessayer')

    await loaded(wrapper)
    expect(calls(fetchMock).filter((call) => call.includes('/drive/plans/'))).toHaveLength(2)
  })

  describe('fonction coupée (retour arrière)', () => {
    const SENT = { id: 'l1', version: 7, isSent: true }
    const disabled = {
      'GET /api/v1/drive/plans/l1': failure(404, 'DRIVE_DISABLED'),
      'GET /api/v1/shopping-lists/l1': () => json(SENT),
    }
    const alert = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
      wrapper.find('[role="alert"]').text().replace(/'/g, '’')

    it('dit « pas disponible », sans « Ouvrir le drive » ni « Envoyer au drive », et propose de rouvrir la liste envoyée', async () => {
      installApp()
      const { wrapper } = await open(disabled)

      await vi.waitFor(() => expect(button('Rouvrir la liste')).toBeDefined())

      expect(alert(wrapper)).toBe(
        'L’envoi au drive n’est pas disponible pour le moment. Ta liste n’a pas changé. Réessaie plus tard.',
      )
      expect(wrapper.text()).toContain('Tu peux la rouvrir pour la modifier.')
      expect(button('Ouvrir le drive')).toBeUndefined()
      expect(button('Envoyer au drive')).toBeUndefined()
      expect(wrapper.find('p.text-xl').exists()).toBe(false)
    })

    it('rouvre la liste avec la confirmation de l’écran de la liste, la version lue, et efface un passage resté en attente', async () => {
      localStorage.setItem(DRAFT_KEY, draftOf('l1'))
      installApp()
      const { wrapper, context, fetchMock } = await open({
        ...disabled,
        'POST /api/v1/shopping-lists/l1/reopen': noContent,
      })
      await vi.waitFor(() => expect(button('Rouvrir la liste')).toBeDefined())
      expect(wrapper.text()).not.toContain('En attente du récapitulatif…')

      await press('Rouvrir la liste')
      const dialog = document.body.querySelector('[role="dialog"]')
      expect(dialog?.textContent).toContain('Rouvrir la liste ?')
      expect(dialog?.textContent).toContain('La liste redevient modifiable.')
      expect(dialog?.textContent).not.toContain('vidé')
      expect(dialog?.textContent).not.toContain('envoi en cours')
      expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/reopen')
      ;[...document.body.querySelectorAll('[role="dialog"] button')]
        .find((item) => item.textContent.trim() === 'Rouvrir la liste')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      await vi.waitFor(() =>
        expect(context.router.currentRoute.value.name).toBe('shopping-list-detail'),
      )
      const request = fetchMock.mock.calls
        .map(([input]) => input as Request)
        .find((candidate) => candidate.url.endsWith('/reopen'))
      expect(request?.headers.get('If-Match')).toBe('"7"')
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('ne propose pas de rouvrir une liste qui n’est pas envoyée', async () => {
      installApp()
      const { wrapper, fetchMock } = await open({
        ...disabled,
        'GET /api/v1/shopping-lists/l1': () => json({ ...SENT, isSent: false }),
      })
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
      await vi.waitFor(() => expect(calls(fetchMock)).toContain('GET /api/v1/shopping-lists/l1'))
      await flushPromises()

      expect(button('Rouvrir la liste')).toBeUndefined()
      expect(button('Réessayer')).toBeDefined()
    })

    it('ne propose rien de plus quand la liste ne se lit pas', async () => {
      installApp()
      const { wrapper } = await open({
        ...disabled,
        'GET /api/v1/shopping-lists/l1': failure(404, 'SHOPPING_LIST_NOT_FOUND'),
      })
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
      await flushPromises()

      expect(button('Rouvrir la liste')).toBeUndefined()
    })

    it('désactive « Rouvrir la liste » sans réseau', async () => {
      installApp()
      const { wrapper } = await open(disabled)
      await vi.waitFor(() => expect(button('Rouvrir la liste')).toBeDefined())

      window.dispatchEvent(new Event('offline'))
      await flushPromises()

      expect(button('Rouvrir la liste')?.disabled).toBe(true)
      expect(wrapper.text()).toContain('Hors connexion')
    })

    it('ne lit pas la liste quand le plan se lit (aucune requête de plus)', async () => {
      installApp()
      const { wrapper, fetchMock } = await open()
      await loaded(wrapper)

      expect(calls(fetchMock)).not.toContain('GET /api/v1/shopping-lists/l1')
    })

    it('les autres refus du plan ne proposent pas de rouvrir', async () => {
      installApp()
      const { wrapper, fetchMock } = await open({
        'GET /api/v1/drive/plans/l1': failure(409, 'SHOPPING_LIST_NOT_SENT'),
      })
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

      expect(button('Rouvrir la liste')).toBeUndefined()
      expect(calls(fetchMock)).not.toContain('GET /api/v1/shopping-lists/l1')
    })
  })

  it('propose de réessayer quand le serveur est injoignable', async () => {
    installApp()
    let up = false
    const { wrapper } = await open({
      'GET /api/v1/drive/plans/l1': () => (up ? json(plan()) : failure(500, 'boom')()),
    })
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    up = true
    await press('Réessayer')

    await loaded(wrapper)
  })

  it('laisse abandonner un passage en cours même quand le plan ne se lit pas', async () => {
    localStorage.setItem(DRAFT_KEY, draftOf('l1'))
    installApp()
    const { wrapper } = await open({
      'GET /api/v1/drive/plans/l1': failure(409, 'SHOPPING_LIST_NOT_SENT'),
    })
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    await press('Abandonner cet envoi')

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('relit le plan à chaque ouverture de l’écran', async () => {
    installApp()
    const first = await open()
    await loaded(first.wrapper)
    first.wrapper.unmount()

    const second = await open()
    await loaded(second.wrapper)

    expect(
      calls(second.fetchMock).filter((call) => call === 'GET /api/v1/drive/plans/l1'),
    ).toHaveLength(1)
  })
})

describe('écran d’envoi au drive, rayons conseillés (DRV-642)', () => {
  /** Le plan de référence dont la ligne « poivre » (à choisir) et la ligne « farine » (connue) portent des rayons conseillés. */
  const withHints = () => {
    const base = plan()
    return {
      ...base,
      lines: base.lines.map((line) =>
        ['poivre', 'farine'].includes(line.ingredientSlug)
          ? { ...line, rayonHints: [41, 12] }
          : line,
      ),
    }
  }

  function installVersion(version: string) {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info')
        reply({ v: 1, type: 'app.info', version, versionCode: 1, drive: true })
    })
    ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

    return native
  }

  async function send(version: string) {
    const native = installVersion(version)
    const { wrapper } = await open({ 'GET /api/v1/drive/plans/l1': () => json(withHints()) })
    await loaded(wrapper)
    await vi.waitFor(() => expect(native.sent.map((m) => m.type)).toContain('app.info'))
    await flushPromises()
    await press('Ouvrir le drive')

    return started(native)[0]?.plan
  }

  it.each(['0.1.15', '0.2.0', '1.0.0', '0.0.0-dev'])(
    'une application %s (agent à jour) : les rayons conseillés partent avec le plan',
    async (version) => {
      const message = await send(version)

      const line = (slug: string) => message?.lines.find((item) => item.ingredientSlug === slug)
      expect(line('poivre')?.rayonHints).toEqual([41, 12])
      expect(line('farine')?.rayonHints).toEqual([41, 12])
      expect(line('curry')).not.toHaveProperty('rayonHints')
    },
  )

  it.each(['0.1.10', '0.1.14'])(
    'une application %s (agent plus ancien) : le plan part sans « rayonHints », un agent ancien refuserait la clé',
    async (version) => {
      const message = await send(version)

      expect(message?.lines.length).toBeGreaterThan(0)
      expect(JSON.stringify(message)).not.toContain('rayonHints')
    },
  )
})
