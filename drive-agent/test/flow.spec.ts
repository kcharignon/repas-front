// L'orchestrateur du passage (DRV-305) : toutes les transitions, avec l'adaptateur, l'interface, l'horloge, le stockage et le verrou
// d'écran simulés. Aucun réseau, aucun DOM propre : tout est injecté.
import { describe, expect, it, vi } from 'vitest'

import type { NeededQuantity } from '../protocol'
import { LeclercAdapter, LeclercError } from '../src/leclerc'
import type { PendingLine, PhaseB } from '../src/flow'
import { RUN_PREFIX } from '../src/flow'
import { fakeSite, fixture } from './leclerc-helpers'
import {
  RUN_ID,
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  fakeWakeLock,
  fresh,
  home,
  known,
  makeFlow,
  plan,
  product,
  skip,
} from './flow-helpers'

const FARINE = [product('1000001', 1), product('1000002', 2)]

describe('un passage complet', () => {
  it('met au panier les produits connus, en série, et rend leurs issues dans l’ordre du plan', async () => {
    // Given : 2 lignes connues, une « j'en ai toujours », une ignorée
    const { adapter, writes, maxInFlight, calls } = fakeAdapter({ '1000001': {}, '1000003': {} })
    const confirmed: string[][] = []
    const screens = fakeUi({
      summary: () => {
        confirmed.push([...calls])
        return 'start'
      },
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(
      plan([
        known('farine', [product('1000001', 3)]),
        home('sel'),
        skip('huile'),
        known('sucre', [product('1000003', 2)]),
      ]),
    )

    // Then
    expect(confirmed).toEqual([[]])
    expect(writes).toEqual([
      { id: '1000001', quantity: 3 },
      { id: '1000003', quantity: 2 },
    ])
    expect(maxInFlight()).toBe(1)
    const result = expectConform(sent[0])
    expect(sent).toHaveLength(1)
    expect(result).toMatchObject({
      type: 'result',
      runId: RUN_ID,
      agentVersion: '0.2.0',
      outcome: 'completed',
      store: { id: '000123' },
    })
    expect(result.lines).toEqual([
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '1000001',
        quantity: 3,
        usedRank: 1,
      },
      { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
      { ingredientSlug: 'huile', outcome: 'SKIPPED' },
      { ingredientSlug: 'sucre', outcome: 'ADDED', productId: '1000003', quantity: 2, usedRank: 1 },
    ])
    expect(flow.history).toEqual(['START', 'VALIDATED', 'CONFIRMED', 'PHASE_A', 'DONE'])
    expect(screens.screens()).toEqual(['summary', 'progress'])
    expect(screens.closed.count).toBe(1)
  })

  it('montre au récapitulatif les nombres du plan, et rien n’est envoyé avant « Commencer »', async () => {
    const { adapter, calls } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi({ summary: () => 'cancel' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(
      plan([
        known('farine', [product('1000001', 1, 'Farine de test 1 kg')]),
        fresh('poivre'),
        home('sel'),
        skip('huile'),
      ]),
    )

    expect(screens.propsOf('summary')[0]).toEqual({
      known: 1,
      new: 1,
      haveAtHome: 1,
      skipped: 1,
      lines: [
        { name: 'Farine', status: 'KNOWN', detail: 'Farine de test 1 kg' },
        { name: 'Poivre', status: 'NEW' },
        { name: 'sel', status: 'HAVE_AT_HOME' },
        { name: 'huile', status: 'SKIP' },
      ],
    })
    expect(calls).toEqual([])
    expect(sent[0]?.outcome).toBe('aborted')
  })

  it('annuler au récapitulatif rend un résultat « aborted » sans ligne, après « Retourner dans Repas »', async () => {
    const { adapter, calls } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi({ summary: () => 'cancel' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(plan([known('farine', [product('1000001')])]))

    expect(calls).toEqual([])
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'aborted', lines: [] })
    expect(screens.screens()).toEqual(['summary', 'end'])
    expect(flow.history).toEqual(['START', 'VALIDATED', 'ABORTED'])
  })

  it('journalise chaque ligne et fait avancer la progression', async () => {
    const { adapter } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(plan([known('farine', [product('1000001')]), home('sel')]))

    expect(screens.propsOf('progress')[0]).toMatchObject({ total: 2, done: 0, log: [] })
    expect(screens.updates).toEqual([
      { current: 'Farine' },
      { done: 1, entry: 'Farine : ajouté' },
      { current: 'sel' },
      { done: 2, entry: 'sel : j’en ai toujours' },
    ])
  })
})

describe('les produits de secours', () => {
  it('prend le second produit sans rien demander quand le préféré est indisponible, avec ses propres packs', async () => {
    // Given : le préféré a un stock nul
    const { adapter, writes } = fakeAdapter({
      '1000001': { stock: 0 },
      '1000002': { price: 129, perMeasure: { cents: 129, unit: 'kg' } },
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([known('farine', FARINE)]))

    // Then
    expect(writes).toEqual([{ id: '1000002', quantity: 2 }])
    expect(screens.screens()).not.toContain('quantity')
    expect(expectConform(sent[0]).lines).toEqual([
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '1000002',
        quantity: 2,
        usedRank: 2,
        unavailableIds: ['1000001'],
        price: { cents: 129, perMeasure: { cents: 129, unit: 'kg' } },
      },
    ])
    expect(sent[0]?.outcome).toBe('completed')
    expect(screens.updates).toContainEqual({
      done: 1,
      entry: 'Farine : ajouté, produit de remplacement',
    })
  })

  it('un produit introuvable dans la recherche est indisponible', async () => {
    const { adapter } = fakeAdapter({ '1000002': {} })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(plan([known('farine', FARINE)]))

    expect(sent[0]?.lines[0]).toMatchObject({
      productId: '1000002',
      usedRank: 2,
      unavailableIds: ['1000001'],
    })
  })

  it('un produit dont le stock n’est pas lu est tenté, et le panier tranche', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': { stock: null } })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(plan([known('farine', FARINE)]))

    expect(writes).toEqual([{ id: '1000001', quantity: 1 }])
    expect(sent[0]?.lines[0]).toMatchObject({ outcome: 'ADDED', usedRank: 1 })
  })

  it('un produit que le panier refuse (quantité obtenue nulle) passe au suivant', async () => {
    const { adapter, calls } = fakeAdapter({ '1000001': { obtained: () => 0 }, '1000002': {} })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(plan([known('farine', FARINE)]))

    expect(calls).toEqual(['search 1000001', 'cart 1000001 1', 'search 1000002', 'cart 1000002 2'])
    expect(sent[0]?.lines[0]).toMatchObject({ productId: '1000002', unavailableIds: ['1000001'] })
  })

  it('rend la quantité que le panier a gardée, pas celle qui était demandée', async () => {
    const { adapter } = fakeAdapter({ '1000001': { obtained: () => 2 } })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(plan([known('farine', [product('1000001', 5)])]))

    expect(sent[0]?.lines[0]).toMatchObject({ outcome: 'ADDED', quantity: 2 })
  })

  it('aucun produit disponible : la ligne attend la phase B avec ses produits indisponibles et ses refusés', async () => {
    // Given
    const { adapter } = fakeAdapter({
      '1000001': { stock: 0 },
      '1000002': { stock: 0 },
      '999000': {},
    })
    const seen: PendingLine[][] = []
    const phaseB: PhaseB = (context) => {
      seen.push([...context.pending])
      context.record({
        ingredientSlug: 'farine',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'FALLBACK',
        product: { id: '1000009', label: 'Farine choisie de test' },
      })
      return Promise.resolve('done')
    }
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter, phaseB })

    // When
    await flow.start(plan([known('farine', FARINE, [{ id: '999000', label: 'Farine refusée' }])]))

    // Then
    expect(seen).toHaveLength(1)
    expect(seen[0]?.[0]).toEqual({
      line: expect.objectContaining({
        ingredientSlug: 'farine',
        rejected: [{ id: '999000', label: 'Farine refusée' }],
      }),
      unavailable: FARINE,
    })
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'completed' })
    expect(sent[0]?.lines[0]?.outcome).toBe('CHOSEN')
    expect(flow.history).toEqual(['START', 'VALIDATED', 'CONFIRMED', 'PHASE_A', 'PHASE_B', 'DONE'])
  })

  it('sans phase B, une ligne sans produit utilisable est signalée « UNAVAILABLE » et le passage est partiel', async () => {
    const { adapter } = fakeAdapter({ '1000001': { stock: 0 }, '1000002': { stock: 0 } })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(plan([known('farine', FARINE), fresh('poivre')]))

    expect(expectConform(sent[0]).lines).toEqual([
      { ingredientSlug: 'farine', outcome: 'UNAVAILABLE', unavailableIds: ['1000001', '1000002'] },
      { ingredientSlug: 'poivre', outcome: 'UNAVAILABLE' },
    ])
    expect(sent[0]?.outcome).toBe('partial')
  })

  it('ne met jamais un produit refusé au panier, même quand tous les produits acceptés sont indisponibles', async () => {
    const { adapter, calls } = fakeAdapter({ '1000001': { stock: 0 }, '999000': {} })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(
      plan([known('farine', [product('1000001')], [{ id: '999000', label: 'Farine refusée' }])]),
    )

    expect(calls).toEqual(['search 1000001'])
    expect(sent[0]?.lines).toEqual([
      { ingredientSlug: 'farine', outcome: 'UNAVAILABLE', unavailableIds: ['1000001'] },
    ])
  })

  it('la phase B qui annule le passage rend « aborted »', async () => {
    const { adapter } = fakeAdapter()
    const { flow, sent } = makeFlow({
      ui: fakeUi().ui,
      adapter,
      phaseB: () => Promise.resolve('cancelled'),
    })

    await flow.start(plan([fresh('poivre')]))

    expect(sent[0]).toMatchObject({ outcome: 'aborted', lines: [{ outcome: 'UNAVAILABLE' }] })
  })

  it('n’appelle pas la phase B quand rien n’attend', async () => {
    const { adapter } = fakeAdapter({ '1000001': {} })
    const phaseB = vi.fn<PhaseB>()
    const { flow } = makeFlow({ ui: fakeUi().ui, adapter, phaseB })

    await flow.start(plan([known('farine', [product('1000001')])]))

    expect(phaseB).not.toHaveBeenCalled()
  })
})

