// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Auchan dans le registre de l'agent (DRV-727, DRV-717) : la page est celle du site d'Auchan. Un plan de Leclerc y est refusé (`STORE_MISMATCH`) sans une
// requête ; un plan d'Auchan lit d'abord le magasin (une requête `GET /journey`, jamais l'adresse), puis cherche le produit (DRV-724), et le panier (DRV-725),
// faute de cookie lisible dans cette page de test, arrête le passage sans rien écrire. Tout est inventé : aucun contact avec un site d'enseigne.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { validateResult } from '../protocol'
import { run } from '../src/agent'
import { fakeUi, home, plan } from './flow-helpers'
import { validExamples } from './protocol-examples'
import { auchanFixture, showPage } from './auchan-helpers'

/** Le pont de l'application : ce que l'agent lui rend et la fonction qui lui envoie un message. */
function bridge() {
  let receive: (event: { data: unknown }) => void = () => undefined
  const postMessage = vi.fn<(text: string) => void>()
  Object.assign(window, {
    repasHost: {
      postMessage,
      addEventListener: (_type: 'message', listener: typeof receive) => {
        receive = listener
      },
    },
  })
  return { postMessage, send: (message: unknown) => receive({ data: JSON.stringify(message) }) }
}

const example = (name: string) => validExamples('plan').find((item) => item.name === name)?.message
const auchanPlan = () => example('plan-auchan')
const auchanSetup = () => example('plan-setup-auchan')

/** Un `fetch` qui répond le parcours demandé et consigne les adresses. */
function journeyFetch(body = auchanFixture('parcours-magasin.json'), status = 200) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(body, { status, headers: { 'content-type': 'application/json' } }),
    ),
  )
}

beforeEach(() => {
  showPage(auchanFixture('accueil-magasin.html'))
  sessionStorage.setItem('tracking_authenticated', 'true')
})
afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'repasHost')
  document.documentElement.innerHTML = ''
  sessionStorage.clear()
})

/** La réponse que l'agent a rendue à l'application, validée par le protocole. */
const resultOf = (postMessage: ReturnType<typeof bridge>['postMessage']) =>
  validateResult(JSON.parse(postMessage.mock.calls[0]?.[0] ?? ''))

