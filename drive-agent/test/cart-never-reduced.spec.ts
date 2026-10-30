// Ticket M de l'audit du 2026-10-18 (H14) : Repas ne vide pas et ne réduit jamais le panier de l'utilisateur. Un produit du plan déjà au
// panier en plus grande quantité que celle du plan reste tel quel (la quantité n'est plus « absolue » vers le bas) ; la quantité
// que la recherche donne est lue (`iQuantitePanier`), à défaut la dernière réponse du panier, et ce qui est conservé est dit à la fin.
// L'interface, l'adaptateur et le stockage sont simulés : aucun réseau.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { guidedChoice, putInCart, RUN_PREFIX, settleKnownLine } from '../src/flow'
import type { ChooserAnswer, ChooserProps } from '../src/ui'
import {
  candidate,
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  fresh,
  home,
  RUN_ID,
  known,
  makeFlow,
  plan,
  product,
} from './flow-helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

const noQuestion = () => Promise.reject(new Error('aucune question attendue'))

describe('putInCart : la quantité du plan ne réduit jamais le panier', () => {
  it('écrit la quantité voulue quand le panier a moins (ou rien)', async () => {
    // Given : 1 exemplaire déjà au panier, 3 voulus
    const { adapter, writes } = fakeAdapter({ '1000001': { inCart: 1 } })

    // When
    const done = await putInCart(adapter, candidate('1000001', { inCart: 1 }), 3)

    // Then
    expect(writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(done).toEqual({ obtained: 3, note: null })
  })

  it('n’écrit rien quand le panier a déjà plus que le plan : la quantité du panier est gardée, et dite', async () => {
    // Given : 5 déjà au panier, 2 voulus
    const { adapter, writes, calls } = fakeAdapter({ '1000001': { inCart: 5 } })

    // When
    const done = await putInCart(adapter, candidate('1000001', { inCart: 5 }), 2)

    // Then : pas une requête, la quantité rendue est celle que le panier garde
    expect(writes).toEqual([])
    expect(calls).toEqual([])
    expect(done).toEqual({ obtained: 5, note: { kind: 'KEPT', wanted: 2, inCart: 5 } })
  })

  it('n’écrit rien non plus quand le panier a exactement la quantité voulue, et ne le mentionne pas', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': { inCart: 2 } })

    const done = await putInCart(adapter, candidate('1000001', { inCart: 2 }), 2)

    expect(writes).toEqual([])
    expect(done).toEqual({ obtained: 2, note: null })
  })

  it('une quantité de panier au-delà de 99 n’est jamais ramenée à 99', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': { inCart: 120 } })

    const done = await putInCart(adapter, candidate('1000001', { inCart: 120 }), 3)

    expect(writes).toEqual([])
    expect(done.obtained).toBe(120)
  })

  it('un stock plus petit que la quantité déjà au panier ne la réduit pas non plus', async () => {
    // Given : 4 au panier, 6 voulus, mais le site n'en propose plus que 2 (l'adaptateur plafonne au stock)
    const { adapter, writes } = fakeAdapter({ '1000001': { inCart: 4, stock: 2 } })

    // When
    const done = await putInCart(adapter, candidate('1000001', { inCart: 4, stock: 2 }), 6)

    // Then : écrire 2 réduirait le panier de 4 à 2
    expect(writes).toEqual([])
    expect(done.obtained).toBe(4)
  })

  it('quantité illisible dans la recherche : à défaut, la dernière réponse du panier fait plancher, et la mention le dit', async () => {
    // Given : la recherche ne dit pas ce que le panier contient ; la dernière réponse du panier disait 4
    const { adapter, writes } = fakeAdapter(
      { '1000001': { inCart: null } },
      { lastCart: { '1000001': 4 } },
    )

    // When : le plan veut 2
    const done = await putInCart(adapter, candidate('1000001', { inCart: null }), 2)

    // Then : pas plus bas que 4
    expect(writes).toEqual([])
    expect(done).toEqual({ obtained: 4, note: { kind: 'UNREADABLE', wanted: 2, inCart: 4 } })
  })

  it('quantité illisible, plan plus grand que la dernière réponse du panier : le plan est écrit, la mention reste', async () => {
    const { adapter, writes } = fakeAdapter(
      { '1000001': { inCart: null } },
      { lastCart: { '1000001': 1 } },
    )

    const done = await putInCart(adapter, candidate('1000001', { inCart: null }), 3)

    expect(writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(done).toEqual({ obtained: 3, note: { kind: 'UNREADABLE', wanted: 3, inCart: 1 } })
  })

  it('quantité illisible et rien dans la dernière réponse : le plan est écrit comme avant, et la mention dit qu’on ne sait pas', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': { inCart: null } })

    const done = await putInCart(adapter, candidate('1000001', { inCart: null }), 2)

    expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
    expect(done).toEqual({ obtained: 2, note: { kind: 'UNREADABLE', wanted: 2, inCart: null } })
  })

  it('la quantité lue dans la recherche prime sur la dernière réponse du panier', async () => {
    // Given : la recherche (la plus récente) dit 1, une ancienne réponse du panier disait 6
    const { adapter, writes } = fakeAdapter(
      { '1000001': { inCart: 1 } },
      { lastCart: { '1000001': 6 } },
    )

    const done = await putInCart(adapter, candidate('1000001', { inCart: 1 }), 2)

    expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
    expect(done.note).toBeNull()
  })

  describe('un adaptateur qui sait lire le panier (readCartQuantity, DRV-732)', () => {
    /** Le fake habituel, avec une lecture du panier en plus : `read` donne la quantité lue, `reads` compte ses appels. */
    function readingAdapter(read: number | null | Error) {
      const base = fakeAdapter({ '1000001': { inCart: null } })
      const reads: string[] = []
      const adapter = {
        ...base.adapter,
        readCartQuantity: (id: string) => {
          reads.push(id)
          return read instanceof Error ? Promise.reject(read) : Promise.resolve(read)
        },
      }
      return { adapter, reads, writes: base.writes }
    }

    it('la quantité lue dans le panier est CONNUE : le plan est écrit, sans la mention « illisible »', async () => {
      const { adapter, reads, writes } = readingAdapter(0)

      const done = await putInCart(adapter, candidate('1000001', { inCart: null }), 2)

      expect(reads).toEqual(['1000001'])
      expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
      expect(done).toEqual({ obtained: 2, note: null })
    })

    it('le panier a plus que le plan : rien n’est écrit, la mention est « conservé » et jamais « illisible »', async () => {
      const { adapter, writes } = readingAdapter(5)

      const done = await putInCart(adapter, candidate('1000001', { inCart: null }), 2)

      expect(writes).toEqual([])
      expect(done).toEqual({ obtained: 5, note: { kind: 'KEPT', wanted: 2, inCart: 5 } })
    })

    it('le panier a exactement la quantité voulue : rien n’est écrit, aucune mention', async () => {
      const { adapter, writes } = readingAdapter(2)

      const done = await putInCart(adapter, candidate('1000001', { inCart: null }), 2)

      expect(writes).toEqual([])
      expect(done).toEqual({ obtained: 2, note: null })
    })

    it('la quantité de la ligne reste illisible dans le panier : la mention « illisible » comme avant, jamais une quantité inventée', async () => {
      const { adapter, writes } = readingAdapter(null)

      const done = await putInCart(adapter, candidate('1000001', { inCart: null }), 2)

      expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
      expect(done).toEqual({ obtained: 2, note: { kind: 'UNREADABLE', wanted: 2, inCart: null } })
    })

    it('la quantité donnée par la recherche prime : le panier n’est pas lu', async () => {
      const { adapter, reads, writes } = readingAdapter(9)

      const done = await putInCart(adapter, candidate('1000001', { inCart: 1 }), 2)

      expect(reads).toEqual([])
      expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
      expect(done.note).toBeNull()
    })

    it('une lecture qui échoue fait échouer la ligne comme une écriture (rien n’est écrit)', async () => {
      const { adapter, writes } = readingAdapter(new Error('panier injoignable'))

      await expect(putInCart(adapter, candidate('1000001', { inCart: null }), 2)).rejects.toThrow(
        'panier injoignable',
      )
      expect(writes).toEqual([])
    })
  })

  it('rend ce que le panier a gardé quand il garde moins que la demande', async () => {
    const { adapter } = fakeAdapter({ '1000001': { inCart: 0, obtained: () => 1 } })

    const done = await putInCart(adapter, candidate('1000001', { inCart: 0 }), 4)

    expect(done).toEqual({ obtained: 1, note: null })
  })
})

