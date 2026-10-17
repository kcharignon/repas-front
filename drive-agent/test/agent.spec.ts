// @vitest-environment-options {"url": "https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/recherche.aspx"}
// L'agent (DRV-301, DRV-305) : silencieux sans plan ; avec un plan reçu par un transport, il déroule le passage. La page est celle d'un
// magasin inventé, l'interface est simulée (la vraie est fermée à la page, donc aux tests), aucun réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  decodeMessage,
  encodeMessage,
  validateResult,
  type ResultMessage,
  type SetupResultMessage,
} from '../protocol'
import { run } from '../src/agent'
import type { DiagnosticProps } from '../src/ui'
import { fakeAdapter, fakeUi, home, plan, skip } from './flow-helpers'

const PLAN = plan([home('sel'), skip('huile')])
const ORIGIN = 'https://repas.exemple.invalid'

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
  Reflect.deleteProperty(window, 'repasHost')
  vi.unstubAllGlobals()
})

describe('sans plan', () => {
  it('ne change rien à la page : ni élément, ni variable globale', () => {
    // Given : une page de magasin inventée
    document.body.innerHTML = '<p>Page</p>'
    const before = document.documentElement.outerHTML
    const names = Object.getOwnPropertyNames(window)

    // When
    run()

    // Then
    expect(document.documentElement.outerHTML).toBe(before)
    expect(Object.getOwnPropertyNames(window)).toEqual(names)
  })

  it('n’écrit rien dans la console et ne contacte aucun site', () => {
    const log = vi.spyOn(console, 'log')
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)

    run()

    expect(log).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reste silencieux avec le pont de l’application tant que l’application n’envoie rien', () => {
    const bridge = {
      postMessage: vi.fn<(text: string) => void>(),
      addEventListener: vi.fn<() => void>(),
    }
    Object.assign(window, { repasHost: bridge })
    const before = document.documentElement.outerHTML

    run()

    expect(bridge.addEventListener).toHaveBeenCalledWith('message', expect.any(Function))
    expect(bridge.postMessage).not.toHaveBeenCalled()
    expect(document.documentElement.outerHTML).toBe(before)
  })
})

