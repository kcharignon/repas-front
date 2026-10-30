// @vitest-environment node
// Ticket L de l'audit du 2026-10-18 (H12) : le résultat d'un passage dit combien de requêtes sont parties, combien ont échoué et combien ont été
// refusées par l'anti-robot (des nombres), cumulés sur tout le passage, même repris après un rechargement. L'interface, l'adaptateur et le stockage
// sont simulés : aucun réseau.
import { describe, expect, it, vi } from 'vitest'

import { LeclercAdapter, MAX_PAUSE_MS, type RequestStats } from '../src/leclerc'
import { RetailerError } from '../src/retailers'
import { RUN_PREFIX } from '../src/flow'
import {
  RUN_ID,
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  home,
  known,
  makeFlow,
  plan,
  product,
} from './flow-helpers'
import { fakeSite, fixture } from './leclerc-helpers'

const SHELF = { '1000001': {}, '1000003': {}, '1000009': {} }
const lines = () => [
  known('farine', [product('1000001', 3)]),
  known('sucre', [product('1000003', 1)]),
  known('sel', [product('1000009', 2)]),
]
const stats = (patch: Partial<RequestStats> = {}): RequestStats => ({
  requests: 0,
  errors: 0,
  blocks: 0,
  timeouts: 0,
  slow: 0,
  peakPauseMs: 0,
  ...patch,
})

describe('les compteurs du résultat', () => {
  it('disent les requêtes parties pendant le passage : une recherche et une écriture par ligne', async () => {
    // Given : trois lignes connues
    const site = fakeAdapter(SHELF)
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: site.adapter })

    // When
    await flow.start(plan(lines()))

    // Then
    expect(expectConform(sent[0])).toMatchObject({ stats: { requests: 6, errors: 0, blocks: 0 } })
  })

  it('ne comptent que le passage : ce que l’adaptateur avait fait avant (un diagnostic, par exemple) n’y est pas', async () => {
    const site = fakeAdapter(SHELF, {
      stats: () => stats({ requests: site.calls.length + 10, errors: 3, blocks: 1 }),
    })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: site.adapter })

    await flow.start(plan(lines()))

    expect(sent[0]?.stats).toEqual({ requests: 6, errors: 0, blocks: 0 })
  })

  it('reprennent les erreurs et les blocages que l’adaptateur a comptés', async () => {
    let errors = 0
    let blocks = 0
    const site = fakeAdapter(SHELF, {
      before: (call) => {
        if (call === 'search 1000003') {
          errors += 1
          blocks += 1
        }
      },
      stats: () => stats({ requests: site.calls.length, errors, blocks }),
    })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: site.adapter })

    await flow.start(plan(lines()))

    expect(sent[0]?.stats).toEqual({ requests: 6, errors: 1, blocks: 1 })
  })

  it('manquent quand aucune requête n’est partie : lignes sans action', async () => {
    const quiet = makeFlow({ ui: fakeUi().ui, adapter: fakeAdapter().adapter })
    await quiet.flow.start(plan([home('sel')]))

    expect(quiet.sent[0]).not.toHaveProperty('stats')
  })

  it('accompagnent aussi un passage arrêté par un blocage : « partial », avec ce qui est parti avant', async () => {
    const site = fakeAdapter(SHELF, {
      before: (call) => {
        if (call === 'search 1000003') throw new RetailerError('BLOCKED', 429)
      },
    })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: site.adapter })

    await flow.start(plan(lines()))

    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'partial',
      stats: { requests: 3, errors: 0, blocks: 0 },
    })
  })
})