describe('settleKnownLine : un produit déjà au panier en plus grande quantité', () => {
  it('garde la quantité du panier : 5 déjà au panier pour un plan de 2, aucune écriture, ADDED à 5', async () => {
    // Given
    const { adapter, calls, writes } = fakeAdapter({ '1000001': { inCart: 5 } })

    // When
    const verdict = await settleKnownLine(known('farine', [product('1000001', 2)]), {
      adapter,
      askQuantity: noQuestion,
    })

    // Then : une recherche (le stock et la quantité), aucune écriture
    expect(calls).toEqual(['search 1000001'])
    expect(writes).toEqual([])
    expect(verdict).toEqual({
      kind: 'done',
      line: {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '1000001',
        quantity: 5,
        usedRank: 1,
      },
      cart: { kind: 'KEPT', wanted: 2, inCart: 5 },
    })
  })

  it('met le plan quand il est plus grand que le panier : 1 déjà, 3 voulus', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': { inCart: 1 } })

    const verdict = await settleKnownLine(known('farine', [product('1000001', 3)]), {
      adapter,
      askQuantity: noQuestion,
    })

    expect(writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(verdict).toMatchObject({ kind: 'done', line: { quantity: 3 } })
    expect(verdict).not.toHaveProperty('cart')
  })

  it('juge chaque produit sur sa propre quantité : le produit de secours déjà au panier garde la sienne', async () => {
    // Given : le préféré est en rupture et le panier le refuse ; le produit de secours est déjà là en 4
    const { adapter, writes } = fakeAdapter({
      '1000001': { stock: 0, obtained: () => 0 },
      '1000002': { inCart: 4 },
    })

    // When
    const verdict = await settleKnownLine(
      known('farine', [product('1000001', 1), product('1000002', 2)]),
      { adapter, askQuantity: noQuestion },
    )

    // Then : une seule tentative pour le préféré, rien d'écrit pour le produit de secours
    expect(writes).toEqual([{ id: '1000001', quantity: 1 }])
    expect(verdict).toMatchObject({
      kind: 'done',
      line: { productId: '1000002', quantity: 4, usedRank: 2, unavailableIds: ['1000001'] },
      cart: { kind: 'KEPT', wanted: 2, inCart: 4 },
    })
  })

  it('un nombre recalculé sur le contenu lu en direct est lui aussi plafonné par le panier : « wanted » est le nombre mis au panier', async () => {
    // Given : le contenu en direct donne 10 produits (plan : 1), mais 12 sont déjà au panier
    const withContent = {
      ...known('farine', [
        { ...product('1000001', 1), content: { value: 1000, unit: 'g' as const } },
      ]),
      needed: { quantity: 1, unitSymbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 } as const,
    }
    const { adapter, writes } = fakeAdapter({
      '1000001': { inCart: 12, content: { value: 100, unit: 'g' } },
    })

    // When
    const verdict = await settleKnownLine(withContent, { adapter, askQuantity: noQuestion })

    // Then
    expect(writes).toEqual([])
    expect(verdict).toMatchObject({
      line: { quantity: 12 },
      change: { planned: 1, live: 10 },
      cart: { kind: 'KEPT', wanted: 10, inCart: 12 },
    })
  })
})