describe('la quantité à vérifier', () => {
  it.each([
    ['sans packs', product('1000001', null)],
    ['avec des packs à vérifier', { ...product('1000001', 4), packsStatus: 'TO_CHECK' as const }],
  ])('demande le nombre %s, puis met ce nombre au panier', async (_name, item) => {
    // Given
    const { adapter, writes } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi({ quantity: () => 7 })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([known('farine', [item])]))

    // Then
    expect(screens.propsOf('quantity')).toEqual([
      // Le plan de ce test ne dit pas ce que la liste demande : pas de « Il te faut » (DRV-626)
      { ingredient: 'Farine', productLabel: item.label, packs: item.packs ?? null, need: null },
    ])
    expect(screens.screens()).toEqual(['summary', 'progress', 'quantity', 'progress'])
    expect(writes).toEqual([{ id: '1000001', quantity: 7 }])
    expect(sent[0]?.lines[0]).toMatchObject({ outcome: 'ADDED', quantity: 7 })
  })

  it('« Passer » ignore la ligne : rien n’est écrit', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': {} })
    const { flow, sent } = makeFlow({ ui: fakeUi({ quantity: () => null }).ui, adapter })

    await flow.start(plan([known('farine', [product('1000001', null)])]))

    expect(writes).toEqual([])
    expect(sent[0]?.lines).toEqual([{ ingredientSlug: 'farine', outcome: 'SKIPPED' }])
  })

  it('ne pose pas la question pour un produit indisponible', async () => {
    const { adapter } = fakeAdapter({ '1000001': { stock: 0 }, '1000002': {} })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(plan([known('farine', [product('1000001', null), product('1000002', 1)])]))

    expect(screens.screens()).not.toContain('quantity')
  })
})

