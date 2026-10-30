// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Auchan dans le registre de l'agent (DRV-727) : la page est celle du site d'Auchan. Un plan de Leclerc y est refusé (`STORE_MISMATCH`) sans une
// requête ; un plan d'Auchan arrive jusqu'à l'adaptateur, qui est VIDE (DRV-717 l'écrit) : il s'arrête au premier regard sur la page, sans une
// requête non plus, avec `CONTRACT_CHANGED` de cause `ADAPTER_NOT_WRITTEN`. Tout est inventé : aucun contact avec un site d'enseigne.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateResult } from '../protocol'
import { run } from '../src/agent'
import { AuchanAdapter } from '../src/auchan'
import { RetailerError } from '../src/retailers'
import { fakeUi, home, plan } from './flow-helpers'
import { validExamples } from './protocol-examples'

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

const auchanPlan = () => validExamples('plan').find(({ name }) => name === 'plan-auchan')?.message

afterEach(() => {
  Reflect.deleteProperty(window, 'repasHost')
})

describe('la page est celle d’Auchan', () => {
  it('refuse un plan de Leclerc : STORE_MISMATCH, sans lire le magasin ni envoyer une requête', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(plan([home('sel')]))

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')).toEqual([{ code: 'STORE_MISMATCH', canReturn: true }])
    expect(validateResult(JSON.parse(app.postMessage.mock.calls[0]?.[0] ?? ''))).toMatchObject({
      outcome: 'error',
      error: { code: 'STORE_MISMATCH' },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuse aussi un setup de Leclerc', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
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

  it('accepte un plan d’Auchan, que l’adaptateur vide arrête : CONTRACT_CHANGED (adaptateur non écrit), sans une requête', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })

    app.send(auchanPlan())

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    const result = validateResult(JSON.parse(app.postMessage.mock.calls[0]?.[0] ?? ''))
    expect(result).toMatchObject({ outcome: 'error', error: { code: 'CONTRACT_CHANGED' } })
    expect(JSON.stringify(result)).toContain('ADAPTER_NOT_WRITTEN')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('l’adaptateur vide d’Auchan', () => {
  /** Les méthodes de l'interface `RetailerAdapter` : l'adaptateur vide les a toutes, et n'a rien de plus. */
  const METHODS = [
    'aisleChoices',
    'aisleSamples',
    'cartQuantity',
    'describeLastReply',
    'describeProductLists',
    'exploreFacets',
    'exploreSearchVariants',
    'followEntry',
    'lastSearchFacts',
    'pageCartTotal',
    'readAisleMenu',
    'readArrival',
    'readEntry',
    'readProductFromSearch',
    'readSession',
    'readStore',
    'searchFiltered',
    'searchProducts',
    'setCartQuantity',
    'siteAisles',
    'stats',
    'validateSiteFilter',
  ]

  it('n’a que les méthodes de l’interface', () => {
    const own = Object.getOwnPropertyNames(AuchanAdapter.prototype).filter(
      (name) => name !== 'constructor',
    )

    expect(own.sort()).toEqual(METHODS)
  })

  it.each(METHODS)('%s lève CONTRACT_CHANGED, cause « adaptateur non écrit »', async (method) => {
    const adapter = new AuchanAdapter() as unknown as Record<string, () => unknown>
    const call = async () => {
      await adapter[method]?.()
    }

    await expect(call()).rejects.toMatchObject({
      name: 'RetailerError',
      code: 'CONTRACT_CHANGED',
      cause: 'ADAPTER_NOT_WRITTEN',
    })
    await expect(call()).rejects.toBeInstanceOf(RetailerError)
  })
})