describe('un passage : la quantité du panier est gardée et dite à la fin', () => {
  it('5 déjà au panier pour un plan de 2 : le résultat dit 5, l’écran de fin le dit, et rien n’est écrit', async () => {
    // Given
    const { adapter, writes } = fakeAdapter({ '1000001': { inCart: 5 } })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([known('farine', [product('1000001', 2)])]))

    // Then
    expect(writes).toEqual([])
    expect(expectConform(sent[0]).lines).toEqual([
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '1000001',
        quantity: 5,
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
        kept: [{ name: 'Farine', wanted: 2, inCart: 5 }],
      },
    ])
  })

  it('une quantité illisible est signalée à part, avec ce que la dernière réponse du panier disait', async () => {
    // Given : le plan veut 2 farines, la recherche ne dit rien, la dernière réponse du panier disait 4
    const { adapter, writes } = fakeAdapter(
      { '1000001': { inCart: null } },
      { lastCart: { '1000001': 4 } },
    )
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([known('farine', [product('1000001', 2)])]))

    // Then
    expect(writes).toEqual([])
    expect(expectConform(sent[0]).lines).toMatchObject([{ outcome: 'ADDED', quantity: 4 }])
    expect(screens.propsOf('end')[0]).toMatchObject({
      unreadable: [{ name: 'Farine', atLeast: 4 }],
    })
    expect(screens.propsOf('end')[0]).not.toHaveProperty('kept')
  })

  it('sans quantité lisible ni réponse du panier, le plan est écrit et la fin dit qu’on ne sait pas', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': { inCart: null } })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(plan([known('farine', [product('1000001', 2)])]))

    expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
    expect(screens.propsOf('end')[0]).toMatchObject({
      unreadable: [{ name: 'Farine', atLeast: null }],
    })
  })

  it('un passage sans rien de tel n’ajoute ni « kept » ni « unreadable » à l’écran de fin', async () => {
    const { adapter } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(plan([known('farine', [product('1000001', 2)])]))

    expect(screens.screens()).not.toContain('end')
  })
})

