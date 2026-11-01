// @vitest-environment-options {"url": "https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/recherche.aspx"}
// L'injection de l'agent par l'application Android (DRV-313), éprouvée dans jsdom : le petit script `injection.js` met en place le pont
// `window.repasHost` à la forme exacte qu'attend l'agent (`bridgeTransport`), l'agent réel s'en sert, puis `window.repasHost` est retiré de
// la page. Le canal natif de la WebView est simulé : mêmes méthodes que l'objet de `addWebMessageListener` (`postMessage`,
// `addEventListener('message')`). Chaque essai a sa propre « page » (voir `newPage`) : une fois l'agent démarré, `repasHost` y est non reconfigurable.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  validateResult,
  validateSelftestResult,
  type ResultMessage,
} from '../../drive-agent/protocol'
import { run } from '../../drive-agent/src/agent'
import { LOT_WORDS } from '../../drive-agent/src/selftest'
import { fakeUi, home, plan, skip } from '../../drive-agent/test/flow-helpers'

const INJECTION = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets/injection.js'),
  'utf8',
)
const HELLO = '{"v":1,"type":"hello"}'
const HELLO_DEBUG = '{"v":1,"type":"hello","debug":true}'
/** Le marqueur que l'application remplace par `true` dans sa variante de débogage (AgentAsset.DEBUG_PLACEHOLDER). */
const DEBUG_MARKER = '/*__DEBUG__*/false'

