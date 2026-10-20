// DRV-635 : « introuvable à la recherche » n'est pas « indisponible », et le panier tranche la disponibilité. Trois états distincts pour un produit
// habituel que la phase A n'a pas mis au panier : `OUT_OF_STOCK` (le site le dit en rupture ET le panier le refuse), `NOT_FOUND` (aucune des
// recherches ne l'a retrouvé), `CART_REFUSED` (le site le disait disponible, le panier n'en a rien pris). Le protocole ne change pas : la ligne reste
// `UNAVAILABLE`, la raison vit dans l'état de l'agent, son écran, son journal et son diagnostic.
import { describe, expect, it } from 'vitest'

import {
  MAX_PRODUCT_FORMS,
  productSearchForms,
  readLastReasons,
  RunStore,
  type PendingLine,
  type PhaseB,
} from '../src/flow'
import { availabilityFacts, probeLines, runChecks } from '../src/diagnostic'
import { LeclercAdapter } from '../src/leclerc'
import { toCandidate } from '../src/leclerc/candidate'
import { extractProducts } from '../src/leclerc/embedded'
import {
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  known,
  makeFlow,
  OUT_OF_STOCK,
  plan,
  product,
  RUN_ID,
  type ShelfItem,
} from './flow-helpers'
import { fakeSite, fixture } from './leclerc-helpers'

const LABEL = "Gâteaux C'est Nous Pépites 300 g"
const CAKES = product('1000034', 1, LABEL)

/** Un passage d'une ligne, sans phase B (la ligne reste `UNAVAILABLE`), avec un stockage de session. */
async function pass(options: {
  shelf: Record<string, ShelfItem>
  sees?: (query: string, id: string) => boolean
  lines?: Parameters<typeof plan>[0]
  phaseB?: PhaseB
}) {
  const site = fakeAdapter(options.shelf, options.sees ? { sees: options.sees } : {})
  const screens = fakeUi()
  const storage = fakeStorage()
  const { flow, sent } = makeFlow({
    ui: screens.ui,
    adapter: site.adapter,
    storage,
    ...(options.phaseB && { phaseB: options.phaseB }),
  })
  await flow.start(plan(options.lines ?? [known('gateaux', [CAKES])]))
  return { site, screens, storage, sent }
}

const NOT_FOUND = { shelf: { '1000034': {} }, sees: () => false }
const CART_REFUSED = { shelf: { '1000034': { stock: 10, obtained: () => 0 } } }
const OUT = { shelf: { '1000034': OUT_OF_STOCK } }

