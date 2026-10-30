// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Auchan dans le registre de l'agent (DRV-727, DRV-717) : la page est celle du site d'Auchan. Un plan de Leclerc y est refusé (`STORE_MISMATCH`) sans une
// requête ; un plan d'Auchan lit d'abord le magasin (une requête `GET /journey`, jamais l'adresse), puis la recherche, qui n'est pas écrite (DRV-724),
// arrête le passage sans écrire au panier. Tout est inventé : aucun contact avec un site d'enseigne.
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

  it('un plan d’Auchan : le magasin est lu par UNE requête GET /journey, puis la recherche (non écrite) arrête le passage, sans écrire', async () => {
    const fetchSpy = journeyFetch()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    const result = resultOf(app.postMessage)
    expect(result).toMatchObject({ outcome: 'error', error: { code: 'CONTRACT_CHANGED' } })
    expect(JSON.stringify(result)).toContain('ADAPTER_NOT_WRITTEN')
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['/journey'])
    expect(fetchSpy.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
  })

  it('aucun magasin choisi (la barre « Choisir vos courses ») : UNSUPPORTED_PAGE, cause « magasin non choisi », sans une requête ni une écriture', async () => {
    showPage(auchanFixture('accueil-sans-magasin.html'))
    const fetchSpy = journeyFetch()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')).toEqual([
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'STORE_NOT_CHOSEN' },
    ])
    const result = resultOf(app.postMessage)
    expect(result).toMatchObject({ outcome: 'error', error: { code: 'UNSUPPORTED_PAGE' } })
    expect(JSON.stringify(result)).toContain('STORE_NOT_CHOSEN')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('aucun contexte de courses dans le parcours : même arrêt, sans écriture', async () => {
    const fetchSpy = journeyFetch(auchanFixture('parcours-sans-magasin.json'))
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')[0]).toMatchObject({ cause: 'STORE_NOT_CHOSEN' })
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['/journey'])
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

  it('un visiteur (tracking_authenticated « false ») : NOT_LOGGED_IN, après la seule lecture du magasin, sans écrire', async () => {
    sessionStorage.setItem('tracking_authenticated', 'false')
    const fetchSpy = journeyFetch()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(resultOf(app.postMessage)).toMatchObject({
      outcome: 'error',
      error: { code: 'NOT_LOGGED_IN' },
    })
    expect(JSON.stringify(resultOf(app.postMessage))).toContain('SESSION_VISITOR')
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

  it('sans magasin choisi : l’écran d’erreur « Choisis ton magasin », et rien n’est enregistré', async () => {
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
