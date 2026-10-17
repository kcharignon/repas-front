// @vitest-environment-options {"url": "https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/recherche.aspx"}
// L'injection de l'agent par l'application Android (DRV-313), éprouvée dans jsdom : le petit script `injection.js` met en place le pont
// `window.repasHost` à la forme exacte qu'attend l'agent (`bridgeTransport`), puis l'agent réel s'en sert. Le canal natif de la
// WebView est simulé : mêmes méthodes que l'objet de `addWebMessageListener` (`postMessage`, `addEventListener('message')`).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { validateResult, type ResultMessage } from '../../drive-agent/protocol'
import { run } from '../../drive-agent/src/agent'
import { fakeUi, home, plan, skip } from '../../drive-agent/test/flow-helpers'

const INJECTION = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets/injection.js'),
  'utf8',
)
const HELLO = '{"v":1,"type":"hello"}'

/** Le canal natif simulé : un EventTarget qui reçoit les messages de l'application, et un `postMessage` vers elle. */
class NativeChannel extends EventTarget {
  readonly postMessage = vi.fn<(text: string) => void>()
  fromApp(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

function withNative(): NativeChannel {
  const channel = new NativeChannel()
  Object.defineProperty(window, 'repasHost', { value: channel, configurable: true, writable: true })
  return channel
}

/** Évalue `injection.js` avec un « agent » donné (un texte JavaScript) dans la page de jsdom. */
function inject(agent: string): void {
  new Function(INJECTION.replace('/*__AGENT__*/', () => agent))()
}

/** Le pont tel que l'agent le voit (la forme de `Bridge` dans drive-agent/src/transport/bridge.ts). */
interface PageBridge {
  postMessage(value: unknown): void
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void
  removeEventListener(type: string, listener: unknown): void
}
const bridgeOf = () => (window as unknown as { repasHost: PageBridge }).repasHost

const COUNTER = 'window.__starts = (window.__starts || 0) + 1'
const starts = () => (window as unknown as { __starts?: number }).__starts ?? 0

// Le diagnostic lance une vraie recherche (chemin relatif, à l'hôte de la page) : aucun réseau dans ces tests.
const fetchSpy = vi.fn<typeof fetch>().mockRejectedValue(new Error('pas de réseau dans les tests'))

beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  Reflect.deleteProperty(window, 'repasHost')
  Reflect.deleteProperty(window, '__starts')
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchSpy.mockClear()
})

describe('le pont vu par l’agent', () => {
  it('a la forme que bridgeTransport attend, et annonce la page à l’application', () => {
    const channel = withNative()

    inject(COUNTER)

    const bridge = bridgeOf()
    expect(typeof bridge.postMessage).toBe('function')
    expect(typeof bridge.addEventListener).toBe('function')
    expect(Object.isFrozen(bridge)).toBe(true)
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO)
    expect(starts()).toBe(1)
  })

  it('ne laisse pas la page atteindre le canal natif : repasHost n’est plus l’objet natif', () => {
    const channel = withNative()

    inject(COUNTER)

    expect((window as unknown as { repasHost: unknown }).repasHost).not.toBe(channel)
  })

  it('transmet à l’application seulement des textes', () => {
    const channel = withNative()
    inject(COUNTER)
    const bridge = bridgeOf()
    const received: unknown[] = []
    bridge.addEventListener('message', (event) => received.push(event.data))

    channel.fromApp('{"v":1,"type":"plan"}')
    channel.fromApp({ pas: 'du texte' })
    channel.fromApp('{"v":1,"type":"setup"}')

    expect(received).toEqual(['{"v":1,"type":"plan"}', '{"v":1,"type":"setup"}'])
  })

  it('garde les messages arrivés avant l’agent et les lui rend une fois son démarrage fini', async () => {
    vi.useFakeTimers()
    const channel = withNative()
    inject(COUNTER)
    channel.fromApp('premier')
    channel.fromApp('second')
    const bridge = bridgeOf()
    const received: unknown[] = []

    bridge.addEventListener('message', (event) => received.push(event.data))
    expect(received).toEqual([])
    await vi.runAllTimersAsync()

    expect(received).toEqual(['premier', 'second'])
  })

  it('un écouteur qui échoue n’empêche pas les suivants', () => {
    const channel = withNative()
    inject(COUNTER)
    const bridge = bridgeOf()
    const received: unknown[] = []
    const broken = () => {
      throw new Error('écouteur cassé')
    }
    bridge.addEventListener('message', broken)
    bridge.addEventListener('message', (event) => received.push(event.data))

    channel.fromApp('texte')
    bridge.removeEventListener('message', broken)
    channel.fromApp('encore')

    expect(received).toEqual(['texte', 'encore'])
  })
})