describe('les trois états d’un produit habituel que la phase A n’a pas mis au panier', () => {
  it.each([
    ['NOT_FOUND', NOT_FOUND],
    ['CART_REFUSED', CART_REFUSED],
    ['OUT_OF_STOCK', OUT],
  ] as const)(
    '%s : la phase B reçoit la raison de chaque produit écarté',
    async (reason, scenario) => {
      // Given : une phase B qui note ce qu'on lui transmet
      const seen: PendingLine[] = []
      const phaseB: PhaseB = (context) => {
        seen.push(...context.pending)
        return Promise.resolve('done')
      }

      // When
      await pass({ ...scenario, phaseB })

      // Then
      expect(seen).toHaveLength(1)
      expect(seen[0]?.unavailable.map((item) => item.id)).toEqual(['1000034'])
      expect(seen[0]?.reasons).toEqual(new Map([['1000034', reason]]))
    },
  )

  it('NOT_FOUND : jamais « indisponible » sur un simple « pas de résultat » ; 5 recherches au plus, aucune écriture', async () => {
    const test = await pass(NOT_FOUND)

    const queries = test.site.searched.map((search) => search.query)
    expect(queries).toEqual([LABEL, ...productSearchForms(LABEL)])
    expect(queries.length).toBeLessThanOrEqual(1 + MAX_PRODUCT_FORMS)
    expect(test.site.writes).toEqual([])
    expect(test.screens.propsOf('end')[0]?.reasons).toEqual([
      { name: 'Gateaux', reason: 'NOT_FOUND', tried: queries.length },
    ])
  })

  it('CART_REFUSED : une seule écriture, aucune recherche de plus', async () => {
    const test = await pass(CART_REFUSED)

    expect(test.site.searched).toHaveLength(1)
    expect(test.site.writes).toEqual([{ id: '1000034', quantity: 1 }])
    expect(test.screens.propsOf('end')[0]?.reasons).toEqual([
      { name: 'Gateaux', reason: 'CART_REFUSED', tried: 1 },
    ])
  })

  it('OUT_OF_STOCK : une seule écriture (le panier tranche), puis la rupture est dite', async () => {
    const test = await pass(OUT)

    expect(test.site.writes).toEqual([{ id: '1000034', quantity: 1 }])
    expect(test.screens.propsOf('end')[0]?.reasons).toEqual([
      { name: 'Gateaux', reason: 'OUT_OF_STOCK', tried: 1 },
    ])
  })

  it.each([
    ['NOT_FOUND', NOT_FOUND],
    ['CART_REFUSED', CART_REFUSED],
    ['OUT_OF_STOCK', OUT],
  ] as const)(
    '%s : le résultat renvoyé à Repas ne gagne aucune clé (la ligne reste UNAVAILABLE avec ses identifiants)',
    async (_reason, scenario) => {
      const test = await pass(scenario)

      const result = expectConform(test.sent[0])
      expect(result.lines).toEqual([
        { ingredientSlug: 'gateaux', outcome: 'UNAVAILABLE', unavailableIds: ['1000034'] },
      ])
      expect(Object.keys(result).sort()).toEqual(
        ['agentVersion', 'lines', 'outcome', 'runId', 'stats', 'store', 'type', 'v'].sort(),
      )
      expect(Object.keys(result.lines[0] ?? {}).sort()).toEqual([
        'ingredientSlug',
        'outcome',
        'unavailableIds',
      ])
    },
  )

  it('aucun des trois n’écarte le produit de la mémoire de Repas : ni « rejected », ni autre trace dans l’issue d’une ligne choisie ensuite', async () => {
    for (const scenario of [NOT_FOUND, CART_REFUSED, OUT]) {
      // Given : la phase B choisit un autre produit sans cocher « Ne plus proposer »
      const phaseB: PhaseB = (context) => {
        for (const { line } of context.pending) {
          context.record({
            ingredientSlug: line.ingredientSlug,
            outcome: 'CHOSEN',
            quantity: 1,
            placement: 'ONCE',
            product: { id: '1000099', label: 'Un autre produit' },
          })
        }
        return Promise.resolve('done')
      }

      // When
      const test = await pass({ ...scenario, phaseB })

      // Then
      expect(expectConform(test.sent[0]).lines[0]).not.toHaveProperty('rejected')
    }
  })

  it('les raisons de toute la ligne sont gardées dans l’ordre des produits, avec leur nombre de recherches', async () => {
    // Given : deux produits habituels, le premier introuvable, le second refusé par le panier
    const second = product('1000035', 1, 'Biscuits de test')
    const test = await pass({
      shelf: { '1000034': {}, '1000035': { stock: 10, obtained: () => 0 } },
      sees: (_query, id) => id === '1000035',
      lines: [known('gateaux', [CAKES, second])],
    })

    const tried = 1 + productSearchForms(LABEL).length
    expect(test.screens.propsOf('end')[0]?.reasons).toEqual([
      { name: 'Gateaux', reason: 'NOT_FOUND', tried },
    ])
    expect(test.site.writes).toEqual([{ id: '1000035', quantity: 1 }])
  })
})