describe('le contenu lu en direct fait foi (DRV-613)', () => {
  const KILO = { quantity: 1, unitSymbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 } as const
  const GRAMS_100 = { value: 100, unit: 'g' } as const
  const GRAMS_500 = { value: 500, unit: 'g' } as const

  /** Un kilo de farine voulu ; le plan mémorise `planned` produits (le contenu mémorisé n'y est pour rien : seul ce nombre compte). */
  const farine = (planned: number | null, needed: NeededQuantity | null = KILO) => ({
    ...known('farine', [
      { ...product('1000001', planned), content: { value: 1000, unit: 'g' as const } },
    ]),
    ...(needed && { needed }),
  })

  it('met au panier le nombre calculé sur le contenu en direct quand il diffère de celui du plan, et le dit à la fin', async () => {
    // Given : le plan croit à 1 kg par produit (1 produit pour 1 kg), le site n'en vend que 100 g
    const { adapter, writes, calls } = fakeAdapter({ '1000001': { content: GRAMS_100 } })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([farine(1)]))

    // Then : 10 produits, sans question ni requête de plus ; le résultat porte la quantité réellement mise au panier
    expect(writes).toEqual([{ id: '1000001', quantity: 10 }])
    expect(calls).toEqual(['search 1000001', 'cart 1000001 10'])
    expect(screens.screens()).not.toContain('quantity')
    expect(expectConform(sent[0]).lines).toEqual([
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '1000001',
        quantity: 10,
        usedRank: 1,
      },
    ])
    expect(screens.propsOf('end')).toEqual([
      {
        outcome: 'completed',
        added: 1,
        chosen: 0,
        haveAtHome: 0,
        skipped: 0,
        unavailable: 0,
        failed: 0,
        changes: [{ name: 'Farine', planned: 1, live: 10 }],
      },
    ])
  })

  /** La quantité écrite par la requête du panier (le champ `d` du corps, décodé). */
  const sentQuantity = (call: { init: RequestInit }) =>
    (JSON.parse(decodeURIComponent(String(call.init.body).slice(2))) as { iQuantite: number })
      .iQuantite

  it('sur la vraie page de recherche (fixture), le nombre mis dans la requête du panier est celui du contenu lu', async () => {
    // Given : le plan mémorise 30 produits pour 3 kg de farine ; la page montre « 1 kg » pour ce produit
    const site = fakeSite((call) =>
      call.init.method === 'POST'
        ? { body: fixture('panier-ajout.json') }
        : { body: fixture('recherche-farine.html') },
    )
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: new LeclercAdapter(site.deps) })
    const threeKilos = {
      quantity: 3,
      unitSymbol: 'kg',
      dimension: 'WEIGHT',
      baseFactor: 1000,
    } as const

    // When
    await flow.start(plan([{ ...farine(30), needed: threeKilos }]))

    // Then : 3 produits de 1 kg, pas 30
    const writes = site.calls.filter((call) => call.init.method === 'POST')
    expect(writes.map(sentQuantity)).toEqual([3])
    expect(screens.propsOf('end')[0]?.changes).toEqual([{ name: 'Farine', planned: 30, live: 3 }])
  })

  it('sur la vraie page de recherche, un contenu que le site ne donne plus laisse le nombre du plan', async () => {
    // Given : la page n'a plus ni « 1 kg » ni prix à l'unité de mesure pour ce produit
    const page = fixture('recherche-farine.html')
      .replace('"sLibelleLigne2": "1 kg"', '"sLibelleLigne2": "selon arrivage"')
      .replace('"sPrixParUniteDeMesure": "1,29 € / kg"', '"sPrixParUniteDeMesure": ""')
    const site = fakeSite((call) =>
      call.init.method === 'POST' ? { body: fixture('panier-ajout.json') } : { body: page },
    )
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: new LeclercAdapter(site.deps) })
    const threeKilos = {
      quantity: 3,
      unitSymbol: 'kg',
      dimension: 'WEIGHT',
      baseFactor: 1000,
    } as const

    // When : le plan mémorise 11 produits (le stock du site en compte 12)
    await flow.start(plan([{ ...farine(11), needed: threeKilos }]))

    // Then : le plan fait foi, comme avant
    const writes = site.calls.filter((call) => call.init.method === 'POST')
    expect(writes.map(sentQuantity)).toEqual([11])
    expect(screens.screens()).not.toContain('end')
  })

  it('le nombre rendu à Repas est celui que le panier a gardé, pas celui du plan ni celui du calcul', async () => {
    // Given : le calcul en direct donne 10, le site n'en garde que 4
    const { adapter, writes } = fakeAdapter({
      '1000001': { content: GRAMS_100, obtained: () => 4 },
    })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    // When
    await flow.start(plan([farine(1)]))

    // Then
    expect(writes).toEqual([{ id: '1000001', quantity: 10 }])
    expect(sent[0]?.lines[0]).toMatchObject({ outcome: 'ADDED', quantity: 4 })
  })

  it('un contenu en direct qui donne le même nombre que le plan ne change rien et n’ajoute aucune mention', async () => {
    // Given : 500 g en direct pour 1 kg demandé, soit 2 produits, comme le plan
    const { adapter, writes } = fakeAdapter({ '1000001': { content: GRAMS_500 } })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([farine(2)]))

    // Then
    expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
    expect(expectConform(sent[0]).lines[0]).toMatchObject({ outcome: 'ADDED', quantity: 2 })
    expect(screens.screens()).not.toContain('end')
  })

  it.each([
    ['un contenu illisible sur le site', { content: null }, farine(3)],
    [
      'un contenu d’une autre dimension que la quantité demandée',
      { content: { value: 75, unit: 'ml' as const } },
      farine(3),
    ],
    ['un contenu nul', { content: { value: 0, unit: 'g' as const } }, farine(3)],
    ['une ligne sans quantité demandée (needed)', { content: GRAMS_100 }, farine(3, null)],
    [
      'une quantité demandée sans dimension',
      { content: GRAMS_100 },
      farine(3, { quantity: 1, unitSymbol: 'kg' }),
    ],
  ])('garde le nombre du plan avec %s', async (_name, item, line) => {
    // Given
    const { adapter, writes } = fakeAdapter({ '1000001': item })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([line]))

    // Then : comportement d'avant, sans question et sans mention
    expect(writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(screens.screens()).not.toContain('quantity')
    expect(expectConform(sent[0]).lines[0]).toMatchObject({ outcome: 'ADDED', quantity: 3 })
    expect(screens.screens()).not.toContain('end')
  })

  it('un nombre à vérifier reste une question pour l’utilisateur, même quand le contenu en direct est lisible', async () => {
    // Given : le plan ne sait pas calculer (contenu mémorisé inconnu)
    const { adapter, writes } = fakeAdapter({ '1000001': { content: GRAMS_100 } })
    const screens = fakeUi({ quantity: () => 6 })
    const { flow } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([farine(null)]))

    // Then : l'utilisateur tranche, rien n'est signalé
    expect(screens.propsOf('quantity')).toEqual([
      // La liste demande 1 kg : l'écran le dit (DRV-626)
      { ingredient: 'Farine', productLabel: 'Produit de test 1000001', packs: null, need: '1 kg' },
    ])
    expect(writes).toEqual([{ id: '1000001', quantity: 6 }])
    expect(screens.screens()).not.toContain('end')
  })

  it('juge chaque produit sur son propre contenu : le produit de secours est recalculé comme le préféré', async () => {
    // Given : le préféré est en rupture ; le secours, mémorisé à 2 produits, ne contient en fait que 100 g
    const line = {
      ...known('farine', [product('1000001', 1), product('1000002', 2)]),
      needed: KILO,
    }
    const { adapter, writes } = fakeAdapter({
      '1000001': { stock: 0, content: GRAMS_500 },
      '1000002': { content: GRAMS_100 },
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([line]))

    // Then
    expect(writes).toEqual([{ id: '1000002', quantity: 10 }])
    expect(sent[0]?.lines[0]).toMatchObject({ productId: '1000002', quantity: 10, usedRank: 2 })
    expect(screens.propsOf('end')[0]?.changes).toEqual([{ name: 'Farine', planned: 2, live: 10 }])
  })

  it('un produit que le panier refuse n’est pas signalé : seul le produit finalement mis au panier l’est', async () => {
    // Given : le préféré a un contenu différent, mais le panier le refuse ; le secours est conforme
    const line = {
      ...known('farine', [product('1000001', 1), product('1000002', 2)]),
      needed: KILO,
    }
    const { adapter } = fakeAdapter({
      '1000001': { content: GRAMS_100, obtained: () => 0 },
      '1000002': { content: GRAMS_500 },
    })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([line]))

    // Then
    expect(screens.screens()).not.toContain('end')
  })

  it('la mention survit à un rechargement de la page : elle figure à la fin du passage repris', async () => {
    // Given : un premier passage interrompu (page rechargée) après la farine, dont le contenu en direct diffère
    const storage = fakeStorage()
    const shelf = { '1000001': { content: GRAMS_100 }, '1000003': {} }
    const first = fakeAdapter(shelf, {
      before: (call) =>
        call === 'search 1000003' ? new Promise<void>(() => undefined) : undefined,
    })
    const lines = () => [farine(1), known('sucre', [product('1000003')])]
    void makeFlow({ ui: fakeUi().ui, adapter: first.adapter, storage }).flow.start(plan(lines()))
    await vi.waitFor(() =>
      expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toContain('"changes":[{'),
    )

    // When : la page rechargée reprend
    const second = fakeAdapter(shelf)
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow } = makeFlow({ ui: screens.ui, adapter: second.adapter, storage })
    await flow.start(plan(lines()))

    // Then : la farine n'est pas refaite, mais sa mention est là
    expect(second.writes).toEqual([{ id: '1000003', quantity: 1 }])
    expect(screens.propsOf('end')[0]?.changes).toEqual([{ name: 'Farine', planned: 1, live: 10 }])
  })

  /** Un état de reprise d'un passage dont `sel` est fait ; `extra` y ajoute ce que le test veut éprouver. */
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

  it('un état ancien, sans mention, se reprend comme avant', async () => {
    // Given : un état écrit par une version de l'agent qui ne connaissait pas `changes`
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: fakeAdapter().adapter,
      storage: storedState(),
    })

    // When
    await flow.start(plan([home('sel')]))

    // Then
    expect(screens.propsOf('resume')).toEqual([{ done: 1, total: 1 }])
    expect(screens.screens()).not.toContain('end')
  })

  it.each([
    ['pas une liste', 'oui'],
    ['une entrée qui n’est pas un objet', [3]],
    ['un nombre hors des bornes', [{ ingredientSlug: 'sel', planned: 1, live: 1000 }]],
    ['un nombre fractionnaire', [{ ingredientSlug: 'sel', planned: 1.5, live: 2 }]],
    ['un identifiant qui n’est pas du texte', [{ ingredientSlug: 4, planned: 1, live: 2 }]],
  ])('ignore un état dont les mentions sont mal formées (%s)', async (_name, changes) => {
    const screens = fakeUi()
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: fakeAdapter().adapter,
      storage: storedState({ changes }),
    })

    await flow.start(plan([home('sel')]))

    expect(screens.screens()[0]).toBe('summary')
  })

  it('une mention d’un ingrédient qui n’est pas dans le plan n’est pas affichée', async () => {
    // Given : un état de reprise (le stockage est partagé avec la page) cite un ingrédient étranger au plan
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: fakeAdapter().adapter,
      storage: storedState({ changes: [{ ingredientSlug: 'inconnu', planned: 1, live: 2 }] }),
    })

    // When
    await flow.start(plan([home('sel')]))

    // Then
    expect(screens.screens()).not.toContain('end')
  })
})