describe('phase B : un produit choisi déjà au panier en plus grande quantité', () => {
  const FOUND = { poivre: ['2000001'] }
  const pepper = {
    ...fresh('poivre'),
    needed: { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
  } as const
  const content = { value: 500, unit: 'g' } as const

  async function choose(inCart: number | null) {
    const shelf = { '2000001': { label: 'Poivre noir de test', content, inCart } }
    const { adapter, writes } = fakeAdapter(shelf, { found: FOUND })
    const chooser = (props: ChooserProps): Promise<ChooserAnswer> => {
      const zone = document.body.appendChild(document.createElement('div'))
      return new Promise((resolve) => {
        props.mount(zone, (value) => resolve({ kind: 'content', value }))
        zone.querySelector<HTMLButtonElement>('li.candidate button')?.click()
      })
    }
    const screens = fakeUi({ chooser })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter, phaseB: guidedChoice })
    await flow.start(plan([pepper]))
    return { writes, sent, screens }
  }

  it('garde la quantité du panier : 800 g demandés, 500 g par produit (2), 3 déjà au panier : rien n’est écrit, CHOSEN à 3', async () => {
    const { writes, sent, screens } = await choose(3)

    expect(writes).toEqual([])
    expect(expectConform(sent[0]).lines).toMatchObject([{ outcome: 'CHOSEN', quantity: 3 }])
    expect(screens.propsOf('end')[0]).toMatchObject({
      kept: [{ name: 'Poivre', wanted: 2, inCart: 3 }],
    })
  })

  it('un panier qui a moins que le calcul reçoit le calcul', async () => {
    const { writes, sent } = await choose(1)

    expect(writes).toEqual([{ id: '2000001', quantity: 2 }])
    expect(expectConform(sent[0]).lines).toMatchObject([{ outcome: 'CHOSEN', quantity: 2 }])
  })

  it('une quantité illisible est signalée à la fin', async () => {
    const { writes, screens } = await choose(null)

    expect(writes).toEqual([{ id: '2000001', quantity: 2 }])
    expect(screens.propsOf('end')[0]).toMatchObject({
      unreadable: [{ name: 'Poivre', atLeast: null }],
    })
  })
})