describe('le panier tranche : une étiquette de rupture n’est pas un verrou', () => {
  it('stock nul mais le panier accepte : le produit est au panier, sans rien demander, et le journal le note', async () => {
    const test = await pass({ shelf: { '1000034': { stock: 0 } } })

    expect(test.site.writes).toEqual([{ id: '1000034', quantity: 1 }])
    expect(expectConform(test.sent[0]).lines).toEqual([
      {
        ingredientSlug: 'gateaux',
        outcome: 'ADDED',
        productId: '1000034',
        quantity: 1,
        usedRank: 1,
      },
    ])
    expect(
      test.screens.updates.some(
        (update) => update.entry === 'Gateaux : ajouté, Leclerc l’a accepté',
      ),
    ).toBe(true)
    expect(test.screens.screens()).not.toContain('chooser')
  })

  it('« Bientôt disponible » et un stock lisible : tenté, accepté, au panier', async () => {
    const test = await pass({ shelf: { '1000034': { stock: 5, comingSoon: true } } })

    expect(test.site.writes).toEqual([{ id: '1000034', quantity: 1 }])
    expect(expectConform(test.sent[0]).lines[0]).toMatchObject({ outcome: 'ADDED' })
  })

  it('un produit en stock se met au panier sans le journal « accepté » (rien n’était à démentir)', async () => {
    const test = await pass({ shelf: { '1000034': {} } })

    expect(test.screens.updates.some((update) => update.entry === 'Gateaux : ajouté')).toBe(true)
    expect(test.screens.updates.some((update) => update.entry?.includes('accepté'))).toBe(false)
  })

  it('le journal dit la raison de chaque état, avec les mots du produit', async () => {
    const entries = async (scenario: Parameters<typeof pass>[0]) =>
      (await pass(scenario)).screens.updates.map((update) => update.entry).filter(Boolean)

    expect(await entries(NOT_FOUND)).toContain('Gateaux : produit introuvable, à choisir ensuite')
    expect(await entries(CART_REFUSED)).toContain(
      'Gateaux : pas pris par le panier, à choisir ensuite',
    )
    expect(await entries(OUT)).toContain('Gateaux : plus disponible, à choisir ensuite')
  })

  it('une seule tentative d’écriture par produit et par envoi, même sur deux lignes', async () => {
    // Given : le même produit en rupture sur deux articles
    const test = await pass({
      shelf: { '1000034': OUT_OF_STOCK },
      lines: [known('gateaux', [CAKES]), known('biscuits', [CAKES])],
    })

    // Then : une écriture, deux recherches (une par ligne), les deux lignes écartées pour rupture
    expect(test.site.writes).toEqual([{ id: '1000034', quantity: 1 }])
    expect(test.site.searched).toHaveLength(2)
    expect(test.screens.propsOf('end')[0]?.reasons).toHaveLength(2)
  })

  it('les requêtes de recherche et d’écriture sont en série (jamais deux à la fois)', async () => {
    const test = await pass({ ...NOT_FOUND })

    expect(test.site.maxInFlight()).toBeLessThanOrEqual(1)
  })
})

describe('les raisons de l’envoi : état de reprise et diagnostic', () => {
  it('l’état de reprise garde les raisons ; une raison inconnue le fait refuser', () => {
    const storage = fakeStorage()
    const store = new RunStore(storage)
    const state = {
      v: 1 as const,
      runId: RUN_ID,
      updatedAt: 1,
      phase: 'PHASE_B' as const,
      done: {},
      waiting: { gateaux: ['1000034'] },
      changes: [],
      carts: [],
      unreached: [],
      reasons: [
        { ingredientSlug: 'gateaux', id: '1000034', reason: 'NOT_FOUND' as const, tried: 5 },
      ],
      stats: { requests: 0, errors: 0, blocks: 0 },
    }

    store.save(state)
    expect(store.load(RUN_ID)?.reasons).toEqual(state.reasons)

    store.save({ ...state, reasons: [{ ...state.reasons[0], reason: 'WHATEVER' } as never] })
    expect(store.load(RUN_ID)).toBeNull()
  })

  it('un état d’avant la version (sans raisons) se reprend avec une liste vide', () => {
    const storage = fakeStorage()
    const old = {
      v: 1,
      runId: RUN_ID,
      updatedAt: 1,
      phase: 'PHASE_A',
      done: {},
      waiting: {},
    }
    storage.setItem(`repas:run:${RUN_ID}`, JSON.stringify(old))

    expect(new RunStore(storage).load(RUN_ID)?.reasons).toEqual([])
  })

  it('la fin d’un envoi garde pour le diagnostic la raison et le nombre de recherches, sans libellé ni identifiant', async () => {
    const test = await pass(NOT_FOUND)

    const kept = readLastReasons(test.storage)
    expect(kept).toEqual([{ reason: 'NOT_FOUND', tried: 1 + productSearchForms(LABEL).length }])
    expect(JSON.stringify([...test.storage.data.values()])).not.toContain('1000034')
    expect(test.storage.data.get('repas:last-reasons')).not.toContain('Pépites')
  })

  it('un envoi sans raison efface celles du précédent', async () => {
    const storage = fakeStorage({ 'repas:last-reasons': '[{"reason":"NOT_FOUND","tried":5}]' })
    const site = fakeAdapter({ '1000034': {} })
    const { flow } = makeFlow({ ui: fakeUi().ui, adapter: site.adapter, storage })

    await flow.start(plan([known('gateaux', [CAKES])]))

    expect(readLastReasons(storage)).toEqual([])
  })

  it('le diagnostic ne croit pas un stockage forgé', () => {
    const storage = fakeStorage({
      'repas:last-reasons': JSON.stringify([
        { reason: 'NOT_FOUND', tried: 5 },
        { reason: 'ATTENTION', tried: 2 },
        { reason: 'NOT_FOUND', tried: 'beaucoup' },
        'texte',
        null,
      ]),
    })

    expect(readLastReasons(storage)).toEqual([{ reason: 'NOT_FOUND', tried: 5 }])
    expect(readLastReasons(null)).toEqual([])
    expect(readLastReasons(fakeStorage({ 'repas:last-reasons': '{pas du json' }))).toEqual([])
  })
})