describe('les erreurs', () => {
  const blockedSite = () => fakeSite(() => ({ status: 403, body: 'refusé' }))

  it('arrête après deux réponses 403 de suite : « partial », les lignes restantes échouent (BLOCKED)', async () => {
    // Given : le vrai adaptateur sur un faux site qui répond 403
    const site = blockedSite()
    const adapter = new LeclercAdapter(site.deps)
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    // When
    await flow.start(
      plan([
        known('farine', [product('1000001')]),
        home('sel'),
        known('sucre', [product('1000003')]),
        fresh('poivre'),
      ]),
    )

    // Then : deux requêtes seulement, puis plus rien
    expect(site.calls).toHaveLength(2)
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'partial',
      error: { code: 'BLOCKED' },
      lines: [
        { ingredientSlug: 'farine', outcome: 'FAILED', error: 'BLOCKED' },
        { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
        { ingredientSlug: 'sucre', outcome: 'FAILED', error: 'BLOCKED' },
        { ingredientSlug: 'poivre', outcome: 'FAILED', error: 'BLOCKED' },
      ],
    })
  })

  it('un passage réel sur les fixtures : le produit indisponible du site laisse la place au suivant', async () => {
    // Given : la page de recherche inventée (1000002 en rupture) et une réponse de panier valide
    const site = fakeSite((call) =>
      call.init.method === 'POST'
        ? { body: fixture('panier-ajout.json') }
        : { body: fixture('recherche-farine.html') },
    )
    const adapter = new LeclercAdapter(site.deps)
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    // When
    await flow.start(plan([known('farine', [product('1000002', 1), product('1000001', 3)])]))

    // Then
    expect(site.calls.map((call) => call.init.method)).toEqual(['GET', 'GET', 'POST'])
    expect(expectConform(sent[0]).lines).toEqual([
      expect.objectContaining({
        outcome: 'ADDED',
        productId: '1000001',
        quantity: 3,
        usedRank: 2,
        unavailableIds: ['1000002'],
        price: expect.objectContaining({ cents: expect.any(Number) }),
      }),
    ])
  })

  it('NOT_LOGGED_IN : arrêt immédiat, résultat « error », rien de plus n’est tenté', async () => {
    const { adapter, calls } = fakeAdapter(
      { '1000001': {}, '1000003': {} },
      {
        before: (call) => {
          if (call === 'search 1000003') throw new LeclercError('NOT_LOGGED_IN')
        },
      },
    )
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(
      plan([
        known('farine', [product('1000001')]),
        known('sucre', [product('1000003')]),
        known('lait', [product('1000004')]),
      ]),
    )

    expect(calls).toEqual(['search 1000001', 'cart 1000001 1', 'search 1000003'])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'error',
      error: { code: 'NOT_LOGGED_IN' },
      lines: [{ ingredientSlug: 'farine', outcome: 'ADDED' }],
    })
    expect(flow.history.at(-1)).toBe('ERROR')
  })

  it('NETWORK : la ligne échoue, les suivantes sont tentées, le passage est partiel', async () => {
    const { adapter } = fakeAdapter(
      { '1000001': {}, '1000003': {} },
      {
        before: (call) => {
          if (call === 'search 1000001') throw new LeclercError('NETWORK')
        },
      },
    )
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(
      plan([known('farine', [product('1000001')]), known('sucre', [product('1000003')])]),
    )

    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'partial',
      lines: [
        { ingredientSlug: 'farine', outcome: 'FAILED', error: 'NETWORK' },
        { ingredientSlug: 'sucre', outcome: 'ADDED' },
      ],
    })
    expect(sent[0]?.error).toBeUndefined()
  })

  it.each([
    ['CONTRACT_CHANGED', new LeclercError('CONTRACT_CHANGED')],
    ['CONTRACT_CHANGED', new TypeError('le site renvoie un secret : cookie=abc')],
  ])(
    '%s : la ligne échoue et le passage s’arrête, sans jamais citer le message de l’erreur',
    async (_code, error) => {
      const { adapter, calls } = fakeAdapter(
        { '1000001': {}, '1000003': {} },
        {
          before: (call) => {
            if (call === 'search 1000001') throw error
          },
        },
      )
      const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

      await flow.start(
        plan([known('farine', [product('1000001')]), known('sucre', [product('1000003')])]),
      )

      expect(calls).toEqual(['search 1000001'])
      expect(expectConform(sent[0])).toMatchObject({
        outcome: 'error',
        error: { code: 'CONTRACT_CHANGED' },
        lines: [{ ingredientSlug: 'farine', outcome: 'FAILED', error: 'CONTRACT_CHANGED' }],
      })
      expect(JSON.stringify(sent[0])).not.toContain('cookie')
    },
  )

  it('l’écran de fin porte le code qui a interrompu le passage et les nombres', async () => {
    const site = blockedSite()
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: new LeclercAdapter(site.deps) })

    await flow.start(plan([known('farine', [product('1000001')]), home('sel')]))

    expect(screens.propsOf('end')).toEqual([
      {
        outcome: 'partial',
        error: 'BLOCKED',
        added: 0,
        chosen: 0,
        haveAtHome: 1,
        skipped: 0,
        unavailable: 0,
        failed: 1,
      },
    ])
  })

  it('une erreur de la phase B est traitée comme en phase A', async () => {
    const { adapter } = fakeAdapter()
    const { flow, sent } = makeFlow({
      ui: fakeUi().ui,
      adapter,
      phaseB: () => Promise.reject(new LeclercError('BLOCKED')),
    })

    await flow.start(plan([fresh('poivre')]))

    expect(expectConform(sent[0])).toMatchObject({ outcome: 'partial', error: { code: 'BLOCKED' } })
  })

  it('une erreur imprévue de l’orchestrateur lui-même montre « le site a changé » et ne renvoie rien', async () => {
    const screens = fakeUi({
      summary: () => {
        throw new Error('bug')
      },
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: fakeAdapter().adapter })

    await flow.start(plan([home('sel')]))

    expect(screens.propsOf('error')).toEqual([
      { code: 'CONTRACT_CHANGED', canReturn: false, cause: 'EXCEPTION' },
    ])
    expect(sent).toEqual([])
  })
})