describe('avec le pont de l’application', () => {
  it('déroule le passage et rend le résultat à l’application, en JSON', async () => {
    // Given
    let receive: (event: { data: unknown }) => void = () => undefined
    const bridge = {
      postMessage: vi.fn<(text: string) => void>(),
      addEventListener: (_type: 'message', listener: typeof receive) => {
        receive = listener
      },
    }
    Object.assign(window, { repasHost: bridge })
    const screens = fakeUi()
    run(window, { flow: { ui: screens.ui } })

    // When
    receive({ data: JSON.stringify(PLAN) })

    // Then
    await vi.waitFor(() => expect(bridge.postMessage).toHaveBeenCalledOnce())
    const result = validateResult(
      JSON.parse(bridge.postMessage.mock.calls[0]?.[0] ?? ''),
    ) as ResultMessage
    expect(result).toMatchObject({
      outcome: 'completed',
      runId: PLAN.runId,
      store: { id: '000123' },
      lines: [
        { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
        { ingredientSlug: 'huile', outcome: 'SKIPPED' },
      ],
    })
    expect(screens.screens()).toEqual(['summary', 'progress', 'end'])
  })

  it('un message illisible de l’application montre « liste illisible »', async () => {
    let receive: (event: { data: unknown }) => void = () => undefined
    Object.assign(window, {
      repasHost: {
        postMessage: vi.fn<(text: string) => void>(),
        addEventListener: (_type: string, listener: typeof receive) => {
          receive = listener
        },
      },
    })
    const screens = fakeUi()
    run(window, { flow: { ui: screens.ui } })

    receive({ data: '{pas du json' })

    await vi.waitFor(() =>
      expect(screens.propsOf('error')).toEqual([{ code: 'INVALID_MESSAGE', canReturn: false }]),
    )
  })
})

describe('le diagnostic', () => {
  const asDiagnostic = () => window.history.replaceState(null, '', '#repas-diagnostic')

  it('s’ouvre sur l’écran d’accueil quand l’adresse se termine par #repas-diagnostic ; « Fermer » ne fait rien d’autre', async () => {
    asDiagnostic()
    const screens = fakeUi({ welcome: () => 'close' })

    run(window, { origin: ORIGIN, flow: { ui: screens.ui } })

    await vi.waitFor(() => expect(screens.closed.count).toBe(1))
    expect(screens.screens()).toEqual(['welcome'])
  })

  it('« Diagnostic » joue les contrôles en lecture seule : une recherche, aucun appel au panier, aucun message vers Repas', async () => {
    asDiagnostic()
    const navigate = vi.fn<(url: string) => void>()
    const searches: string[] = []
    const adapter = {
      ...fakeAdapter().adapter,
      searchProducts: (query: string) => {
        searches.push(query)
        return Promise.resolve([])
      },
    }
    const shown: DiagnosticProps[] = []
    const screens = fakeUi({
      welcome: () => 'diagnostic',
      diagnostic: (props) =>
        new Promise<'close'>((resolve) => {
          shown.push(props)
          props.start({ update: () => undefined, finish: () => resolve('close') })
        }),
    })

    run(window, { origin: ORIGIN, navigate, flow: { ui: screens.ui, adapter } })

    await vi.waitFor(() => expect(screens.closed.count).toBe(1))
    expect(screens.screens()).toEqual(['welcome', 'diagnostic'])
    expect(searches).toEqual(['sel'])
    expect(navigate).not.toHaveBeenCalled()
  })

  it('le presse-papiers de la page copie le rapport ; un refus rend « false »', async () => {
    asDiagnostic()
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const results: boolean[] = []
    const screens = fakeUi({
      welcome: () => 'diagnostic',
      diagnostic: async (props) => {
        results.push(await props.copy('le rapport'))
        writeText.mockRejectedValueOnce(new Error('refusé'))
        results.push(await props.copy('le rapport'))
        Reflect.deleteProperty(window.navigator, 'clipboard')
        results.push(await props.copy('le rapport'))
        return 'close' as const
      },
    })

    run(window, { origin: ORIGIN, flow: { ui: screens.ui } })

    await vi.waitFor(() => expect(screens.closed.count).toBe(1))
    expect(results).toEqual([true, false, false])
    expect(writeText).toHaveBeenCalledWith('le rapport')
  })

  it('sans ce fragment, aucun écran : l’agent reste silencieux', () => {
    const screens = fakeUi()

    run(window, { origin: ORIGIN, flow: { ui: screens.ui } })

    expect(screens.shown).toEqual([])
  })
})

describe('le mode configuration', () => {
  const { lines: _lines, type: _type, ...head } = PLAN
  const SETUP = { ...head, type: 'setup' as const }

  it('par le fragment : lit le magasin de la page et le rend à Repas, au chemin de retour autorisé', async () => {
    // Given
    window.history.replaceState(null, '', `#repas=${encodeMessage(SETUP)}`)
    const navigate = vi.fn<(url: string) => void>()
    const screens = fakeUi({ store: () => 'save' })

    // When
    run(window, { origin: ORIGIN, navigate, flow: { ui: screens.ui } })

    // Then
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce())
    const url = navigate.mock.calls[0]?.[0] ?? ''
    expect(url.startsWith(`${ORIGIN}/drive/retour#result=`)).toBe(true)
    const result = validateResult(
      decodeMessage(url.slice(url.indexOf('#result=') + '#result='.length)),
    ) as SetupResultMessage
    expect(result).toEqual({
      v: 1,
      type: 'setup-result',
      runId: PLAN.runId,
      agentVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      store: {
        id: '000123',
        host: 'fd0-courses.leclercdrive.fr',
        baseUrl: 'https://fd0-courses.leclercdrive.fr/magasin-000123-000123',
        label: null,
      },
    })
    expect(screens.screens()).toEqual(['store'])
  })

  it('par le pont de l’application : rend le magasin à l’application, en JSON', async () => {
    let receive: (event: { data: unknown }) => void = () => undefined
    const bridge = {
      postMessage: vi.fn<(text: string) => void>(),
      addEventListener: (_type: 'message', listener: typeof receive) => {
        receive = listener
      },
    }
    Object.assign(window, { repasHost: bridge })
    const screens = fakeUi({ store: () => 'save' })
    run(window, { flow: { ui: screens.ui } })

    receive({ data: JSON.stringify(SETUP) })

    await vi.waitFor(() => expect(bridge.postMessage).toHaveBeenCalledOnce())
    expect(validateResult(JSON.parse(bridge.postMessage.mock.calls[0]?.[0] ?? ''))).toMatchObject({
      type: 'setup-result',
      store: { id: '000123' },
    })
  })

  it('annulé : rend « aborted » ; la page n’est pas touchée par une requête', async () => {
    window.history.replaceState(null, '', `#repas=${encodeMessage(SETUP)}`)
    const navigate = vi.fn<(url: string) => void>()
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)

    run(window, { origin: ORIGIN, navigate, flow: { ui: fakeUi({ store: () => 'cancel' }).ui } })

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce())
    const url = navigate.mock.calls[0]?.[0] ?? ''
    expect(
      validateResult(decodeMessage(url.slice(url.indexOf('#result=') + '#result='.length))),
    ).toMatchObject({ type: 'result', outcome: 'aborted', lines: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('avec le fragment de l’adresse', () => {
  const withPlan = () => window.history.replaceState(null, '', `#repas=${encodeMessage(PLAN)}`)

  it('refuse d’agir tant que l’origine de Repas n’est pas écrite dans l’agent, et ne navigue nulle part', async () => {
    // Given : le marqueur `__REPAS_ORIGIN__` n'a pas été remplacé
    withPlan()
    const navigate = vi.fn<(url: string) => void>()
    const screens = fakeUi()

    // When
    run(window, { navigate, flow: { ui: screens.ui } })

    // Then
    await vi.waitFor(() =>
      expect(screens.propsOf('error')).toEqual([{ code: 'UNSUPPORTED_PAGE', canReturn: false }]),
    )
    expect(screens.screens()).toEqual(['error'])
    expect(navigate).not.toHaveBeenCalled()
  })

  it('navigue vers l’origine écrite dans l’agent, au chemin de retour autorisé, avec le résultat dans le fragment', async () => {
    withPlan()
    const navigate = vi.fn<(url: string) => void>()
    const screens = fakeUi()

    run(window, { origin: ORIGIN, navigate, flow: { ui: screens.ui } })

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce())
    const url = navigate.mock.calls[0]?.[0] ?? ''
    expect(url.startsWith(`${ORIGIN}/drive/retour#result=`)).toBe(true)
    const result = decodeMessage(
      url.slice(url.indexOf('#result=') + '#result='.length),
    ) as ResultMessage
    expect(validateResult(result)).toMatchObject({ outcome: 'completed', runId: PLAN.runId })
  })

  it('un fragment illisible montre « liste illisible »', async () => {
    window.history.replaceState(null, '', '#repas=pas du base64url')
    const screens = fakeUi()

    run(window, { origin: ORIGIN, flow: { ui: screens.ui } })

    await vi.waitFor(() =>
      expect(screens.propsOf('error')).toEqual([{ code: 'INVALID_MESSAGE', canReturn: false }]),
    )
  })

  it('se passe d’un sessionStorage interdit', async () => {
    withPlan()
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('interdit', 'SecurityError')
    })
    const navigate = vi.fn<(url: string) => void>()

    run(window, { origin: ORIGIN, navigate, flow: { ui: fakeUi().ui } })

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce())
  })
})

