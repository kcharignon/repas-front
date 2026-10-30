// @vitest-environment-options {"url": "https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/recherche.aspx"}
// Le registre des enseignes (DRV-704) : l'agent choisit l'adaptateur d'après l'hôte de la page et refuse, sans une requête, le message d'une autre
// enseigne. Les enseignes des tests d'agent sont fictives (un registre de test à deux entrées) ; le registre réel (Leclerc, Auchan : DRV-727) a ses propres
// tests, dont le plan d'une enseigne reçu sur la page de l'autre (`STORE_MISMATCH`, sans une requête).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateResult, type ResultMessage } from '../protocol'
import { run } from '../src/agent'
import { JITTER_MS, MAX_PAUSE_MS, PAUSE_MS } from '../src/leclerc'
import { RETAILERS, retailerForHost, type RetailerEntry } from '../src/retailers'
import { fakeAdapter, fakeUi, home, plan, skip } from './flow-helpers'
import { validExamples } from './protocol-examples'

const PAGE_HOST = 'fd0-courses.leclercdrive.fr'
const PLAN = plan([home('sel'), skip('huile')])

/** Une enseigne fictive : son adaptateur est le faux adaptateur du passage, ses appels sont comptés. */
function entry(id: string, hosts: string[]) {
  const reads = { stores: 0, created: 0 }
  const adapter = fakeAdapter(
    {},
    {
      store: () => {
        reads.stores += 1
        return {
          id: '000123',
          host: PAGE_HOST,
          baseUrl: `https://${PAGE_HOST}/magasin-000123-000123`,
          label: null,
        }
      },
    },
  )
  const retailer: RetailerEntry = {
    id,
    name: id,
    nameDe: `de ${id}`,
    siteDomain: `${id}.invalid`,
    hostFamily: () => null,
    isMobileHost: () => false,
    siteMode: 'AS_IS',
    antiBot: 'UNKNOWN',
    pacing: { pauseMs: 1, jitterMs: 1, maxPauseMs: 1, measured: false },
    matchesHost: (host) => hosts.includes(host),
    createAdapter: () => {
      reads.created += 1
      return adapter.adapter
    },
  }
  return { retailer, reads, calls: adapter.calls }
}

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

afterEach(() => {
  Reflect.deleteProperty(window, 'repasHost')
})

describe('le registre', () => {
  it('contient leclerc, puis auchan (DRV-727) ; leclerc est reconnu à l’hôte des magasins et seulement à lui', () => {
    expect(RETAILERS.map((item) => item.id)).toEqual(['leclerc', 'auchan'])
    expect(retailerForHost('fd0-courses.leclercdrive.fr')?.id).toBe('leclerc')
    expect(retailerForHost('FD0-courses.LeclercDrive.fr')?.id).toBe('leclerc')
    expect(retailerForHost('courses-test.exemple.invalid')).toBeUndefined()
    expect(retailerForHost('leclercdrive.fr.exemple.invalid')).toBeUndefined()
  })

  it('reconnaît auchan à l’hôte www.auchan.fr et à lui seul, jamais à la page du mot de passe', () => {
    expect(retailerForHost('www.auchan.fr')?.id).toBe('auchan')
    expect(retailerForHost('WWW.Auchan.fr')?.id).toBe('auchan')
    for (const other of [
      'compte.auchan.fr',
      'auchan.fr',
      'cdn.auchan.fr',
      'api.auchan.fr',
      'www.auchan.fr.exemple.invalid',
      'xwww.auchan.fr',
      'www.auchan.com',
    ]) {
      expect(retailerForHost(other)).toBeUndefined()
    }
  })

  it('décrit chaque enseigne : mode du site, anti-robot, cadence de départ', () => {
    const [leclerc, auchan] = RETAILERS
    // Leclerc : le mode ordinateur, la cadence réglée sur le vrai site (celle de l’agent publié)
    expect(leclerc).toMatchObject({ siteMode: 'DESKTOP', antiBot: 'DATADOME' })
    expect(leclerc?.pacing).toEqual({
      pauseMs: PAUSE_MS,
      jitterMs: JITTER_MS,
      maxPauseMs: MAX_PAUSE_MS,
      measured: true,
    })
    // Auchan : un seul site adaptatif, DataDome, une cadence de départ prudente et NON MESURÉE (DRV-715 § 2 points 5 et 7)
    expect(auchan).toMatchObject({ siteMode: 'AS_IS', antiBot: 'DATADOME' })
    expect(auchan?.pacing).toEqual({
      pauseMs: 2_000,
      jitterMs: 1_000,
      maxPauseMs: 4_000,
      measured: false,
    })
    expect(auchan).toMatchObject({ name: 'Auchan', nameDe: 'd’Auchan', siteDomain: 'auchan.fr' })
    expect(auchan?.isMobileHost('www.auchan.fr')).toBe(false)
    expect(auchan?.hostFamily('www.auchan.fr')).toBe('www')
    expect(auchan?.hostFamily('compte.auchan.fr')).toBeNull()
  })

  it('choisit la première entrée dont l’hôte est celui de la page', () => {
    const first = entry('une', ['a.exemple.invalid'])
    const second = entry('deux', ['b.exemple.invalid'])

    expect(retailerForHost('b.exemple.invalid', [first.retailer, second.retailer])?.id).toBe('deux')
    expect(retailerForHost('c.exemple.invalid', [first.retailer, second.retailer])).toBeUndefined()
  })
})