describe('l’arrêt par l’utilisateur', () => {
  it('« Arrêter » finit proprement : « aborted », avec ce qui a été fait', async () => {
    // Given : l'utilisateur touche « Arrêter » pendant la première ligne
    const screens = fakeUi()
    const { adapter, calls } = fakeAdapter(
      { '1000001': {}, '1000003': {} },
      {
        before: (call) => {
          if (call === 'cart 1000001 1') screens.pressStop()
        },
      },
    )
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(
      plan([known('farine', [product('1000001')]), known('sucre', [product('1000003')])]),
    )

    // Then : la ligne en cours est finie, la suivante n'est pas commencée
    expect(calls).toEqual(['search 1000001', 'cart 1000001 1'])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'aborted',
      lines: [{ ingredientSlug: 'farine', outcome: 'ADDED' }],
    })
    expect(flow.history).toEqual(['START', 'VALIDATED', 'CONFIRMED', 'PHASE_A', 'ABORTED'])
  })
})

describe('le démarrage', () => {
  it('un message invalide montre « liste illisible » sans retour possible, et rien n’est envoyé', async () => {
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui })

    await flow.start({ v: 2, type: 'plan' })

    expect(screens.propsOf('error')).toEqual([{ code: 'INVALID_MESSAGE', canReturn: false }])
    expect(sent).toEqual([])
    expect(flow.history).toEqual(['START', 'ERROR'])
    expect(screens.closed.count).toBe(1)
  })

  it('un message illisible (transport) montre aussi « liste illisible »', async () => {
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui })

    await flow.invalid()

    expect(screens.propsOf('error')).toEqual([{ code: 'INVALID_MESSAGE', canReturn: false }])
  })

  it('un autre magasin que celui du message : STORE_MISMATCH, aucune requête, résultat « error » au retour', async () => {
    const { adapter, calls } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: {
        ...adapter,
        readStore: () => ({
          id: '000999',
          host: 'fd0-courses.leclercdrive.fr',
          baseUrl: 'https://x',
          label: null,
        }),
      },
    })

    await flow.start(plan([known('farine', [product('1000001')])]))

    expect(screens.propsOf('error')).toEqual([{ code: 'STORE_MISMATCH', canReturn: true }])
    expect(calls).toEqual([])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'error',
      error: { code: 'STORE_MISMATCH' },
      lines: [],
    })
  })

  it('un autre hôte que celui du message est aussi un autre magasin', async () => {
    const screens = fakeUi()
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: {
        ...fakeAdapter().adapter,
        readStore: () => ({
          id: '000123',
          host: 'fd9-courses.leclercdrive.fr',
          baseUrl: 'https://x',
          label: null,
        }),
      },
    })

    await flow.start(plan([home('sel')]))

    expect(screens.propsOf('error')[0]?.code).toBe('STORE_MISMATCH')
  })

  it('une page qui n’est pas celle d’un magasin : UNSUPPORTED_PAGE', async () => {
    const screens = fakeUi()
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: {
        ...fakeAdapter().adapter,
        readStore: () => {
          throw new LeclercError('UNSUPPORTED_PAGE')
        },
      },
    })

    await flow.start(plan([home('sel')]))

    expect(screens.propsOf('error')).toEqual([{ code: 'UNSUPPORTED_PAGE', canReturn: true }])
  })

  it('le site mobile de Leclerc : UNSUPPORTED_PAGE de cause PAGE_MOBILE, aucune requête, et la cause part au résultat (ticket J)', async () => {
    // Given : l'adaptateur dit que la page est le site mobile
    const { adapter, calls } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: {
        ...adapter,
        readStore: () => {
          throw new LeclercError('UNSUPPORTED_PAGE', null, 'PAGE_MOBILE')
        },
      },
    })

    // When
    await flow.start(plan([known('farine', [product('1000001')])]))

    // Then : l'écran d'erreur reçoit la cause, rien n'est demandé au site, le résultat dit laquelle
    expect(screens.propsOf('error')).toEqual([
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'PAGE_MOBILE' },
    ])
    expect(screens.screens()).toEqual(['error'])
    expect(calls).toEqual([])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'error',
      error: { code: 'UNSUPPORTED_PAGE', message: 'Page non prise en charge (PAGE_MOBILE)' },
    })
  })

  it('refuse de naviguer quand le retour est impossible (origine non écrite) : UNSUPPORTED_PAGE avant toute action', async () => {
    const { adapter, calls } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter, canReturn: false })

    await flow.start(plan([known('farine', [product('1000001')])]))

    expect(screens.propsOf('error')).toEqual([{ code: 'UNSUPPORTED_PAGE', canReturn: false }])
    expect(screens.screens()).toEqual(['error'])
    expect(calls).toEqual([])
    expect(sent).toEqual([])
  })

  it('passe un message « setup » à son gestionnaire, sans rien afficher', async () => {
    const onSetup = vi.fn<NonNullable<Parameters<typeof makeFlow>[0]['onSetup']>>()
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, onSetup })
    const { lines: _lines, type: _type, ...head } = plan([])

    await flow.start({ ...head, type: 'setup' })

    expect(onSetup).toHaveBeenCalledOnce()
    expect(screens.shown).toEqual([])
  })

  it('un message « setup » sans gestionnaire ne fait rien', async () => {
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui })
    const { lines: _lines, type: _type, ...head } = plan([])

    await flow.start({ ...head, type: 'setup' })

    expect(screens.shown).toEqual([])
  })

  it('un seul passage à la fois : un second message pendant le premier est ignoré', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { adapter, calls } = fakeAdapter({ '1000001': {} }, { before: () => gate })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    const first = flow.start(plan([known('farine', [product('1000001')])]))
    await flow.start(
      plan([known('farine', [product('1000001')])], '11111111-2222-4333-8444-555555555555'),
    )
    await flow.invalid()
    release()
    await first

    expect(calls).toEqual(['search 1000001', 'cart 1000001 1'])
    expect(sent).toHaveLength(1)
  })
})