describe('la commande de diagnostic de l’application', () => {
  const COMMAND = { v: 1, type: 'command', command: 'diagnostic' }

  // Le diagnostic lance une vraie recherche (chemin relatif, à l’hôte de la page) : aucun réseau dans les tests.
  const fetchSpy = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error('pas de réseau dans les tests'))
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
  })

  function withBridge() {
    let listener: (event: { data: unknown }) => void = () => undefined
    const bridge = {
      postMessage: vi.fn<(text: string) => void>(),
      addEventListener: (_type: 'message', handler: typeof listener) => {
        listener = handler
      },
    }
    Object.assign(window, { repasHost: bridge })
    return { bridge, receive: (message: unknown) => listener({ data: JSON.stringify(message) }) }
  }

  /** Un diagnostic que le test referme à la main. */
  function diagnosticUi() {
    const close: (() => void)[] = []
    const screens = fakeUi({
      diagnostic: (props) =>
        new Promise<'close'>((resolve) => {
          close.push(() => resolve('close'))
          props.start({ update: () => undefined, finish: () => undefined })
        }),
    })
    return { screens, closeDiagnostic: () => close.at(-1)?.() }
  }

  it('ouvre le diagnostic aussitôt, sans écran d’accueil, et ne renvoie rien à l’application', async () => {
    // Given
    const { bridge, receive } = withBridge()
    const searches: string[] = []
    const adapter = {
      ...fakeAdapter().adapter,
      searchProducts: (query: string) => {
        searches.push(query)
        return Promise.resolve([])
      },
    }
    const { screens, closeDiagnostic } = diagnosticUi()
    run(window, { flow: { ui: screens.ui, adapter } })

    // When
    receive(COMMAND)
    await vi.waitFor(() => expect(searches).toEqual(['sel']))
    closeDiagnostic()

    // Then
    await vi.waitFor(() => expect(screens.closed.count).toBe(1))
    expect(screens.screens()).toEqual(['diagnostic'])
    expect(bridge.postMessage).not.toHaveBeenCalled()
  })

  it.each([
    ['une commande inconnue', { ...COMMAND, command: 'supprimer' }],
    ['une clé en trop', { ...COMMAND, plan: [] }],
  ])('%s montre « liste illisible » et n’ouvre pas le diagnostic', async (_name, message) => {
    const { receive } = withBridge()
    const screens = fakeUi()
    run(window, { flow: { ui: screens.ui } })

    receive(message)

    await vi.waitFor(() =>
      expect(screens.propsOf('error')).toEqual([{ code: 'INVALID_MESSAGE', canReturn: false }]),
    )
    expect(screens.screens()).toEqual(['error'])
  })

  it('est ignorée pendant un passage ; le passage, lui, n’est pas touché', async () => {
    // Given : un passage arrêté sur son récapitulatif
    const { receive } = withBridge()
    const screens = fakeUi({ summary: () => new Promise<'start'>(() => undefined) })
    run(window, { flow: { ui: screens.ui } })
    receive(PLAN)
    await vi.waitFor(() => expect(screens.screens()).toEqual(['summary']))

    // When
    receive(COMMAND)
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Then
    expect(screens.screens()).toEqual(['summary'])
  })

  it('un passage est ignoré pendant le diagnostic, puis repart une fois celui-ci fermé', async () => {
    // Given : le diagnostic ouvert
    const { bridge, receive } = withBridge()
    const { screens, closeDiagnostic } = diagnosticUi()
    run(window, { flow: { ui: screens.ui } })
    receive(COMMAND)
    await vi.waitFor(() => expect(screens.screens()).toEqual(['diagnostic']))

    // When : un plan arrive pendant le diagnostic, puis un second après sa fermeture
    receive(PLAN)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screens.screens()).toEqual(['diagnostic'])
    closeDiagnostic()
    await vi.waitFor(() => expect(screens.closed.count).toBe(1))
    receive(PLAN)

    // Then
    await vi.waitFor(() => expect(bridge.postMessage).toHaveBeenCalledOnce())
    expect(screens.screens()).toEqual(['diagnostic', 'summary', 'progress', 'end'])
  })
})