describe('le registre réel : un plan d’Auchan sur une page de Leclerc', () => {
  it('est refusé par STORE_MISMATCH, sans lire le magasin ni envoyer une requête', async () => {
    // Given : la page est celle d’un magasin de Leclerc (l’environnement), le plan est celui d’Auchan (l’exemple du protocole)
    const fetchSpy = vi.fn<typeof fetch>()
    Object.assign(window, { fetch: fetchSpy })
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { flow: { ui: screens.ui } })
    const auchanPlan = validExamples('plan').find(({ name }) => name === 'plan-auchan')?.message

    // When
    app.send(auchanPlan)

    // Then
    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')).toEqual([{ code: 'STORE_MISMATCH', canReturn: true }])
    expect(validateResult(JSON.parse(app.postMessage.mock.calls[0]?.[0] ?? ''))).toMatchObject({
      outcome: 'error',
      error: { code: 'STORE_MISMATCH' },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('l’agent avec deux enseignes', () => {
  it('crée l’adaptateur de l’enseigne de la page et déroule le plan de cette enseigne', async () => {
    // Given : la page est un hôte de « leclerc » ; l’autre entrée est listée avant elle
    const other = entry('autre', ['autre.exemple.invalid'])
    const own = entry('leclerc', [PAGE_HOST])
    const app = bridge()
    run(window, { retailers: [other.retailer, own.retailer], flow: { ui: fakeUi().ui } })

    // When
    app.send(PLAN)

    // Then
    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    const result = validateResult(
      JSON.parse(app.postMessage.mock.calls[0]?.[0] ?? ''),
    ) as ResultMessage
    expect(result.outcome).toBe('completed')
    expect(own.reads).toEqual({ stores: expect.any(Number), created: 1 })
    expect(own.reads.stores).toBeGreaterThan(0)
    expect(other.reads.created).toBe(0)
  })

  it('refuse un plan de l’autre enseigne : STORE_MISMATCH, sans lire le magasin ni envoyer une requête', async () => {
    // Given : la page est un hôte de « autre », le plan est celui de « leclerc »
    const other = entry('autre', [PAGE_HOST])
    const own = entry('leclerc', ['leclerc.exemple.invalid'])
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { retailers: [own.retailer, other.retailer], flow: { ui: screens.ui } })

    // When
    app.send(PLAN)

    // Then
    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.propsOf('error')).toEqual([{ code: 'STORE_MISMATCH', canReturn: true }])
    expect(validateResult(JSON.parse(app.postMessage.mock.calls[0]?.[0] ?? ''))).toMatchObject({
      outcome: 'error',
      error: { code: 'STORE_MISMATCH' },
    })
    expect(other.reads.stores).toBe(0)
    expect(other.calls).toEqual([])
    expect(own.reads.created).toBe(0)
  })

  it('refuse aussi un setup de l’autre enseigne', async () => {
    const other = entry('autre', [PAGE_HOST])
    const app = bridge()
    const screens = fakeUi({ error: () => 'return' })
    run(window, { retailers: [other.retailer], flow: { ui: screens.ui } })
    const { lines: _lines, type: _type, ...head } = PLAN

    app.send({ ...head, type: 'setup' })

    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(screens.screens()).toEqual(['error'])
    expect(other.reads.stores).toBe(0)
    expect(other.calls).toEqual([])
  })

  it('une page d’un hôte inconnu reçoit l’adaptateur de la première enseigne, qui la juge lui-même', async () => {
    // Given : aucune entrée ne connaît l’hôte de la page
    const first = entry('leclerc', ['jamais.exemple.invalid'])
    const second = entry('autre', ['jamais-non-plus.exemple.invalid'])
    const app = bridge()
    run(window, { retailers: [first.retailer, second.retailer], flow: { ui: fakeUi().ui } })

    // When
    app.send(PLAN)

    // Then : pas de STORE_MISMATCH d’avance, c’est l’adaptateur (le premier) qui lit la page
    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledOnce())
    expect(first.reads.created).toBe(1)
    expect(second.reads.created).toBe(0)
    expect(first.reads.stores).toBeGreaterThan(0)
  })
})