describe('les compteurs d’un passage repris après un rechargement', () => {
  it('s’ajoutent à ceux de la page d’avant : le résultat dit le passage entier', async () => {
    // Given : un premier passage interrompu (la page se recharge) après la première ligne : 2 requêtes
    const storage = fakeStorage()
    const first = fakeAdapter(SHELF, {
      before: (call) =>
        call === 'search 1000003' ? new Promise<void>(() => undefined) : undefined,
    })
    void makeFlow({ ui: fakeUi().ui, adapter: first.adapter, storage }).flow.start(plan(lines()))
    await vi.waitFor(() => expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toContain('"stats"'))

    // When : la page rechargée (un agent neuf, des compteurs neufs) reprend et fait les deux autres lignes : 4 requêtes
    const second = fakeAdapter(SHELF)
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: second.adapter, storage })
    await flow.start(plan(lines()))

    // Then : 2 + 4
    expect(second.calls).toHaveLength(4)
    expect(expectConform(sent[0]).stats).toEqual({ requests: 6, errors: 0, blocks: 0 })
  })

  /** Un état de reprise d'un passage dont « sel » est fait ; `extra` y ajoute ce que le test veut éprouver. */
  const storedState = (extra: Record<string, unknown> = {}) =>
    fakeStorage({
      [`${RUN_PREFIX}${RUN_ID}`]: JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_A',
        done: { sel: { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' } },
        waiting: {},
        ...extra,
      }),
    })

  it('un état d’avant, sans « stats », se reprend comme avant : on compte à partir de la reprise', async () => {
    const site = fakeAdapter(SHELF)
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: site.adapter,
      storage: storedState(),
    })

    await flow.start(plan([home('sel'), known('farine', [product('1000001', 3)])]))

    expect(screens.propsOf('resume')).toEqual([{ done: 1, total: 2 }])
    expect(sent[0]?.stats).toEqual({ requests: 2, errors: 0, blocks: 0 })
  })

  it.each([
    ['pas un objet', 'beaucoup'],
    ['un compteur manquant', { requests: 1, errors: 0 }],
    ['un compteur négatif', { requests: -1, errors: 0, blocks: 0 }],
    ['un compteur fractionnaire', { requests: 1.5, errors: 0, blocks: 0 }],
    ['un compteur au-delà de la borne', { requests: 100001, errors: 0, blocks: 0 }],
  ])('ignore un état dont les compteurs sont mal formés (%s)', async (_name, bad) => {
    const screens = fakeUi()
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: fakeAdapter().adapter,
      storage: storedState({ stats: bad }),
    })

    await flow.start(plan([home('sel')]))

    expect(screens.screens()[0]).toBe('progress')
  })
})

describe('un passage de 200 requêtes de bout en bout (ticket L)', () => {
  /** Cent lignes connues : une recherche et une écriture chacune, donc 200 requêtes, sur la vraie page de recherche (fixture) et le vrai adaptateur. */
  const hundred = () =>
    plan(
      Array.from({ length: 100 }, (_unused, index) =>
        known(`ingredient-${String(index).padStart(3, '0')}`, [product('1000001', 1)]),
      ),
    )

  it('reste sous le plafond d’arrêt quand le site refuse un peu, de loin en loin : jamais deux refus de suite, aucune ligne perdue, la pause reste sous 3 s', async () => {
    // Given : un 429 toutes les neuf requêtes, chacun suivi d'une réponse
    const site = fakeSite((call, index) =>
      index % 9 === 4
        ? { status: 429, body: 'trop de requêtes' }
        : call.init.method === 'POST'
          ? { body: fixture('panier-ajout.json') }
          : { body: fixture('recherche-farine.html') },
    )
    const adapter = new LeclercAdapter(site.deps)
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    // When
    await flow.start(hundred())

    // Then : tout est fait, le passage n'est jamais arrêté
    const result = expectConform(sent[0])
    expect(result.outcome).toBe('completed')
    expect(result.lines.filter((line) => line.outcome === 'ADDED')).toHaveLength(100)
    expect(result.error).toBeUndefined()
    const counted = adapter.stats()
    expect(counted.requests).toBe(site.calls.length)
    expect(counted.requests).toBe(200 + counted.blocks)
    expect(counted.blocks).toBeGreaterThanOrEqual(20)
    expect(counted.peakPauseMs).toBeLessThanOrEqual(MAX_PAUSE_MS)
    expect(site.maxInFlight()).toBe(1)
    // Et le résultat les dit, ces mêmes nombres
    expect(result.stats).toEqual({ requests: counted.requests, errors: 0, blocks: counted.blocks })
  })

  it('s’arrête dès que deux refus se suivent : BLOCKED, les lignes restantes en échec, et plus aucune requête', async () => {
    const site = fakeSite((call, index) =>
      index === 60 || index === 61
        ? { status: 429, body: 'trop de requêtes' }
        : call.init.method === 'POST'
          ? { body: fixture('panier-ajout.json') }
          : { body: fixture('recherche-farine.html') },
    )
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: new LeclercAdapter(site.deps) })

    await flow.start(hundred())

    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'partial',
      error: { code: 'BLOCKED' },
      stats: { requests: 62, errors: 0, blocks: 2 },
    })
    expect(site.calls).toHaveLength(62)
  })
})