describe('la reprise après un rechargement', () => {
  const lines = () => [
    known('farine', [product('1000001')]),
    known('sucre', [product('1000003')]),
    known('lait', [product('1000004')]),
  ]

  /** Un premier passage interrompu par le rechargement de la page après deux lignes : son état reste dans le stockage. */
  async function interruptedAfterTwo() {
    const storage = fakeStorage()
    const { adapter } = fakeAdapter(
      { '1000001': {}, '1000003': {}, '1000004': {} },
      {
        before: (call) =>
          call === 'search 1000004' ? new Promise<void>(() => undefined) : undefined,
      },
    )
    const { flow } = makeFlow({ ui: fakeUi().ui, adapter, storage })
    void flow.start(plan(lines()))
    await vi.waitFor(() => expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toContain('sucre'))
    await vi.waitFor(() => expect(storage.data.size).toBe(1))
    return storage
  }

  it('sauvegarde l’état sous repas:run:<runId> après chaque ligne, sans donnée personnelle', async () => {
    const storage = await interruptedAfterTwo()

    const state = JSON.parse(storage.getItem(`${RUN_PREFIX}${RUN_ID}`) ?? '{}') as Record<
      string,
      unknown
    >
    expect(state).toMatchObject({ v: 1, runId: RUN_ID, phase: 'PHASE_A', waiting: {} })
    expect(Object.keys(state.done as object)).toEqual(['farine', 'sucre'])
    expect(storage.data.size).toBe(1)
  })

  it('propose « Reprendre » et ne réécrit pas les lignes déjà faites', async () => {
    // Given
    const storage = await interruptedAfterTwo()
    const { adapter, writes } = fakeAdapter({ '1000001': {}, '1000003': {}, '1000004': {} })
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter, storage })

    // When : la page rechargée reçoit de nouveau le plan
    await flow.start(plan(lines()))

    // Then
    expect(screens.propsOf('resume')).toEqual([{ done: 2, total: 3 }])
    expect(screens.screens()).not.toContain('summary')
    expect(writes).toEqual([{ id: '1000004', quantity: 1 }])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'completed',
      lines: [
        { ingredientSlug: 'farine', outcome: 'ADDED' },
        { ingredientSlug: 'sucre', outcome: 'ADDED' },
        { ingredientSlug: 'lait', outcome: 'ADDED' },
      ],
    })
    expect(storage.data.size).toBe(0)
  })

  it('« Recommencer » oublie l’état et refait tout après le récapitulatif', async () => {
    const storage = await interruptedAfterTwo()
    const { adapter, writes } = fakeAdapter({ '1000001': {}, '1000003': {}, '1000004': {} })
    const screens = fakeUi({ resume: () => 'restart' })
    const { flow } = makeFlow({ ui: screens.ui, adapter, storage })

    await flow.start(plan(lines()))

    expect(screens.screens().slice(0, 2)).toEqual(['resume', 'summary'])
    expect(writes.map((write) => write.id)).toEqual(['1000001', '1000003', '1000004'])
  })

  it('« Annuler » rend un résultat « aborted » avec ce qui avait été fait', async () => {
    const storage = await interruptedAfterTwo()
    const { adapter, calls } = fakeAdapter()
    const { flow, sent } = makeFlow({ ui: fakeUi({ resume: () => 'cancel' }).ui, adapter, storage })

    await flow.start(plan(lines()))

    expect(calls).toEqual([])
    expect(sent[0]).toMatchObject({
      outcome: 'aborted',
      lines: [{ outcome: 'ADDED' }, { outcome: 'ADDED' }],
    })
    expect(storage.data.size).toBe(0)
  })

  it('reprend une ligne qui attendait la phase B sans la refaire en phase A', async () => {
    const storage = fakeStorage({
      [`${RUN_PREFIX}${RUN_ID}`]: JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_B',
        done: { farine: { ingredientSlug: 'farine', outcome: 'HAVE_AT_HOME' } },
        waiting: { poivre: [] },
      }),
    })
    const { adapter, calls } = fakeAdapter()
    const asked: string[][] = []
    const { flow, sent } = makeFlow({
      ui: fakeUi().ui,
      adapter,
      storage,
      phaseB: (context) => {
        asked.push(context.pending.map((item) => item.line.ingredientSlug))
        context.record({ ingredientSlug: 'poivre', outcome: 'SKIPPED' })
        return Promise.resolve('done')
      },
    })

    await flow.start(plan([known('farine', [product('1000001')]), fresh('poivre')]))

    expect(calls).toEqual([])
    expect(asked).toEqual([['poivre']])
    expect(sent[0]).toMatchObject({ outcome: 'completed' })
  })

  it('un seul passage actif : l’état d’un autre runId est oublié, le plus récent est proposé', async () => {
    const other = '11111111-2222-4333-8444-555555555555'
    const state = (runId: string, slug: string, updatedAt: number) =>
      JSON.stringify({
        v: 1,
        runId,
        updatedAt,
        phase: 'PHASE_A',
        done: { [slug]: { ingredientSlug: slug, outcome: 'HAVE_AT_HOME' } },
        waiting: {},
      })
    const storage = fakeStorage({
      [`${RUN_PREFIX}${other}`]: state(other, 'beurre', 5),
      [`${RUN_PREFIX}${RUN_ID}`]: state(RUN_ID, 'sel', 9),
      'autre-cle': 'garde',
    })
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow } = makeFlow({ ui: screens.ui, adapter: fakeAdapter().adapter, storage })

    await flow.start(plan([home('sel')]))

    expect(screens.propsOf('resume')).toEqual([{ done: 1, total: 1 }])
    expect([...storage.data.keys()]).toEqual(['autre-cle'])
  })

  it.each([
    ['du texte qui n’est pas du JSON', 'pas du json'],
    [
      'un autre runId',
      JSON.stringify({ v: 1, runId: 'x', updatedAt: 1, phase: 'PHASE_A', done: {}, waiting: {} }),
    ],
    [
      'une issue inconnue',
      JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_A',
        done: { sel: { ingredientSlug: 'sel', outcome: 'PIRATE' } },
        waiting: {},
      }),
    ],
    [
      'une ligne rangée sous un autre nom',
      JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_A',
        done: { sel: { ingredientSlug: 'sucre', outcome: 'SKIPPED' } },
        waiting: {},
      }),
    ],
    [
      'une attente mal formée',
      JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_A',
        done: {},
        waiting: { sel: 3 },
      }),
    ],
    [
      'une phase inconnue',
      JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_Z',
        done: {},
        waiting: {},
      }),
    ],
  ])('ignore un état illisible ou étranger (%s) : récapitulatif normal', async (_name, stored) => {
    const storage = fakeStorage({ [`${RUN_PREFIX}${RUN_ID}`]: stored })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: fakeAdapter().adapter, storage })

    await flow.start(plan([home('sel')]))

    expect(screens.screens()[0]).toBe('summary')
  })

  it('un état sans aucune ligne faite n’est pas proposé à la reprise', async () => {
    const storage = fakeStorage({
      [`${RUN_PREFIX}${RUN_ID}`]: JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_A',
        done: {},
        waiting: {},
      }),
    })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: fakeAdapter().adapter, storage })

    await flow.start(plan([home('sel')]))

    expect(screens.screens()[0]).toBe('summary')
  })

  it('supprime l’état à la fin', async () => {
    const storage = fakeStorage()
    const { flow } = makeFlow({ ui: fakeUi().ui, adapter: fakeAdapter().adapter, storage })

    await flow.start(plan([home('sel')]))

    expect(storage.data.size).toBe(0)
  })

  it('un stockage qui refuse d’écrire ne gêne pas le passage', async () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new DOMException('plein', 'QuotaExceededError')
    }
    storage.removeItem = () => {
      throw new DOMException('interdit', 'SecurityError')
    }
    storage.getItem = () => {
      throw new DOMException('interdit', 'SecurityError')
    }
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: fakeAdapter().adapter, storage })

    await flow.start(plan([home('sel')]))

    expect(sent[0]).toMatchObject({ outcome: 'completed' })
  })

  it('un stockage dont l’énumération échoue ne gêne pas le passage', async () => {
    const storage = fakeStorage()
    Object.defineProperty(storage, 'length', {
      get() {
        throw new DOMException('interdit', 'SecurityError')
      },
    })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: fakeAdapter().adapter, storage })

    await flow.start(plan([home('sel')]))

    expect(sent[0]).toMatchObject({ outcome: 'completed' })
  })
})