describe('la mesure de la disponibilité (diagnostic)', () => {
  /** La page de recherche inventée, avec une étiquette de disponibilité par produit (2 : bientôt disponible quand le stock est nul). */
  const labelled = fixture('recherche-farine.html')
    .replace(
      /("iQteDisponible": 0,)/,
      '$1\n          "eDisponibilite": 2,\n          "sLibelleDisponibilite": "Bientôt disponible",',
    )
    .replace(/("iQteDisponible": (?:12|5|3|8),)/g, '$1\n          "eDisponibilite": 1,')

  it('lit l’étiquette et la mention « Bientôt disponible » de la fiche d’un produit', () => {
    const { products } = extractProducts(labelled)
    const candidates = products.map((product) => toCandidate(product))

    expect(
      candidates.map((candidate) => [
        candidate.stock,
        candidate.availability,
        candidate.comingSoon,
      ]),
    ).toEqual([
      [12, 1, false],
      [0, 2, true],
      [5, 1, false],
      [3, 1, false],
      [8, 1, false],
    ])
  })

  it('sans étiquette (la fixture d’avant), tout est lisible comme absent', () => {
    const candidates = extractProducts(fixture('recherche-farine.html')).products.map((product) =>
      toCandidate(product),
    )

    expect(
      candidates.every((candidate) => candidate.availability === null && !candidate.comingSoon),
    ).toBe(true)
  })

  it('la répartition ne contient que des nombres : stock nul, positif, illisible, valeurs de l’étiquette, « Bientôt disponible »', () => {
    const candidates = extractProducts(labelled).products.map((product) => toCandidate(product))

    expect(availabilityFacts(candidates)).toEqual({
      sampled: 5,
      zeroStock: 1,
      stocked: 4,
      unreadable: 0,
      labels: [
        { value: 1, count: 4 },
        { value: 2, count: 1 },
      ],
      noLabel: 0,
      comingSoon: 1,
    })
  })

  it('l’échantillon est de 12 produits au plus ; sans résultat, rien', () => {
    const many = Array.from({ length: 30 }, (_value, index) => ({
      ...toCandidate(extractProducts(labelled).products[0] as never),
      id: String(1000100 + index),
    }))

    expect(availabilityFacts(many)?.sampled).toBe(12)
    expect(availabilityFacts([])).toBeNull()
  })

  it('une étiquette hors bornes ou décimale compte comme illisible, jamais comme une valeur', () => {
    const base = toCandidate(extractProducts(labelled).products[0] as never)

    const facts = availabilityFacts([
      { ...base, availability: 123456 },
      { ...base, availability: 1.5 },
      { ...base, availability: null },
      { ...base, availability: 3 },
    ])

    expect(facts?.labels).toEqual([{ value: 3, count: 1 }])
    expect(facts?.noLabel).toBe(3)
  })

  it('le diagnostic réel donne la répartition et les raisons du dernier envoi, sans le moindre libellé', async () => {
    // Given : le vrai adaptateur sur une page qui porte l'étiquette ; un envoi précédent a gardé ses raisons
    const site = fakeSite(() => ({ body: labelled }))
    const adapter = new LeclercAdapter(site.deps)
    const storage = fakeStorage({
      'repas:last-reasons': JSON.stringify([
        { reason: 'NOT_FOUND', tried: 5 },
        { reason: 'OUT_OF_STOCK', tried: 1 },
      ]),
    })

    // When
    const { probes } = await runChecks(
      { adapter, agentVersion: '0.5.0', storage, wakeLock: null, originReplaced: true },
      () => undefined,
    )
    const text = probeLines(probes).join('\n')

    // Then
    expect(text).toContain(
      'Disponibilité de l’échantillon (5 produits) : iQteDisponible à 0 : 1, positif : 4, illisible : 0',
    )
    expect(text).toContain(
      'eDisponibilite (valeur : produits) : 1 : 4, 2 : 1 ; absente ou illisible : 0 ; « Bientôt disponible » : 1',
    )
    expect(text).toContain(
      'Dernier envoi, produits habituels écartés : 1 : introuvable (5 recherches) ; 2 : en rupture (1 recherche)',
    )
    // Les libellés de catalogue des listes de produits (DRV-647, 0.38.0) sont voulus ; aucun autre.
    expect(
      text
        .split('\n')
        .filter((line) => !line.includes('Libellés de la liste'))
        .join('\n'),
    ).not.toContain('Farine')
  })
})
