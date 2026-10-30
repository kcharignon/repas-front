// Les primitives du navigateur que l'agent prend au démarrage (`src/primitives.ts`) : une fois prises, une page qui remplace `JSON`, l'encodeur
// de texte, `fetch` ou `attachShadow` ne voit rien passer de ce que l'agent traite avec elles.
import { LECLERC } from './retailer-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createUi } from '../src/ui'
import { bridgeTransport } from '../src/transport/bridge'
import { browserDeps } from '../src/leclerc'
import { byteLength, parseJson, stringifyJson, takeWindowPrimitives } from '../src/primitives'

type Replaced = { name: string; calls: unknown[][] }

/** Remplace une propriété d'un objet par une fonction qui note ses appels puis appelle l'ancienne ; rend ce qu'il faut pour défaire. */
function replace(target: object, name: string, log: Replaced): () => void {
  const original = Object.getOwnPropertyDescriptor(target, name)
  const previous = (target as Record<string, (...args: unknown[]) => unknown>)[name]
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value: function (this: unknown, ...args: unknown[]) {
      log.calls.push(args)
      return Reflect.apply(previous as (...args: unknown[]) => unknown, this, args)
    },
  })
  return () => {
    if (original) Object.defineProperty(target, name, original)
    else Reflect.deleteProperty(target, name)
  }
}

const restore: (() => void)[] = []

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response('ok'))),
  )
})

afterEach(() => {
  while (restore.length > 0) restore.pop()?.()
  vi.unstubAllGlobals()
  document.documentElement.innerHTML = '<head></head><body></body>'
})

describe('JSON et l’encodeur de texte', () => {
  it('lisent, écrivent et comptent les octets comme le navigateur', () => {
    expect(parseJson('{"a":[1,"é"]}')).toEqual({ a: [1, 'é'] })
    expect(() => parseJson('{')).toThrow(SyntaxError)
    expect(stringifyJson({ a: [1, 'é'] })).toBe('{"a":[1,"é"]}')
    expect(byteLength('abc')).toBe(3)
    expect(byteLength('é')).toBe(2)
    expect(byteLength('€')).toBe(3)
    expect(byteLength('😀')).toBe(4)
  })

  it('ne passent plus par JSON ni par TextEncoder quand la page les a remplacés', () => {
    // Given : une page qui remplace JSON.parse, JSON.stringify et TextEncoder après le chargement de l'agent
    const parse: Replaced = { name: 'parse', calls: [] }
    const stringify: Replaced = { name: 'stringify', calls: [] }
    restore.push(replace(JSON, 'parse', parse), replace(JSON, 'stringify', stringify))
    const encoded: unknown[] = []
    class ReplacementEncoder {
      encode(text: string): Uint8Array {
        encoded.push(text)
        return new Uint8Array(0)
      }
    }
    vi.stubGlobal('TextEncoder', ReplacementEncoder)
    const sent: string[] = []
    const received: unknown[] = []
    let deliver: (event: { data: unknown }) => void = () => undefined

    // When : un message du protocole arrive par le pont, et l'agent en envoie un
    const transport = bridgeTransport({
      postMessage: (text) => sent.push(text),
      addEventListener: (_type, listener) => (deliver = listener),
    })
    transport.listen(
      (message) => received.push(message),
      () => undefined,
    )
    deliver({ data: '{"v":1,"type":"setup","secret":"liste"}' })
    transport.send({ v: 1, type: 'result', secret: 'liste' } as never)

    // Then : l'agent a lu et écrit comme avant, la page n'a rien reçu
    expect(received).toEqual([{ v: 1, type: 'setup', secret: 'liste' }])
    expect(sent).toEqual(['{"v":1,"type":"result","secret":"liste"}'])
    expect(parse.calls).toEqual([])
    expect(stringify.calls).toEqual([])
    expect(encoded).toEqual([])
  })
})

describe('fetch et attachShadow de la fenêtre', () => {
  it('appellent ceux que la fenêtre avait au moment de les prendre, avec la fenêtre pour this', async () => {
    const taken = vi.fn<typeof fetch>(function (this: unknown) {
      return Promise.resolve(new Response(this === window ? 'ici' : 'ailleurs'))
    })
    vi.stubGlobal('fetch', taken)

    const primitives = takeWindowPrimitives(window)
    const response = await primitives.fetch('/recherche', { method: 'GET' })

    expect(await response.text()).toBe('ici')
    expect(taken).toHaveBeenCalledExactlyOnceWith('/recherche', { method: 'GET' })
  })

  it('ne passent plus par ceux que la page installe ensuite', async () => {
    // Given : fetch et attachShadow pris, puis remplacés par la page
    const taken = vi.fn<typeof fetch>(() => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', taken)
    const primitives = takeWindowPrimitives(window)
    const replacementFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('pris')))
    vi.stubGlobal('fetch', replacementFetch)
    const attach: Replaced = { name: 'attachShadow', calls: [] }
    restore.push(replace(Element.prototype, 'attachShadow', attach))

    // When : l'agent fait une requête (par ses dépendances) et monte son interface (fermée)
    await browserDeps(window, primitives).fetch('/recherche?q=sel')
    const ui = createUi({ win: window, attachShadow: primitives.attachShadow, retailer: LECLERC })
    void ui.show('progress', { total: 1, done: 0, current: 'Farine', log: [] })

    // Then : la requête est partie par le fetch pris, le conteneur est monté, la page n'a rien vu
    expect(taken).toHaveBeenCalledExactlyOnceWith('/recherche?q=sel', undefined)
    expect(replacementFetch).not.toHaveBeenCalled()
    expect(ui.host).not.toBeNull()
    expect(ui.host?.shadowRoot).toBeNull()
    expect(attach.calls).toEqual([])
  })

  it('retombent sur attachShadow du conteneur quand la fenêtre n’a pas d’Element', () => {
    const fake = { fetch: () => Promise.resolve(new Response('ok')) } as unknown as Window &
      typeof globalThis
    const host = document.createElement('div')

    const primitives = takeWindowPrimitives(fake)

    expect(primitives.attachShadow(host, { mode: 'open' })).toBe(host.shadowRoot)
  })
})