describe('la page est celle d’Auchan', () => {
  it('refuse un plan de Leclerc : STORE_MISMATCH, sans lire le magasin ni envoyer une requête', async () => {
    const fetchSpy = journeyFetch()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(plan([home('sel')]))

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')).toEqual([{ code: 'STORE_MISMATCH', canReturn: true }])
    expect(resultOf(app.postMessage)).toMatchObject({
      outcome: 'error',
      error: { code: 'STORE_MISMATCH' },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuse aussi un setup de Leclerc', async () => {
    const fetchSpy = journeyFetch()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })
    const { lines: _lines, type: _type, ...head } = plan([home('sel')])

    app.send({ ...head, type: 'setup' })

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.screens()).toEqual(['error'])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('un plan d’Auchan : le magasin est lu par UNE requête GET /journey, puis le produit est cherché ; le panier s’arrête faute de cookie de consentement lisible, sans écrire', async () => {
    // La cadence d'Auchan (2 s au moins entre deux requêtes) tourne sur l'horloge fausse du test
    vi.useFakeTimers()
    const fetchSpy = vi.fn<typeof fetch>((url) =>
      Promise.resolve(
        String(url).startsWith('/recherche')
          ? new Response(auchanFixture('recherche-farine.html'), {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            })
          : new Response(auchanFixture('parcours-magasin.json'), {
              headers: { 'content-type': 'application/json' },
            }),
      ),
    )
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce(), { timeout: 20_000 })
    const result = resultOf(app.postMessage)
    expect(result).toMatchObject({ outcome: 'error', error: { code: 'CONTRACT_CHANGED' } })
    expect(JSON.stringify(result)).toContain('CART_CONSENT_UNREADABLE')
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      '/journey',
      '/recherche?text=Farine%20de%20bl%C3%A9%20T55%20de%20test%201%20kg',
    ])
    expect(fetchSpy.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
  })

  it('aucun magasin choisi (la barre « Choisir vos courses ») : une étape guidée, pas une erreur (DRV-751) ; ni requête ni écriture, la page reste utilisable ; « Arrêter pour l’instant » rend un envoi arrêté', async () => {
    showPage(auchanFixture('accueil-sans-magasin.html'))
    // jsdom ne mesure rien : la page montre tout ce qu'elle contient (DRV-757 : seul un élément MONTRÉ est désigné)
    const box = (shown: boolean) =>
      ({
        top: 10,
        bottom: shown ? 50 : 10,
        left: 0,
        right: shown ? 200 : 0,
        width: shown ? 200 : 0,
        height: shown ? 40 : 0,
        x: 0,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect
    // (le panneau de choix du faux site est fermé : ses éléments n'ont pas de boîte)
    const shownBoxes = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) {
        return box(this.closest('#panel') === null)
      })
    const fetchSpy = journeyFetch()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi()
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(screens.screens()).toEqual(['guide']))
    expect(screens.propsOf('guide')).toEqual([
      expect.objectContaining({ step: 'store', stage: 'waiting', index: 1, total: 1 }),
    ])
    // La carte cite la barre de la page, que la personne n'a plus qu'à toucher ; l'agent la désigne sans y toucher
    expect(screens.propsOf('guide')[0]?.label).toBe('Choisir vos courses')
    expect(screens.propsOf('guide')[0]?.look?.().target?.element.textContent).toBe(
      'Choisir vos courses',
    )
    expect(screens.propsOf('guide')[0]?.look?.().sub).toBe('bar')
    expect(screens.screens()).not.toContain('error')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(app.postMessage).not.toHaveBeenCalled()

    screens.pressGuideStop()

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(resultOf(app.postMessage)).toMatchObject({ outcome: 'aborted' })
    expect(fetchSpy).not.toHaveBeenCalled()
    shownBoxes.mockRestore()
  })

  it('aucun magasin choisi, puis choisi dans la page : l’agent continue TOUT SEUL, une seule lecture du parcours, aucun écran d’erreur, aucun double envoi', async () => {
    vi.useFakeTimers()
    showPage(auchanFixture('accueil-sans-magasin.html'))
    const fetchSpy = vi.fn<typeof fetch>((url) =>
      Promise.resolve(
        String(url).startsWith('/recherche')
          ? new Response(auchanFixture('recherche-farine.html'), {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            })
          : new Response(auchanFixture('parcours-magasin.json'), {
              headers: { 'content-type': 'application/json' },
            }),
      ),
    )
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(screens.screens()).toEqual(['guide'])
    expect(fetchSpy).not.toHaveBeenCalled()

    // La personne choisit son magasin : la barre change, sans recharger la page
    showPage(auchanFixture('accueil-magasin.html'))
    await vi.advanceTimersByTimeAsync(30_000)

    // Plus rien à guider : « Ton magasin est choisi », puis le passage lui-même (la recherche du premier produit), sans que la personne ait quitté la page
    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual(['waiting', 'done'])
    expect(screens.screens()).not.toContain('error')
    expect(fetchSpy.mock.calls.map(([url]) => url).slice(0, 2)).toEqual([
      '/journey',
      '/recherche?text=Farine%20de%20bl%C3%A9%20T55%20de%20test%201%20kg',
    ])
    expect(fetchSpy.mock.calls.filter(([url]) => url === '/journey')).toHaveLength(1)
    expect(fetchSpy.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
  })

  it('aucun contexte de courses dans le parcours alors que la barre dit « Retrait » : un vrai désaccord, l’écran d’erreur après trois lectures, pas une attente sans fin', async () => {
    vi.useFakeTimers()
    const fetchSpy = journeyFetch(auchanFixture('parcours-sans-magasin.json'))
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())
    await vi.advanceTimersByTimeAsync(0)

    // La page dit déjà que le magasin est choisi : pas une étape à guider, l'erreur tout de suite
    expect(screens.screens()).toEqual(['error'])
    expect(screens.propsOf('error')[0]).toMatchObject({ cause: 'STORE_NOT_CHOSEN' })
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['/journey'])
    expect(resultOf(app.postMessage)).toMatchObject({ outcome: 'error' })
  })

  it('un autre magasin que celui du plan : STORE_MISMATCH', async () => {
    const body = auchanFixture('parcours-magasin.json').replace(
      '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
      '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
    )
    Object.assign(window, { fetch: journeyFetch(body) })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')).toEqual([{ code: 'STORE_MISMATCH', canReturn: true }])
  })

  it('un visiteur (tracking_authenticated « false ») : une étape guidée « connecte-toi » après la seule lecture du magasin, sans écrire (DRV-751) ; « Arrêter pour l’instant » rend un envoi arrêté', async () => {
    sessionStorage.setItem('tracking_authenticated', 'false')
    const fetchSpy = journeyFetch()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi()
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(screens.screens()).toEqual(['guide']))
    expect(screens.propsOf('guide')).toEqual([
      expect.objectContaining({ step: 'login', stage: 'waiting', index: 1, total: 1 }),
    ])
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['/journey'])
    expect(app.postMessage).not.toHaveBeenCalled()

    screens.pressGuideStop()

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(resultOf(app.postMessage)).toMatchObject({ outcome: 'aborted' })
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['/journey'])
  })

  it('le site ne répond plus comme prévu (parcours illisible) : CONTRACT_CHANGED avec sa cause', async () => {
    Object.assign(window, { fetch: journeyFetch('<html>autre chose</html>') })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(resultOf(app.postMessage)).toMatchObject({
      outcome: 'error',
      error: { code: 'CONTRACT_CHANGED' },
    })
    expect(JSON.stringify(resultOf(app.postMessage))).toContain('JOURNEY_NOT_JSON')
  })
})