describe('l’écran allumé', () => {
  it('demande le verrou d’écran pendant le passage et le libère à la fin', async () => {
    const { wakeLock, state } = fakeWakeLock()
    const { flow } = makeFlow({ ui: fakeUi().ui, adapter: fakeAdapter().adapter, wakeLock })

    await flow.start(plan([home('sel')]))

    expect(state).toEqual({ requested: 1, released: 1 })
  })

  it('libère le verrou même quand le passage s’interrompt', async () => {
    const { wakeLock, state } = fakeWakeLock()
    const { adapter } = fakeAdapter(
      { '1000001': {} },
      {
        before: () => {
          throw new LeclercError('NOT_LOGGED_IN')
        },
      },
    )
    const { flow } = makeFlow({ ui: fakeUi().ui, adapter, wakeLock })

    await flow.start(plan([known('farine', [product('1000001')])]))

    expect(state).toEqual({ requested: 1, released: 1 })
  })

  it('tolère un verrou refusé', async () => {
    const { wakeLock, state } = fakeWakeLock({ refuse: true })
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: fakeAdapter().adapter, wakeLock })

    await flow.start(plan([home('sel')]))

    expect(state).toEqual({ requested: 1, released: 0 })
    expect(sent[0]?.outcome).toBe('completed')
  })

  it('tolère un verrou qui ne se libère pas', async () => {
    const wakeLock = {
      request: () => Promise.resolve({ release: () => Promise.reject(new Error('déjà rendu')) }),
    }
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: fakeAdapter().adapter, wakeLock })

    await flow.start(plan([home('sel')]))

    expect(sent[0]?.outcome).toBe('completed')
  })

  it('tolère l’absence de l’API', async () => {
    const { flow, sent } = makeFlow({
      ui: fakeUi().ui,
      adapter: fakeAdapter().adapter,
      wakeLock: null,
    })

    await flow.start(plan([home('sel')]))

    expect(sent[0]?.outcome).toBe('completed')
  })
})