/** Le canal natif simulé : un EventTarget qui reçoit les messages de l'application, et un `postMessage` vers elle. */
class NativeChannel extends EventTarget {
  readonly postMessage = vi.fn<(text: string) => void>()
  fromApp(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

/** Le pont tel que l'agent le voit (la forme de `Bridge` dans drive-agent/src/transport/bridge.ts). */
interface PageBridge {
  postMessage(value: unknown): void
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void
  removeEventListener(type: string, listener: unknown): void
}

/** Ce que l'« agent » d'un essai laisse sur la page : son compteur de démarrages, le pont qu'il a lu, de quoi lancer le vrai agent. */
type Page = Window &
  typeof globalThis & {
    repasHost?: unknown
    __starts?: number
    __bridge?: PageBridge
    __start?: () => void
  }

/**
 * Une page neuve : la fenêtre de jsdom, dont elle hérite tout (document, horloge, `fetch`), mais avec son propre `top` et son propre
 * `repasHost`. Une fois l'agent démarré, `injection.js` rend `repasHost` non reconfigurable : une fenêtre partagée entre les essais n'en
 * accepterait plus un second.
 */
function newPage(): Page {
  const fresh = Object.create(window) as Page
  Object.defineProperty(fresh, 'top', { value: fresh })
  return fresh
}

let page: Page = newPage()

function withNative(): NativeChannel {
  const channel = new NativeChannel()
  Object.defineProperty(page, 'repasHost', { value: channel, configurable: true, writable: true })
  return channel
}

/** Évalue `injection.js` avec un « agent » donné (un texte JavaScript) dans la page de l'essai ; `debug` comme dans l'APK de débogage. */
function inject(agent: string, debug = false): void {
  new Function(
    'window',
    INJECTION.replace(DEBUG_MARKER, String(debug)).replace('/*__AGENT__*/', () => agent),
  )(page)
}

/** Injecte `injection.js` et lance le vrai `run` de l'agent (avec ses doubles) au moment où l'agent démarre, comme le fait `agent.js`. */
function injectRun(start: () => void, debug = false): void {
  page.__start = start
  inject('window.__start()', debug)
}

/** Le pont que l'« agent » de l'essai a lu en démarrant : la page, elle, ne l'a plus ensuite. */
const bridgeOf = (): PageBridge => page.__bridge as PageBridge

const COUNTER = 'window.__starts = (window.__starts || 0) + 1; window.__bridge = window.repasHost'
const starts = () => page.__starts ?? 0

// Le diagnostic lance une vraie recherche (chemin relatif, à l'hôte de la page) : aucun réseau dans ces tests.
let fetchSpy = vi.fn<typeof fetch>()

/** Fait avancer l'horloge simulée par pas de 250 ms jusqu'à ce que `until` soit vrai (la cadence du site, 800 ms, passe par là). */
async function advance(until: () => boolean): Promise<void> {
  for (let i = 0; i < 600 && !until(); i += 1) await vi.advanceTimersByTimeAsync(250)
}

/** Laisse l'agent aller au bout de ce qu'il a entrepris : plus aucune requête pendant 10 s d'horloge simulée (douze fois la cadence du site). */
async function untilQuiet(requests: () => number): Promise<void> {
  let seen = requests()
  let quiet = 0
  for (let i = 0; i < 2_400 && quiet < 10_000; i += 1) {
    await vi.advanceTimersByTimeAsync(250)
    const now = requests()
    quiet = now === seen ? quiet + 250 : 0
    seen = now
  }
  expect(quiet, 'l’agent a fini ses requêtes').toBeGreaterThanOrEqual(10_000)
}

// Chaque test est isolé : horloge simulée, faux `fetch` et page neufs, et rien de ce qu'il a mis en route ne lui survit. Un diagnostic ou un
// passage laissé en vie par un test (une recherche attend la cadence du site) retomberait sinon dans le faux `fetch` du test suivant : 27
// requêtes au lieu de 25 quand la machine est chargée. À la fin du test, ce qui attend l'horloge est jeté : l'agent resté en suspens ne reprend jamais.
beforeEach(() => {
  page = newPage()
  vi.useFakeTimers()
  fetchSpy = vi.fn<typeof fetch>().mockRejectedValue(new Error('pas de réseau dans les tests'))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(async () => {
  await vi.advanceTimersByTimeAsync(0)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
  document.documentElement.innerHTML = '<head></head><body><a href="/deconnexion">Se déconnecter</a></body>'
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

  it('ne donne pas le canal natif à l’agent : il reçoit un pont qui n’est pas l’objet natif', () => {
    const channel = withNative()

    inject(COUNTER)

    expect(bridgeOf()).not.toBe(channel)
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

describe('le pont une fois l’agent démarré', () => {
  const descriptor = () => Object.getOwnPropertyDescriptor(page, 'repasHost')

  it('n’est plus à la page : repasHost est vide et ne peut plus être redéfini ni supprimé', () => {
    const channel = withNative()

    inject(COUNTER)

    expect(page.repasHost).toBeUndefined()
    expect(descriptor()).toMatchObject({ value: undefined, configurable: false, writable: false })
    expect(Reflect.defineProperty(page, 'repasHost', { value: channel })).toBe(false)
    expect(Reflect.deleteProperty(page, 'repasHost')).toBe(false)
    expect(page.repasHost).toBeUndefined()
  })

  it('reste à l’agent : le pont lu au démarrage reçoit les messages de l’application et lui répond', () => {
    const channel = withNative()
    const received: unknown[] = []
    injectRun(() => {
      const bridge = page.repasHost as unknown as PageBridge
      bridge.addEventListener('message', (event) => received.push(event.data))
      bridge.postMessage('{"v":1,"type":"result"}')
    })

    channel.fromApp('{"v":1,"type":"plan"}')

    expect(received).toEqual(['{"v":1,"type":"plan"}'])
    expect(channel.postMessage.mock.calls.map(([text]) => text)).toEqual([
      HELLO,
      '{"v":1,"type":"result"}',
    ])
  })

  it('ne laisse à un script de la page ni les messages de l’application, ni l’envoi d’un message', () => {
    const channel = withNative()
    const received: unknown[] = []
    inject(COUNTER)

    // Un script de la page, exécuté après le démarrage de l'agent
    const reach = new Function(
      'window',
      'received',
      `const host = window.repasHost
       if (host) { host.addEventListener('message', (event) => received.push(event.data)); host.postMessage('{"v":1,"type":"result"}') }`,
    )
    reach(page, received)
    channel.fromApp('{"v":1,"type":"plan"}')

    expect(received).toEqual([])
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO)
  })

  it('est retiré aussi quand l’agent échoue en démarrant', () => {
    withNative()

    expect(() => inject('throw new Error("démarrage en échec")')).toThrow('démarrage en échec')

    expect(page.repasHost).toBeUndefined()
    expect(descriptor()).toMatchObject({ configurable: false })
  })

  it('n’appelle aucune méthode de tableau pour relayer un message : une page qui en remplace une ne le voit pas', () => {
    const channel = withNative()
    const received: unknown[] = []
    injectRun(() => {
      ;(page.repasHost as unknown as PageBridge).addEventListener('message', (event) => received.push(event.data))
    })
    const seen: unknown[] = []
    const names = ['forEach', 'slice', 'push', 'splice', 'indexOf', 'concat', 'map', 'filter'] as const
    const originals = names.map((name) => Object.getOwnPropertyDescriptor(Array.prototype, name))
    const listen = Array.prototype.indexOf
    try {
      for (const name of names) {
        const original = Array.prototype[name] as (...args: unknown[]) => unknown
        Object.defineProperty(Array.prototype, name, {
          configurable: true,
          writable: true,
          value: function (this: unknown[], ...args: unknown[]) {
            if (Reflect.apply(listen, this, ['{"v":1,"type":"plan"}']) >= 0) seen.push(name)
            return Reflect.apply(original, this, args)
          },
        })
      }

      channel.fromApp('{"v":1,"type":"plan"}')
    } finally {
      names.forEach((name, i) => {
        const original = originals[i]
        if (original) Object.defineProperty(Array.prototype, name, original)
      })
    }

    expect(received).toEqual(['{"v":1,"type":"plan"}'])
    expect(seen).toEqual([])
  })
})

describe('le mode débogage (DRV-318)', () => {
  it('le fichier porte le marqueur du mode débogage une seule fois, à `false` tel quel', () => {
    expect(INJECTION.split(DEBUG_MARKER)).toHaveLength(2)
  })

  it('la variante de débogage annonce debug: true et pose isDebug sur le pont, que la page ne peut plus changer', () => {
    const channel = withNative()

    inject(COUNTER, true)

    const bridge = bridgeOf() as PageBridge & { isDebug?: boolean }
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO_DEBUG)
    expect(bridge.isDebug).toBe(true)
    expect(Object.isFrozen(bridge)).toBe(true)
    expect(() => {
      'use strict'
      bridge.isDebug = false
    }).toThrow(TypeError)
    expect(bridge.isDebug).toBe(true)
  })

  it('toute autre variante annonce le message d’accueil habituel et ne pose pas isDebug', () => {
    const channel = withNative()

    inject(COUNTER, false)

    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO)
    expect('isDebug' in bridgeOf()).toBe(false)
  })
})

describe('le démarrage de l’agent', () => {
  it('n’a pas lieu sans canal natif : pas d’agent, pas de pont', () => {
    inject(COUNTER)

    expect(starts()).toBe(0)
    expect('repasHost' in page).toBe(false)
  })

  it('n’a pas lieu si repasHost n’est pas un canal de messages', () => {
    Object.defineProperty(page, 'repasHost', {
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
    const screens = fakeUi()
    injectRun(() => run(page, { flow: { ui: screens.ui } }))

    // When : l'application envoie un plan
    channel.fromApp(JSON.stringify(plan([home('sel'), skip('huile')])))

    // Then
    await advance(() => channel.postMessage.mock.calls.length >= 2)
    expect(channel.postMessage).toHaveBeenCalledTimes(2)
    expect(channel.postMessage.mock.calls[0]?.[0]).toBe(HELLO)
    const result = validateResult(
      JSON.parse(channel.postMessage.mock.calls[1]?.[0] ?? ''),
    ) as ResultMessage
    expect(result).toMatchObject({ type: 'result', outcome: 'completed' })
    expect(screens.screens()).toEqual(['progress'])
  })

  it('la commande de diagnostic de l’application ouvre le diagnostic, sans rien renvoyer', async () => {
    const channel = withNative()
    const diagnostic = fakeUi({
      diagnostic: (props) =>
        new Promise<'close'>((resolve) => {
          props.start({ update: () => undefined, finish: () => resolve('close') })
          setTimeout(() => resolve('close'), 0)
        }),
    })
    injectRun(() => run(page, { flow: { ui: diagnostic.ui } }))

    channel.fromApp('{"v":1,"type":"command","command":"diagnostic"}')

    await advance(() => diagnostic.closed.count >= 1)
    expect(diagnostic.closed.count).toBe(1)
    expect(diagnostic.screens()).toEqual(['diagnostic'])
    // Le diagnostic va au bout de ses contrôles dans ce test, il n'en laisse rien au suivant.
    await untilQuiet(() => fetchSpy.mock.calls.length)
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO)
  })
})

describe('le fichier agent.js réel, tel que l’application l’injecte', () => {
  it('démarre en silence, puis ouvre le diagnostic sur la commande de l’application', async () => {
    // Given : l'agent construit par make agent-build, derrière le pont de l'injection
    const { buildAgent } = await import('../../drive-agent/scripts/build.mjs')
    const built = await buildAgent()
    const channel = withNative()
    document.body.innerHTML = '<p>Page du drive (simulée)</p><a href="/deconnexion">Se déconnecter</a>'
    const before = document.documentElement.outerHTML

    // When : il démarre sans rien recevoir
    inject(built.code)

    // Then : la page n'a pas bougé, seule l'annonce est partie
    expect(document.documentElement.outerHTML).toBe(before)
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO)

    // When : l'application demande le diagnostic
    channel.fromApp('{"v":1,"type":"command","command":"diagnostic"}')

    // Then : l'interface de l'agent s'est posée dans la page, et rien n'est parti vers l'application
    await advance(() => document.documentElement.outerHTML !== before)
    expect(document.documentElement.outerHTML).not.toBe(before)
    expect(channel.postMessage).toHaveBeenCalledTimes(1)
    // Le diagnostic va au bout de ses contrôles dans ce test (il ne laisse rien au suivant) : les seules requêtes tentées visent l'hôte
    // de la page (chemins relatifs).
    await untilQuiet(() => fetchSpy.mock.calls.length)
    expect(fetchSpy).toHaveBeenCalled()
    expect(fetchSpy.mock.calls.every(([url]) => String(url).startsWith('/'))).toBe(true)
    expect(channel.postMessage).toHaveBeenCalledTimes(1)
  }, 30_000)
})

// Une page qui remplace `JSON`, l'encodeur de texte, `fetch` ou `attachShadow` APRÈS le démarrage de l'agent : l'agent a pris les siens en
// démarrant (drive-agent/src/primitives.ts), la page n'est appelée ni avec les messages de l'application, ni avec les requêtes de l'agent, ni
// avec son interface.
describe('les primitives du navigateur que la page remplace après le démarrage de l’agent', () => {
  /** Remplace `target[name]` par une fonction qui note ses appels puis appelle l'ancienne ; rend de quoi défaire. */
  function spyOnPage(target: object, name: string, calls: unknown[][]): () => void {
    const original = Object.getOwnPropertyDescriptor(target, name)
    const previous = Reflect.get(target, name) as (...args: unknown[]) => unknown
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value: function (this: unknown, ...args: unknown[]) {
        calls.push(args)
        return Reflect.apply(previous, this, args)
      },
    })
    return () => {
      if (original) Object.defineProperty(target, name, original)
    }
  }

  it('le diagnostic lit la commande, interroge le site et monte son interface sans rien montrer à la page', async () => {
    // Given : l'agent construit, démarré derrière le pont de l'injection
    const { buildAgent } = await import('../../drive-agent/scripts/build.mjs')
    const built = await buildAgent()
    const channel = withNative()
    inject(built.code)
    const before = document.documentElement.outerHTML

    // When : la page remplace les primitives, puis l'application demande le diagnostic
    const parsed: unknown[][] = []
    const stringified: unknown[][] = []
    const shadows: unknown[][] = []
    const requests: unknown[][] = []
    let encoders = 0
    class ReplacementEncoder extends TextEncoder {
      constructor() {
        super()
        encoders += 1
      }
    }
    const undo = [
      spyOnPage(JSON, 'parse', parsed),
      spyOnPage(JSON, 'stringify', stringified),
      spyOnPage(Element.prototype, 'attachShadow', shadows),
    ]
    vi.stubGlobal('TextEncoder', ReplacementEncoder)
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((...args) => {
        requests.push(args)
        return Promise.reject(new Error('pas de réseau dans les tests'))
      }),
    )
    try {
      channel.fromApp('{"v":1,"type":"command","command":"diagnostic"}')
      await advance(() => document.documentElement.outerHTML !== before)
      await untilQuiet(() => fetchSpy.mock.calls.length)
    } finally {
      for (const restore of undo) restore()
    }

    // Then : l'interface est montée (fermée), le diagnostic a interrogé le site par le fetch d'origine, la page n'a rien reçu
    expect(document.documentElement.outerHTML).not.toBe(before)
    expect((document.documentElement.lastElementChild as HTMLElement).shadowRoot).toBeNull()
    expect(fetchSpy).toHaveBeenCalled()
    expect(requests).toEqual([])
    expect(shadows).toEqual([])
    expect(encoders).toBe(0)
    expect(parsed.filter(([text]) => String(text).includes('"v":1'))).toEqual([])
    expect(stringified).toEqual([])
  }, 30_000)
})

// Le test automatique de la variante de débogage (DRV-318), de bout en bout : le vrai fichier agent.js derrière le pont de l'injection, le
// vrai adaptateur, un faux site Leclerc (rayons inventés, panier en mémoire) à la place du réseau, et une fausse horloge pour la cadence.
describe('le test automatique, de bout en bout avec l’agent construit et un faux site', () => {
  const COMMAND = JSON.stringify({ v: 1, type: 'command', command: 'selftest' })

  interface Hit {
    method: string
    url: string
    at: number
    body?: { quantity: number; id: string }
  }

  /** Un faux drive : trois produits par mot du lot (identifiants inventés), un panier en mémoire, les réponses au format du site. */
  function fakeDrive(initial: Record<string, number> = {}) {
    const words: string[] = [...LOT_WORDS]
    const cart = new Map(Object.entries(initial))
    const hits: Hit[] = []
    const items = () => [...cart.values()].reduce((sum, quantity) => sum + quantity, 0)
    const euros = () => `${(items() * 1.29).toFixed(2).replace('.', ',')} €`
    const reply = (body: string) =>
      ({ status: 200, url: '', redirected: false, text: () => Promise.resolve(body) }) as Response

    const search = (word: string) => {
      const index = words.indexOf(word)
      const products =
        index < 0
          ? []
          : [0, 1, 2].map((rank) => {
              const id = String(5_000_000 + index * 10 + rank)
              return {
                iIdProduit: Number(id),
                sLibelleLigne1: `${word} de test ${rank + 1}`,
                sLibelleLigne2: '1 kg',
                nrPVUnitaireTTC: 1.29,
                sPrixUnitaire: '1,29 €',
                nrPVParUniteDeMesureTTC: 1.29,
                sPrixParUniteDeMesure: '1,29 € / kg',
                iQteDisponible: 12,
                iQuantitePanier: cart.get(id) ?? 0,
              }
            })
      return reply(
        `<html><body><p>Résultats</p><script>var widgets = ${JSON.stringify({
          widgets: [{ nom: 'produits', lstProduits: products }],
          sTotalAPayer: euros(),
        })}</script></body></html>`,
      )
    }

    const write = (body: string) => {
      const sent = JSON.parse(String(new URLSearchParams(body).get('d'))) as {
        iIdProduit: string
        iQuantite: number
      }
      if (sent.iQuantite > 0) cart.set(sent.iIdProduit, sent.iQuantite)
      else cart.delete(sent.iIdProduit)
      hits.at(-1)!.body = { id: sent.iIdProduit, quantity: sent.iQuantite }
      return reply(
        JSON.stringify([
          { eTypeEvenement: 101, sIdUnique: `Produit${sent.iIdProduit}` },
          {
            eTypeEvenement: 1,
            sIdUnique: 'Panier123456',
            iQuantitePanier: items(),
            sTotalAPayer: euros(),
            lstProduitsLight: [...cart].map(([id, quantity]) => ({
              iIdProduit: Number(id),
              iQtePanier: quantity,
              iQteDisponible: 12,
            })),
          },
        ]),
      )
    }

    const fetchStub = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      hits.push({ method: init?.method ?? 'GET', url, at: Date.now() })
      if (init?.method === 'POST') return write(String(init.body))
      const word = decodeURIComponent(url.split('TexteRecherche=')[1] ?? '')
      return search(word)
    })
    return { cart, hits, fetchStub }
  }

  it('joue les 28 requêtes à la cadence du site, rapporte OK, et laisse le panier vide', async () => {
    // Given : la variante de débogage de l'application, avec l'agent construit
    const { buildAgent } = await import('../../drive-agent/scripts/build.mjs')
    const built = await buildAgent()
    const drive = fakeDrive()
    vi.stubGlobal('fetch', drive.fetchStub)
    const channel = withNative()
    inject(built.code, true)

    // When : l'application lance le test
    channel.fromApp(COMMAND)
    await advance(() => channel.postMessage.mock.calls.length >= 2)

    // Then : un seul rapport est parti, conforme au protocole
    expect(channel.postMessage).toHaveBeenCalledTimes(2)
    expect(channel.postMessage.mock.calls[0]?.[0]).toBe(HELLO_DEBUG)
    const message = validateSelftestResult(JSON.parse(channel.postMessage.mock.calls[1]?.[0] ?? ''))
    expect(message.ok).toBe(true)
    expect(message.report).toContain('Verdict : OK')
    expect(message.report).toContain('Lot de 12 recherches')

    // Then : 1 + 1 (mot absurde des sondes) + 3 (produits frais, DRV-646) + 12 recherches, 3 recherches d'essai, 8 écritures (1, 3, 2, 1, 1 puis trois retraits)
    expect(drive.hits).toHaveLength(28)
    expect(drive.hits.filter((hit) => hit.method === 'GET')).toHaveLength(20)
    expect(drive.hits.flatMap((hit) => (hit.body ? [hit.body.quantity] : []))).toEqual([
      1, 3, 2, 1, 1, 0, 0, 0,
    ])
    expect(drive.cart.size).toBe(0)

    // Then : la cadence est respectée (800 ms au moins entre deux requêtes) et toutes visent l'hôte de la page
    const gaps = drive.hits.slice(1).map((hit, i) => hit.at - (drive.hits[i]?.at ?? 0))
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(800)
    expect(drive.hits.every((hit) => hit.url.startsWith('/'))).toBe(true)

    // Then : aucune donnée personnelle dans le rapport
    expect(message.report).toContain('Hôte : fd0')
    expect(message.report).toContain('Magasin : …123')
    expect(message.report).not.toMatch(/leclercdrive|Ville-Test|https?:|@|\d{6,}/i)
    // (Le mot « cookie » ne figure que dans la phrase de confidentialité et dans la ligne qui COMPTE les cookies lisibles par la page, ticket B : un nombre et un oui/non.)
    expect(
      message.report
        .replace(/Ce rapport ne contient ni cookie[^\n]*/, '')
        .replace(
          / - Cookies lisibles par la page : \d+ ; cookie de protection anti-robot : (oui|non)[^\n]*/,
          '',
        ),
    ).not.toMatch(/cookie/i)
  }, 60_000)

  it('rend le panier de l’utilisateur tel qu’il était, produits déjà présents compris', async () => {
    const { buildAgent } = await import('../../drive-agent/scripts/build.mjs')
    const built = await buildAgent()
    // Le premier produit du premier rayon (5000000) est déjà au panier de l'utilisateur, deux fois.
    const drive = fakeDrive({ '5000000': 2 })
    vi.stubGlobal('fetch', drive.fetchStub)
    const channel = withNative()
    inject(built.code, true)

    channel.fromApp(COMMAND)
    await advance(() => channel.postMessage.mock.calls.length >= 2)

    const message = validateSelftestResult(JSON.parse(channel.postMessage.mock.calls[1]?.[0] ?? ''))
    expect(message.ok).toBe(true)
    expect([...drive.cart]).toEqual([['5000000', 2]])
    expect(drive.hits.some((hit) => hit.body?.id === '5000000')).toBe(false)
  }, 60_000)

  it('est refusée par une application qui n’est pas la variante de débogage : aucune requête, aucun rapport', async () => {
    const { buildAgent } = await import('../../drive-agent/scripts/build.mjs')
    const built = await buildAgent()
    const drive = fakeDrive()
    vi.stubGlobal('fetch', drive.fetchStub)
    const channel = withNative()
    inject(built.code, false)

    channel.fromApp(COMMAND)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(drive.hits).toEqual([])
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(HELLO)
  }, 30_000)
})