describe('la configuration du magasin d’Auchan (setup)', () => {
  it('lit le magasin par le parcours, demande « Utiliser ce magasin ? » avec son libellé, puis rend setup-result (identifiant, hôte, adresse de base constante)', async () => {
    Object.assign(window, { fetch: journeyFetch() })
    const app = bridge()
    const screens = fakeUi({ store: () => 'save' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanSetup())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('store')).toEqual([
      { id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc', label: 'Drive Ville-Test' },
    ])
    expect(resultOf(app.postMessage)).toMatchObject({
      type: 'setup-result',
      store: {
        id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
        host: 'www.auchan.fr',
        baseUrl: 'https://www.auchan.fr/',
        label: 'Drive Ville-Test',
      },
    })
  })

  it('la page dit qu’un magasin est choisi mais le site n’en voit pas : l’écran d’erreur « Choisis ton magasin », et rien n’est enregistré', async () => {
    Object.assign(window, { fetch: journeyFetch(auchanFixture('parcours-sans-magasin.json')) })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanSetup())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')).toEqual([
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'STORE_NOT_CHOSEN' },
    ])
    expect(screens.screens()).not.toContain('store')
    expect(resultOf(app.postMessage)).toMatchObject({ outcome: 'error' })
  })

  it('première configuration, aucun magasin choisi (DRV-740) : pas d’écran d’erreur, un bandeau ; la page reste utilisable et aucune requête ne part tant que la barre dit « Choisir vos courses » ; le magasin choisi, UNE lecture puis « Utiliser ce magasin ? »', async () => {
    // Given : la barre dit « Choisir vos courses »
    vi.useFakeTimers()
    showPage(auchanFixture('accueil-sans-magasin.html'))
    const fetchSpy = journeyFetch()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ store: () => 'save' })
    run(window, { flow: { ui: screens.ui } })

    // When : le setup arrive tout de suite à l'ouverture (l'adresse d'Auchan ne change jamais)
    app.send(auchanSetup())
    await vi.advanceTimersByTimeAsync(0)

    // Then : un bandeau, pas d'erreur ; 30 secondes de choix sans une requête
    expect(screens.screens()).toEqual(['guide'])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(screens.screens()).toEqual(['guide'])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(app.postMessage).not.toHaveBeenCalled()

    // When : la personne choisit son magasin, la barre change
    showPage(auchanFixture('accueil-magasin.html'))
    await vi.advanceTimersByTimeAsync(2_000)

    // Then : une seule lecture du parcours, puis l'écran habituel
    expect(screens.screens()).toEqual(['guide', 'store'])
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['/journey'])
    expect(screens.propsOf('store')).toEqual([
      { id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc', label: 'Drive Ville-Test' },
    ])
    expect(resultOf(app.postMessage)).toMatchObject({ type: 'setup-result' })
  })

  it('une panne du site pendant la lecture du magasin est dite (NETWORK), pas avalée', async () => {
    Object.assign(window, { fetch: journeyFetch('Service indisponible', 503) })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanSetup())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')).toEqual([
      { code: 'NETWORK', canReturn: true, cause: 'HTTP_503' },
    ])
  })
})