describe('la reprise après un rechargement', () => {
  it('la mention survit à un rechargement de la page : elle figure à la fin du passage repris', async () => {
    // Given : un premier passage interrompu (page rechargée) après la farine, dont le panier avait déjà plus que le plan
    const storage = fakeStorage()
    const shelf = { '1000001': { inCart: 5 }, '1000003': {} }
    const first = fakeAdapter(shelf, {
      before: (call) =>
        call === 'search 1000003' ? new Promise<void>(() => undefined) : undefined,
    })
    const lines = () => [
      known('farine', [product('1000001', 2)]),
      known('sucre', [product('1000003')]),
    ]
    void makeFlow({ ui: fakeUi().ui, adapter: first.adapter, storage }).flow.start(plan(lines()))
    await vi.waitFor(() =>
      expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toContain('"carts":[{'),
    )

    // When : la page rechargée reprend
    const second = fakeAdapter(shelf)
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow } = makeFlow({ ui: screens.ui, adapter: second.adapter, storage })
    await flow.start(plan(lines()))

    // Then : la farine n'est pas refaite, mais sa mention est là
    expect(second.writes).toEqual([{ id: '1000003', quantity: 1 }])
    expect(screens.propsOf('end')[0]?.kept).toEqual([{ name: 'Farine', wanted: 2, inCart: 5 }])
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

  it('un état ancien, sans « carts », se reprend comme avant', async () => {
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: fakeAdapter().adapter,
      storage: storedState(),
    })

    await flow.start(plan([home('sel')]))

    expect(screens.propsOf('resume')).toEqual([{ done: 1, total: 1 }])
    expect(screens.screens()).not.toContain('end')
  })

  it.each([
    ['pas une liste', 'oui'],
    ['une entrée qui n’est pas un objet', [3]],
    ['un genre inconnu', [{ ingredientSlug: 'sel', kind: 'AUTRE', wanted: 1, inCart: 2 }]],
    [
      'une quantité voulue hors des bornes',
      [{ ingredientSlug: 'sel', kind: 'KEPT', wanted: 100, inCart: 200 }],
    ],
    [
      'une quantité du panier fractionnaire',
      [{ ingredientSlug: 'sel', kind: 'KEPT', wanted: 1, inCart: 1.5 }],
    ],
    [
      'une quantité conservée sans nombre',
      [{ ingredientSlug: 'sel', kind: 'KEPT', wanted: 1, inCart: null }],
    ],
    [
      'un identifiant qui n’est pas du texte',
      [{ ingredientSlug: 4, kind: 'KEPT', wanted: 1, inCart: 2 }],
    ],
  ])('ignore un état dont les mentions sont mal formées (%s)', async (_name, carts) => {
    const screens = fakeUi()
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: fakeAdapter().adapter,
      storage: storedState({ carts }),
    })

    await flow.start(plan([home('sel')]))

    expect(screens.screens()[0]).toBe('progress')
  })

  it('une mention d’un ingrédient qui n’est pas dans le plan n’est pas affichée', async () => {
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: fakeAdapter().adapter,
      storage: storedState({
        carts: [{ ingredientSlug: 'inconnu', kind: 'KEPT', wanted: 1, inCart: 2 }],
      }),
    })

    await flow.start(plan([home('sel')]))

    expect(screens.screens()).not.toContain('end')
  })
})