describe('le démarrage de l’agent', () => {
  it('n’a pas lieu sans canal natif : pas d’agent, pas de pont', () => {
    inject(COUNTER)

    expect(starts()).toBe(0)
    expect('repasHost' in window).toBe(false)
  })

  it('n’a pas lieu si repasHost n’est pas un canal de messages', () => {
    Object.defineProperty(window, 'repasHost', {
      value: { postMessage: 'non' },
      configurable: true,
    })

    inject(COUNTER)

    expect(starts()).toBe(0)
  })

  it('n’a lieu qu’une fois, même si la page est évaluée deux fois', () => {
    const channel = withNative()

    inject(COUNTER)
    inject(COUNTER)

    expect(starts()).toBe(1)
    expect(channel.postMessage).toHaveBeenCalledTimes(1)
  })

  it('n’a pas lieu dans un cadre qui n’est pas la page principale', () => {
    const channel = withNative()
    const frame = { top: {}, repasHost: channel, setTimeout: window.setTimeout.bind(window) }
    const script = INJECTION.replace('/*__AGENT__*/', COUNTER)

    new Function('window', script)(frame)

    expect(starts()).toBe(0)
    expect(channel.postMessage).not.toHaveBeenCalled()
  })

  it('n’a pas lieu si le pont ne peut pas remplacer l’objet natif', () => {
    const channel = new NativeChannel()
    const locked = {
      top: undefined as unknown,
      repasHost: channel,
      setTimeout: window.setTimeout.bind(window),
    }
    locked.top = locked
    Object.defineProperty(locked, 'repasHost', {
      value: channel,
      configurable: false,
      writable: false,
    })
    const script = INJECTION.replace('/*__AGENT__*/', COUNTER)

    new Function('window', script)(locked)

    expect(starts()).toBe(0)
    expect(channel.postMessage).not.toHaveBeenCalled()
  })
})

describe('de bout en bout avec l’agent réel dans jsdom', () => {
  it('un plan de l’application déroule le passage et le résultat repart vers l’application', async () => {
    // Given : le pont mis en place par l'injection, puis l'agent (interface simulée, comme dans les tests de l'agent)
    const channel = withNative()
    inject('/* l’agent démarre ci-dessous */')
    const screens = fakeUi()
    run(window, { flow: { ui: screens.ui } })

    // When : l'application envoie un plan
    channel.fromApp(JSON.stringify(plan([home('sel'), skip('huile')])))

    // Then
    await vi.waitFor(() => expect(channel.postMessage).toHaveBeenCalledTimes(2))
    expect(channel.postMessage.mock.calls[0]?.[0]).toBe(HELLO)
    const result = validateResult(
      JSON.parse(channel.postMessage.mock.calls[1]?.[0] ?? ''),
    ) as ResultMessage
    expect(result).toMatchObject({ type: 'result', outcome: 'completed' })
    expect(screens.screens()).toEqual(['summary', 'progress', 'end'])
  })

  it('la commande de diagnostic de l’application ouvre le diagnostic, sans rien renvoyer', async () => {
    const channel = withNative()
    inject('/* l’agent démarre ci-dessous */')
    const diagnostic = fakeUi({
      diagnostic: (props) =>
        new Promise<'close'>((resolve) => {
          props.start({ update: () => undefined, finish: () => resolve('close') })
          setTimeout(() => resolve('close'), 0)
        }),
    })
    run(window, { flow: { ui: diagnostic.ui } })

    channel.fromApp('{"v":1,"type":"command","command":"diagnostic"}')

    await vi.waitFor(() => expect(diagnostic.closed.count).toBe(1))
    expect(diagnostic.screens()).toEqual(['diagnostic'])
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO)
  })
})

describe('le fichier agent.js réel, tel que l’application l’injecte', () => {
  it('démarre en silence, puis ouvre le diagnostic sur la commande de l’application', async () => {
    // Given : l'agent construit par make agent-build, derrière le pont de l'injection
    const { buildAgent } = await import('../../drive-agent/scripts/build.mjs')
    const built = await buildAgent()
    const channel = withNative()
    document.body.innerHTML = '<p>Page du drive (simulée)</p>'
    const before = document.documentElement.outerHTML

    // When : il démarre sans rien recevoir
    inject(built.code)

    // Then : la page n'a pas bougé, seule l'annonce est partie
    expect(document.documentElement.outerHTML).toBe(before)
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO)

    // When : l'application demande le diagnostic
    channel.fromApp('{"v":1,"type":"command","command":"diagnostic"}')

    // Then : l'interface de l'agent s'est posée dans la page, et rien n'est parti vers l'application
    await vi.waitFor(() => expect(document.documentElement.outerHTML).not.toBe(before))
    expect(channel.postMessage).toHaveBeenCalledTimes(1)
    // Les seules requêtes tentées visent l'hôte de la page (chemins relatifs).
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(fetchSpy.mock.calls.every(([url]) => String(url).startsWith('/'))).toBe(true)
  }, 30_000)
})
