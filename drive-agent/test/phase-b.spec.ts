// La phase B (DRV-306, variante P2) : le choix guidé d'un produit pour chaque ligne à choisir. L'interface est simulée ; la liste de
// produits, elle, est la vraie (elle se monte dans un nœud de jsdom) pour éprouver ce que l'utilisateur voit et touche. Aucun réseau.
import { afterEach, describe, expect, it } from 'vitest'

import type { PlanLine, ResultLine } from '../protocol'
import { guidedChoice, labelOf, MAX_CANDIDATES } from '../src/flow'
import { LeclercError } from '../src/leclerc'
import type { ChooserAnswer, ChooserProps, PlacementProps, QuantityProps } from '../src/ui'
import {
  candidate,
  expectConform,
  fakeAdapter,
  fakeUi,
  fresh,
  home,
  known,
  makeFlow,
  plan,
  product,
  type ShelfItem,
} from './flow-helpers'
import { backAcceptsLabel } from './back-label-rules'

afterEach(() => {
  document.body.innerHTML = ''
})

const HOSTILE = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>'

const SHELF: Record<string, ShelfItem> = {
  '2000001': {
    label: 'Poivre noir moulu de test',
    label2: '500 g',
    content: { value: 500, unit: 'g' },
    price: 258,
    perMeasure: { cents: 516, unit: 'kg' },
  },
  '2000002': {
    label: 'Poivre blanc de test',
    label2: '1 kg',
    content: { value: 1000, unit: 'g' },
    price: 499,
    promo: 450,
  },
  '2000003': { label: 'Poivre en grains de test', content: { value: 250, unit: 'g' }, stock: 0 },
  '2000004': { label: 'Mélange mystère de test' },
}
const FOUND = { poivre: ['2000001', '2000002', '2000003', '2000004'] }

/** Un ingrédient à choisir qui demande 800 g. */
const pepper = (extra: Partial<PlanLine> = {}): PlanLine => ({
  ...fresh('poivre'),
  needed: { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
  ...extra,
})

// —— L'utilisateur devant la liste ——————————————————————————————————————————————————————————————————————————————————————————————

interface View {
  props: ChooserProps
  zone: HTMLElement
  answered: Promise<ChooserAnswer>
  conclude: (value: unknown) => void
  disposed: () => boolean
}

function open(props: ChooserProps): View {
  // Dans la page : un clic sur une case n'envoie son évènement « change » que si la case est dans le document.
  const zone = document.body.appendChild(document.createElement('div'))
  let conclude: (value: unknown) => void = () => undefined
  const answered = new Promise<ChooserAnswer>((resolve) => {
    conclude = (value) => resolve({ kind: 'content', value })
  })
  const dispose = props.mount(zone, conclude)
  let disposed = false
  return {
    props,
    zone,
    answered,
    conclude,
    disposed: () => {
      if (!disposed) {
        disposed = true
        if (dispose) dispose()
      }
      return disposed
    },
  }
}

const rows = (zone: HTMLElement) => [...zone.querySelectorAll<HTMLElement>('li.candidate')]
const nameOf = (row: HTMLElement) => row.querySelector('.name')?.textContent ?? ''
const buttonOf = (zone: HTMLElement, name: string) => {
  const row = rows(zone).find((item) => nameOf(item).includes(name))
  const button = row?.querySelector('button')
  if (!button)
    throw new Error(`Pas de produit « ${name} » parmi ${rows(zone).map(nameOf).join(', ')}`)
  return button
}
const choose = (zone: HTMLElement, name: string) => buttonOf(zone, name).click()
/** « Chercher autre chose » : écrit `query` dans le champ de recherche de la liste et le soumet. */
const search = (view: View, query: string) => {
  const input = view.zone.querySelector<HTMLInputElement>('#chercher')
  if (!input) throw new Error('champ absent')
  input.value = query
  view.zone.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
}

/** Les gestes de l'utilisateur, un par affichage de la liste : un geste rend sa réponse, ou touche la liste puis attend sa réponse. */
type Step = (view: View) => ChooserAnswer | void | Promise<ChooserAnswer | void>

function session(...steps: Step[]) {
  const views: View[] = []
  const queue = [...steps]
  const chooser = async (props: ChooserProps): Promise<ChooserAnswer> => {
    const view = open(props)
    views.push(view)
    const step = queue.shift()
    if (!step) throw new Error('La liste est affichée une fois de trop')
    const answer = await step(view)
    return answer ?? view.answered
  }
  return { chooser, views, left: () => queue.length }
}

function run(
  line: PlanLine,
  steps: Step[],
  options: {
    found?: Record<string, string[]>
    shelf?: Record<string, ShelfItem>
    before?: (call: string) => void | Promise<void>
    quantity?: (props: QuantityProps) => number | null
    others?: PlanLine[]
    /** La réponse à « Que faites-vous de ce produit ? » (`null` : revenir à la liste). */
    placementAnswer?: 'PRIMARY' | 'FALLBACK' | 'ONCE' | null
    /** La réponse de l'utilisateur devant la demande de vérification de l'anti-robot (ticket K). */
    challenge?: () => 'resume' | 'stop'
  } = {},
) {
  const placements: PlacementProps[] = []
  const adapter = fakeAdapter(options.shelf ?? SHELF, {
    found: options.found ?? FOUND,
    ...(options.before && { before: options.before }),
  })
  const user = session(...steps)
  const screens = fakeUi({
    chooser: user.chooser,
    placement: (props) => {
      placements.push(props)
      return options.placementAnswer === undefined ? 'PRIMARY' : options.placementAnswer
    },
    ...(options.quantity && { quantity: options.quantity }),
    ...(options.challenge && { challenge: options.challenge }),
  })
  const { flow, sent } = makeFlow({
    ui: screens.ui,
    adapter: adapter.adapter,
    phaseB: guidedChoice,
  })
  const start = () => flow.start(plan([line, ...(options.others ?? [])]))
  return { start, adapter, screens, user, sent, flow, placements }
}

const lineOf = (message: { lines: ResultLine[] } | undefined, slug = 'poivre') =>
  message?.lines.find((item) => item.ingredientSlug === slug)

// —— Choisir un produit ———————————————————————————————————————————————————————————————————————————————————————————————————

describe('un nouvel ingrédient', () => {
  it('cherche son nom, montre la liste, met au panier le nombre calculé (800 g demandés, 500 g par produit : 2) et le prend pour préféré sans question', async () => {
    // Given
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir moulu')])

    // When
    await test.start()

    // Then
    expect(test.adapter.calls).toEqual(['find poivre', 'cart 2000001 2'])
    expect(test.screens.screens()).toEqual(['summary', 'progress', 'chooser', 'progress', 'end'])
    expect(expectConform(test.sent[0])).toMatchObject({ outcome: 'completed' })
    expect(lineOf(test.sent[0])).toEqual({
      ingredientSlug: 'poivre',
      outcome: 'CHOSEN',
      quantity: 2,
      placement: 'PRIMARY',
      product: {
        id: '2000001',
        label: 'Poivre noir moulu de test 500 g',
        content: { value: 500, unit: 'g' },
        price: { cents: 258, perMeasure: { cents: 516, unit: 'kg' } },
      },
    })
  })

  it('cherche la requête de la ligne (« searchQuery ») plutôt que son nom', async () => {
    const test = run(
      pepper({ searchQuery: 'poivre noir' }),
      [(view) => choose(view.zone, 'Poivre')],
      {
        found: { 'poivre noir': ['2000001'] },
      },
    )

    await test.start()

    expect(test.adapter.calls[0]).toBe('find poivre noir')
    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN' })
  })

  it('montre pour chaque produit son libellé, son contenu, son prix, son prix à l’unité de mesure, la promotion et le nombre à mettre au panier', async () => {
    const test = run(pepper(), [() => ({ kind: 'skip' })])

    await test.start()

    const [first, second] = rows(test.user.views[0]?.zone ?? document.createElement('div'))
    expect(first?.textContent).toContain('Poivre noir moulu de test')
    expect(first?.textContent).toContain('500 g · 2,58 € · 5,16 € / kg')
    expect(first?.textContent).toContain('800 g demandés, 500 g par produit : 2')
    expect(second?.textContent).toContain('1 kg · 4,99 €')
    expect(second?.textContent).toContain('En promotion : 4,50 €')
    expect(second?.textContent).toContain('800 g demandés, 1 kg par produit : 1')
  })

  it('montre la quantité demandée en haut de la liste', async () => {
    const test = run(pepper(), [() => ({ kind: 'skip' })])

    await test.start()

    expect(test.user.views[0]?.zone.textContent).toContain('Il vous faut : 800 g.')
    expect(test.user.views[0]?.props).toMatchObject({ ingredient: 'Poivre', position: 1, total: 1 })
  })

  it('un produit qui est unique dans son paquet : « 2 paquets » demandés font 2 produits, quel que soit le contenu', async () => {
    const line = pepper({
      needed: { quantity: 2, unitSymbol: 'paquet', dimension: 'PACKAGE', baseFactor: 1 },
    })
    const test = run(line, [(view) => choose(view.zone, 'Poivre noir')])

    await test.start()

    expect(test.adapter.calls).toContain('cart 2000001 2')
    expect(test.user.views[0]?.zone.textContent).toContain(
      'Demandé : 2 paquet. À mettre au panier : 2.',
    )
  })

  it('jamais plus que le stock : la quantité rendue est celle que le panier a gardée', async () => {
    const shelf = { ...SHELF, '2000001': { ...SHELF['2000001'], obtained: () => 1 } }
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')], { shelf })

    await test.start()

    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN', quantity: 1 })
  })

  it('affiche au plus huit produits', async () => {
    const ids = Array.from({ length: 12 }, (_value, index) => String(3000001 + index))
    const test = run(pepper(), [() => ({ kind: 'skip' })], { found: { poivre: ids }, shelf: {} })

    await test.start()

    expect(rows(test.user.views[0]?.zone ?? document.createElement('div'))).toHaveLength(
      MAX_CANDIDATES,
    )
  })
})

describe('le contenu est inconnu', () => {
  it('ouvre l’écran « Quantité à vérifier » et fixe la quantité saisie', async () => {
    // Given : le produit n'a pas de contenu lisible
    const asked: QuantityProps[] = []
    const test = run(pepper(), [(view) => choose(view.zone, 'Mélange mystère')], {
      quantity: (props) => {
        asked.push(props)
        return 3
      },
    })

    // When
    await test.start()

    // Then
    expect(asked).toEqual([
      { ingredient: 'Poivre', productLabel: 'Mélange mystère de test', packs: null },
    ])
    expect(test.adapter.calls).toEqual(['find poivre', 'cart 2000004 3'])
    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN', quantity: 3 })
    expect(lineOf(test.sent[0])).not.toHaveProperty('product.content')
    expect(expectConform(test.sent[0])).toBeTruthy()
  })

  it('sans quantité demandée dans le plan, demande aussi la quantité', async () => {
    const asked: QuantityProps[] = []
    const { needed: _needed, ...withoutNeed } = pepper()
    const test = run(withoutNeed, [(view) => choose(view.zone, 'Poivre noir')], {
      quantity: (props) => {
        asked.push(props)
        return 1
      },
    })

    await test.start()

    expect(asked).toHaveLength(1)
    expect(test.user.views[0]?.zone.textContent).toContain(
      'Contenu inconnu : vous choisirez la quantité.',
    )
  })

  it('« Passer » sur la quantité revient à la liste, sans rien mettre au panier', async () => {
    const test = run(
      pepper(),
      [(view) => choose(view.zone, 'Mélange mystère'), () => ({ kind: 'skip' })],
      { quantity: () => null },
    )

    await test.start()

    expect(test.user.views).toHaveLength(2)
    expect(test.adapter.writes).toEqual([])
    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'SKIPPED' })
  })
})

// —— Passer, en avoir toujours, annuler ——————————————————————————————————————————————————————————————————————————————————————

describe('les actions de la barre', () => {
  it('« Passer cette fois » ne change rien au panier et ne mémorise rien', async () => {
    const test = run(pepper(), [() => ({ kind: 'skip' })])

    await test.start()

    expect(test.adapter.writes).toEqual([])
    expect(lineOf(expectConform(test.sent[0]))).toEqual({
      ingredientSlug: 'poivre',
      outcome: 'SKIPPED',
    })
  })

  it('« J’en ai toujours » ne change rien au panier', async () => {
    const test = run(pepper(), [() => ({ kind: 'have' })])

    await test.start()

    expect(test.adapter.writes).toEqual([])
    expect(lineOf(expectConform(test.sent[0]))).toEqual({
      ingredientSlug: 'poivre',
      outcome: 'HAVE_AT_HOME',
    })
  })

  it('« Annuler l’envoi » rend « aborted » avec ce qui a déjà été fait', async () => {
    const adapter = fakeAdapter({ '1000001': {}, ...SHELF }, { found: FOUND })
    const user = session(() => ({ kind: 'cancel' }))
    const screens = fakeUi({ chooser: user.chooser })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: adapter.adapter,
      phaseB: guidedChoice,
    })

    await flow.start(plan([known('farine', [product('1000001')]), pepper(), fresh('sel')]))

    expect(expectConform(sent[0])).toMatchObject({ outcome: 'aborted' })
    expect(sent[0]?.lines.map((line) => [line.ingredientSlug, line.outcome])).toEqual([
      ['farine', 'ADDED'],
      ['poivre', 'UNAVAILABLE'],
      ['sel', 'UNAVAILABLE'],
    ])
    expect(adapter.writes).toEqual([{ id: '1000001', quantity: 1 }])
  })

  it('s’arrête avant la ligne suivante quand l’utilisateur a touché « Arrêter »', async () => {
    let stop = () => undefined as void
    const test = run(
      pepper(),
      [
        () => {
          stop() // « Arrêter » est touché pendant que la première ligne est traitée.
          return { kind: 'skip' }
        },
        () => ({ kind: 'skip' }),
      ],
      { others: [fresh('sel')] },
    )
    stop = test.screens.pressStop

    await test.start()

    expect(test.user.left()).toBe(1)
    expect(expectConform(test.sent[0])).toMatchObject({ outcome: 'aborted' })
    expect(lineOf(test.sent[0], 'sel')).toMatchObject({ outcome: 'UNAVAILABLE' })
  })

  it('traite les lignes dans l’ordre, avec leur compteur', async () => {
    const test = run(pepper(), [() => ({ kind: 'skip' }), () => ({ kind: 'have' })], {
      others: [fresh('sel')],
    })

    await test.start()

    expect(test.user.views.map((view) => view.props)).toMatchObject([
      { ingredient: 'Poivre', position: 1, total: 2 },
      { ingredient: 'Sel', position: 2, total: 2 },
    ])
    expect(test.sent[0]?.lines.map((line) => line.outcome)).toEqual(['SKIPPED', 'HAVE_AT_HOME'])
  })
})

// —— Produits à ne plus proposer et indisponibles ———————————————————————————————————————————————————————————————————————————————————————

describe('les produits refusés et indisponibles', () => {
  const refused = [{ id: '2000002', label: 'Poivre blanc de test 1 kg' }]

  it('un produit refusé est grisé et ne se choisit pas', async () => {
    const test = run(pepper({ rejected: refused }), [
      (view) => {
        const button = buttonOf(view.zone, 'Poivre blanc')
        expect(button.disabled).toBe(true)
        expect(button.textContent).toBe('Ne plus proposer')
        button.click()
        return { kind: 'skip' }
      },
    ])

    await test.start()

    expect(test.adapter.writes).toEqual([])
  })

  it('un produit refusé n’est jamais mis au panier, même si un message le désigne', async () => {
    const test = run(pepper({ rejected: refused }), [
      (view) => view.conclude({ type: 'choose', id: '2000002' }),
      () => ({ kind: 'skip' }),
    ])

    await test.start()

    expect(test.adapter.writes).toEqual([])
    expect(test.user.views).toHaveLength(2)
    expect(test.user.views[1]?.zone.textContent).toContain(
      'Leclerc n’a pas pu mettre ce produit au panier',
    )
  })

  it('un produit en rupture de stock est grisé et ne se choisit pas', async () => {
    const test = run(pepper(), [
      (view) => {
        const button = buttonOf(view.zone, 'Poivre en grains')
        expect(button.disabled).toBe(true)
        expect(button.textContent).toBe('Indisponible')
        return { kind: 'skip' }
      },
    ])

    await test.start()

    expect(test.adapter.writes).toEqual([])
  })

  it('un produit inconnu de la liste (message forgé) ne met rien au panier', async () => {
    const test = run(pepper(), [
      (view) => view.conclude({ type: 'choose', id: '9999999' }),
      () => ({ kind: 'skip' }),
    ])

    await test.start()

    expect(test.adapter.writes).toEqual([])
  })

  it('un message illisible est ignoré : la liste revient', async () => {
    const test = run(pepper(), [
      (view) => view.conclude('n’importe quoi'),
      () => ({ kind: 'skip' }),
    ])

    await test.start()

    expect(test.user.views).toHaveLength(2)
  })
})

describe('un produit connu devenu indisponible', () => {
  const FARINE = [
    { ...product('1000001', 1, 'Farine de test A'), content: { value: 1000, unit: 'g' as const } },
    product('1000002', 2, 'Farine de test B'),
  ]
  const shelf: Record<string, ShelfItem> = {
    ...SHELF,
    '1000001': { stock: 0 },
    '1000002': { stock: 0 },
  }
  const flour = (extra: Partial<PlanLine> = {}) => ({
    ...known('farine', FARINE),
    needed: { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT' as const, baseFactor: 1 },
    searchQuery: 'poivre',
    ...extra,
  })

  it('repasse par la phase B avec ses produits indisponibles, et montre le bandeau', async () => {
    const test = run(flour(), [() => ({ kind: 'skip' })], { shelf })

    await test.start()

    const zone = test.user.views[0]?.zone
    expect(zone?.textContent).toContain(
      'Ces produits ne sont plus disponibles : Farine de test A, Farine de test B.',
    )
    expect(zone?.textContent).toContain('Ne plus proposer Farine de test A')
    expect(test.adapter.calls.slice(0, 2)).toEqual(['search 1000001', 'search 1000002'])
  })

  it.each([
    ['PRIMARY', 'PRIMARY'],
    ['FALLBACK', 'FALLBACK'],
    ['ONCE', 'ONCE'],
  ] as const)(
    'demande le rôle du produit choisi (%s) et le rend avec les identifiants indisponibles',
    async (answer, placement) => {
      // Given
      const test = run(flour(), [(view) => choose(view.zone, 'Poivre noir')], {
        shelf,
        placementAnswer: answer,
      })

      // When
      await test.start()

      // Then
      expect(test.placements).toEqual([
        { ingredient: 'Farine', productLabel: 'Poivre noir moulu de test 500 g' },
      ])
      expect(lineOf(expectConform(test.sent[0]), 'farine')).toMatchObject({
        outcome: 'CHOSEN',
        placement,
        unavailableIds: ['1000001', '1000002'],
        quantity: 2,
      })
      expect(lineOf(test.sent[0], 'farine')).not.toHaveProperty('rejected')
    },
  )

  it('« Revenir à la liste » sur le rôle ne met rien au panier', async () => {
    const test = run(
      flour(),
      [(view) => choose(view.zone, 'Poivre noir'), () => ({ kind: 'skip' })],
      {
        shelf,
        placementAnswer: null,
      },
    )

    await test.start()

    expect(test.adapter.writes).toEqual([])
    expect(test.user.views).toHaveLength(2)
  })

  it('la case « Ne plus proposer » cochée met le produit dans « rejected », avec son libellé et son contenu', async () => {
    const test = run(
      flour(),
      [
        (view) => {
          const box = view.zone.querySelector<HTMLInputElement>('#jamais-0')
          if (!box) throw new Error('case absente')
          box.click()
          choose(view.zone, 'Poivre noir')
        },
      ],
      { shelf },
    )

    await test.start()

    expect(lineOf(expectConform(test.sent[0]), 'farine')).toMatchObject({
      outcome: 'CHOSEN',
      rejected: [{ id: '1000001', label: 'Farine de test A', content: { value: 1000, unit: 'g' } }],
    })
  })

  it('une case cochée puis décochée ne refuse rien', async () => {
    const test = run(
      flour(),
      [
        (view) => {
          const box = view.zone.querySelector<HTMLInputElement>('#jamais-1')
          box?.click()
          box?.click()
          choose(view.zone, 'Poivre noir')
        },
      ],
      { shelf },
    )

    await test.start()

    expect(lineOf(test.sent[0], 'farine')).not.toHaveProperty('rejected')
  })

  it('une case cochée reste cochée quand la liste revient après « Passer » sur la quantité', async () => {
    const test = run(
      flour(),
      [
        (view) => {
          view.zone.querySelector<HTMLInputElement>('#jamais-0')?.click()
          choose(view.zone, 'Mélange mystère')
        },
        (view) => {
          expect(view.zone.querySelector<HTMLInputElement>('#jamais-0')?.checked).toBe(true)
          return { kind: 'skip' }
        },
      ],
      { shelf, quantity: () => null },
    )

    await test.start()

    expect(lineOf(test.sent[0], 'farine')).toMatchObject({
      outcome: 'SKIPPED',
      rejected: [{ id: '1000001' }],
    })
  })

  it('« Passer cette fois » garde aussi les produits refusés cochés', async () => {
    const test = run(
      flour(),
      [
        (view) => {
          view.zone.querySelector<HTMLInputElement>('#jamais-1')?.click()
          return { kind: 'skip' }
        },
      ],
      { shelf },
    )

    await test.start()

    expect(expectConform(test.sent[0])).toBeTruthy()
    expect(lineOf(test.sent[0], 'farine')).toMatchObject({
      outcome: 'SKIPPED',
      rejected: [{ id: '1000002', label: 'Farine de test B' }],
    })
  })

  it('un autre produit demandé (« replaces ») pose aussi la question du rôle, sans bandeau ni case', async () => {
    const line = pepper({ replaces: { id: '98765', label: 'Poivre habituel de test' } })
    const test = run(line, [(view) => choose(view.zone, 'Poivre noir')], {
      placementAnswer: 'FALLBACK',
    })

    await test.start()

    expect(test.screens.screens()).toContain('placement')
    expect(test.user.views[0]?.zone.textContent).toContain(
      'Vous remplacez : Poivre habituel de test.',
    )
    expect(test.user.views[0]?.zone.querySelector('.gone')).toBeNull()
    expect(lineOf(test.sent[0])).toMatchObject({ placement: 'FALLBACK' })
    expect(lineOf(test.sent[0])).not.toHaveProperty('unavailableIds')
  })

  it('un ingrédient jamais acheté ne pose aucune question de rôle', async () => {
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')])

    await test.start()

    expect(test.screens.screens()).not.toContain('placement')
    expect(lineOf(test.sent[0])).toMatchObject({ placement: 'PRIMARY' })
  })
})

// —— Chercher autre chose ————————————————————————————————————————————————————————————————————————————————————————————————

describe('chercher autre chose', () => {
  it('relance la recherche avec le nouveau mot et montre ses résultats', async () => {
    const found = { ...FOUND, 'poivre vert': ['2000002'] }
    const test = run(
      pepper(),
      [
        async (view) => {
          search(view, '  poivre vert ')
          await new Promise((resolve) => setTimeout(resolve, 0))
          expect(rows(view.zone).map(nameOf)).toEqual(['Poivre blanc de test'])
          expect(view.zone.textContent).toContain('Résultats pour « poivre vert »')
          choose(view.zone, 'Poivre blanc')
        },
      ],
      { found },
    )

    await test.start()

    expect(test.adapter.calls).toEqual(['find poivre', 'find poivre vert', 'cart 2000002 1'])
  })

  it('rend la main pendant la recherche : tout est inactif, puis tout revient', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const test = run(
      pepper(),
      [
        async (view) => {
          search(view, 'sel')
          expect(view.zone.querySelector('input')?.disabled).toBe(true)
          expect(view.zone.textContent).toContain('Recherche en cours…')
          expect(buttonOf(view.zone, 'Poivre noir').disabled).toBe(true)
          release()
          await new Promise((resolve) => setTimeout(resolve, 0))
          expect(view.zone.querySelector('input')?.disabled).toBe(false)
          expect(buttonOf(view.zone, 'Poivre noir').disabled).toBe(false)
          expect(buttonOf(view.zone, 'Poivre en grains').disabled).toBe(true)
          return { kind: 'skip' }
        },
      ],
      { before: (call) => (call === 'find sel' ? gate : undefined) },
    )

    await test.start()

    expect(test.adapter.calls).toEqual(['find poivre', 'find sel'])
  })

  it('un champ vide ne lance aucune recherche', async () => {
    const test = run(pepper(), [
      (view) => {
        search(view, '   ')
        return { kind: 'skip' }
      },
    ])

    await test.start()

    expect(test.adapter.calls).toEqual(['find poivre'])
  })

  it('un blocage pendant la recherche arrête le passage', async () => {
    const test = run(
      pepper(),
      [
        async (view) => {
          search(view, 'sel')
          return view.answered
        },
      ],
      {
        before: (call) => {
          if (call === 'find sel') throw new LeclercError('BLOCKED')
        },
      },
    )

    await test.start()

    expect(expectConform(test.sent[0])).toMatchObject({
      outcome: 'partial',
      error: { code: 'BLOCKED' },
    })
    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'FAILED', error: 'BLOCKED' })
  })

  it('une réponse qui arrive après le départ de l’utilisateur ne touche plus la liste', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const test = run(
      pepper(),
      [
        (view) => {
          search(view, 'sel')
          return { kind: 'skip' }
        },
      ],
      { before: (call) => (call === 'find sel' ? gate : undefined) },
    )

    await test.start()
    const before = test.user.views[0]?.zone.innerHTML
    test.user.views[0]?.disposed()
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(test.user.views[0]?.zone.innerHTML).toBe(before)
  })
})

// —— Les erreurs —————————————————————————————————————————————————————————————————————————————————————————————————————————

describe('les erreurs du site', () => {
  it('une erreur réseau à la première recherche devient un message : l’utilisateur peut passer', async () => {
    const test = run(
      pepper(),
      [
        (view) => {
          expect(view.zone.querySelector('[role="alert"]')?.textContent).toBe(
            'Le site ne répond pas. Réessayez dans un instant.',
          )
          return { kind: 'skip' }
        },
      ],
      {
        before: () => {
          throw new LeclercError('NETWORK')
        },
      },
    )

    await test.start()

    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'SKIPPED' })
  })

  it('une erreur réseau en cherchant autre chose garde la liste et laisse réessayer', async () => {
    let fail = true
    const test = run(
      pepper(),
      [
        async (view) => {
          const input = view.zone.querySelector<HTMLInputElement>('#chercher')
          if (input) input.value = 'sel'
          view.zone.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
          await new Promise((resolve) => setTimeout(resolve, 0))
          expect(view.zone.querySelector('[role="alert"]')?.textContent).toContain(
            'Le site ne répond pas',
          )
          expect(rows(view.zone)).toHaveLength(4)
          expect(view.zone.querySelector('input')?.disabled).toBe(false)
          return { kind: 'skip' }
        },
      ],
      {
        before: (call) => {
          if (call === 'find sel' && fail) {
            fail = false
            throw new LeclercError('NETWORK')
          }
        },
      },
    )

    await test.start()

    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'SKIPPED' })
  })

  it('une erreur réseau en mettant au panier ne fait échouer que la ligne', async () => {
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')], {
      others: [home('sel')],
      before: (call) => {
        if (call.startsWith('cart')) throw new LeclercError('NETWORK')
      },
    })

    await test.start()

    expect(lineOf(expectConform(test.sent[0]))).toEqual({
      ingredientSlug: 'poivre',
      outcome: 'FAILED',
      error: 'NETWORK',
    })
    expect(lineOf(test.sent[0], 'sel')).toMatchObject({ outcome: 'HAVE_AT_HOME' })
  })

  it('une réponse trop lente (délai dépassé) devient un message qui le dit, pas « le site ne répond pas » : l’utilisateur peut passer', async () => {
    const test = run(
      pepper(),
      [
        (view) => {
          expect(view.zone.querySelector('[role="alert"]')?.textContent).toBe(
            'Leclerc met trop de temps à répondre. Réessayez dans un instant.',
          )
          return { kind: 'skip' }
        },
      ],
      {
        before: () => {
          throw new LeclercError('NETWORK', null, 'REQUEST_TIMEOUT')
        },
      },
    )

    await test.start()

    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'SKIPPED' })
  })

  it('un défi de l’anti-robot pendant une recherche suspend le passage ; la vérification faite, la liste de la ligne revient et le choix aboutit', async () => {
    // Given : la recherche « sel » de l'utilisateur tombe sur le défi, une seule fois
    let challenged = false
    const asked: string[] = []
    const test = run(
      pepper(),
      [
        async (view) => {
          search(view, 'sel')
          return view.answered
        },
        (view) => choose(view.zone, 'Poivre noir'),
      ],
      {
        challenge: () => {
          asked.push('challenge')
          return 'resume'
        },
        before: (call) => {
          if (call === 'find sel' && !challenged) {
            challenged = true
            throw new LeclercError('BLOCKED', 200, 'CHALLENGE')
          }
        },
      },
    )

    // When
    await test.start()

    // Then : la demande a été faite une fois, la ligne est de nouveau cherchée et choisie ; rien n'a échoué
    expect(asked).toEqual(['challenge'])
    expect(test.screens.screens()).toEqual([
      'summary',
      'progress',
      'chooser',
      'challenge',
      'progress',
      'chooser',
      'progress',
      'end',
    ])
    expect(test.adapter.calls).toEqual(['find poivre', 'find sel', 'find poivre', 'cart 2000001 2'])
    expect(expectConform(test.sent[0])).toMatchObject({ outcome: 'completed' })
    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN', quantity: 2 })
  })

  it('« Arrêter » devant le défi rend la main comme avant : « partial », les lignes qui restent échouent (BLOCKED), la cause est dite', async () => {
    const test = run(pepper(), [], {
      others: [fresh('sel')],
      challenge: () => 'stop',
      before: (call) => {
        if (call.startsWith('find')) throw new LeclercError('BLOCKED', 200, 'CHALLENGE')
      },
    })

    await test.start()

    expect(expectConform(test.sent[0])).toMatchObject({
      outcome: 'partial',
      error: { code: 'BLOCKED', message: 'Leclerc a ralenti les demandes (CHALLENGE)' },
    })
    expect(
      test.sent[0]?.lines.map((line) => [line.outcome, 'error' in line ? line.error : null]),
    ).toEqual([
      ['FAILED', 'BLOCKED'],
      ['FAILED', 'BLOCKED'],
    ])
  })

  it('un blocage à la recherche d’une ligne fait échouer les lignes restantes (« BLOCKED ») et rend « partial »', async () => {
    const test = run(pepper(), [], {
      others: [fresh('sel'), fresh('huile')],
      before: (call) => {
        if (call.startsWith('find')) throw new LeclercError('BLOCKED')
      },
    })

    await test.start()

    expect(expectConform(test.sent[0])).toMatchObject({
      outcome: 'partial',
      error: { code: 'BLOCKED' },
    })
    expect(
      test.sent[0]?.lines.map((line) => [line.outcome, 'error' in line ? line.error : null]),
    ).toEqual([
      ['FAILED', 'BLOCKED'],
      ['FAILED', 'BLOCKED'],
      ['FAILED', 'BLOCKED'],
    ])
    expect(test.adapter.calls).toEqual(['find poivre'])
  })

  it('« pas connecté » arrête aussitôt : « error »', async () => {
    const test = run(pepper(), [], {
      before: () => {
        throw new LeclercError('NOT_LOGGED_IN')
      },
    })

    await test.start()

    expect(expectConform(test.sent[0])).toMatchObject({
      outcome: 'error',
      error: { code: 'NOT_LOGGED_IN' },
    })
  })

  it('un panier qui refuse le produit (quantité nulle) ramène à la liste avec un message', async () => {
    const shelf = { ...SHELF, '2000001': { ...SHELF['2000001'], obtained: () => 0 } }
    const test = run(
      pepper(),
      [(view) => choose(view.zone, 'Poivre noir'), (view) => choose(view.zone, 'Poivre blanc')],
      { shelf },
    )

    await test.start()

    expect(test.user.views[1]?.zone.querySelector('[role="alert"]')?.textContent).toContain(
      'Leclerc n’a pas pu mettre ce produit au panier',
    )
    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN', product: { id: '2000002' } })
  })
})

// —— Rien de ce que dit l'enseigne ne s'exécute ———————————————————————————————————————————————————————————————————————————

describe('un libellé hostile', () => {
  it('s’affiche tel quel dans la liste, sans rien exécuter ni créer d’élément', async () => {
    const shelf = {
      '4000001': { label: HOSTILE, label2: HOSTILE, content: { value: 500, unit: 'g' as const } },
    }
    const test = run(
      pepper(),
      [
        (view) => {
          const [row] = rows(view.zone)
          expect(row?.querySelector('img, script')).toBeNull()
          expect(nameOf(row as HTMLElement)).toBe(HOSTILE)
          expect(document.querySelector('img, script')).toBeNull()
          return { kind: 'skip' }
        },
      ],
      { shelf, found: { poivre: ['4000001'] } },
    )

    await test.start()

    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()
  })

  it('part dans le résultat comme texte, borné à 255 caractères', async () => {
    const shelf = {
      '4000002': {
        label: 'é'.repeat(300),
        label2: '500 g',
        content: { value: 500, unit: 'g' as const },
      },
    }
    const test = run(pepper(), [(view) => choose(view.zone, 'éé')], {
      shelf,
      found: { poivre: ['4000002'] },
    })

    await test.start()

    const label = (lineOf(expectConform(test.sent[0])) as { product: { label: string } }).product
      .label
    expect([...label]).toHaveLength(255)
  })
})

describe('le libellé d’un produit pour Repas', () => {
  it('joint les deux lignes de l’enseigne, sans répéter la seconde si le premier la contient', () => {
    expect(labelOf({ ...candidate('1'), label: 'Sel fin  de test', label2: '1 kg' })).toBe(
      'Sel fin de test 1 kg',
    )
    expect(labelOf({ ...candidate('1'), label: 'Sel fin de test 1 kg', label2: '1 kg' })).toBe(
      'Sel fin de test 1 kg',
    )
    expect(labelOf({ ...candidate('7'), label: '', label2: null })).toBe('Produit 7')
  })

  it('retire les caractères invisibles et de contrôle que le back refuse (sinon tout l’enregistrement des choix échoue)', () => {
    const label = labelOf({
      ...candidate('1'),
      label: 'Sel\u200B fin\u202E de\uFEFF test\u0007',
      label2: '1\u2060 kg\u2028',
    })

    expect(label).toBe('Sel fin de test 1 kg')
    expect(backAcceptsLabel(label)).toBe(true)
  })

  it('retombe sur « Produit <id> » quand le libellé n’était fait que d’invisibles', () => {
    expect(labelOf({ ...candidate('7'), label: '\u200B\uFEFF', label2: '\u202E' })).toBe(
      'Produit 7',
    )
  })

  it('part sans invisibles dans le résultat et s’affiche sans eux dans la liste, d’un produit marqué', async () => {
    // Given : un produit dont les deux lignes portent des caractères que le back refuse
    const shelf = {
      '4000003': {
        label: 'Poivre\u200B gris\u202E de\uFEFF test',
        label2: '500\u2060 g',
        content: { value: 500, unit: 'g' as const },
      },
    }
    const test = run(
      pepper(),
      [
        (view) => {
          expect(rows(view.zone).map(nameOf)).toEqual(['Poivre gris de test'])
          choose(view.zone, 'Poivre gris')
        },
      ],
      { shelf, found: { poivre: ['4000003'] } },
    )

    // When
    await test.start()

    // Then
    const message = expectConform(test.sent[0])
    const product = (lineOf(message) as { product: { label: string } }).product
    expect(product.label).toBe('Poivre gris de test 500 g')
    expect(backAcceptsLabel(product.label)).toBe(true)
  })
})

// —— Quand le nom ne répond rien : les formes dérivées (ticket D de l'audit du 2026-10-18) —————————————————————————————————————

describe('quand la recherche du nom ne répond rien', () => {
  const egg = (extra: Partial<PlanLine> = {}): PlanLine => ({
    ...fresh('oeuf'),
    name: 'Œuf',
    searchQuery: 'œuf',
    ...extra,
  })
  const shelf = { '2000010': { label: 'Oeufs frais de test', label2: '6 pièces' } }
  const statusOf = (zone: HTMLElement) => zone.querySelector('[role="status"]')?.textContent ?? ''
  const queryOf = (zone: HTMLElement) =>
    zone.querySelector<HTMLInputElement>('#chercher')?.value ?? ''

  it('essaie « oeuf » après « œuf », montre ses produits et dit laquelle des deux recherches a répondu', async () => {
    // Given : le site ne comprend « œuf » que sans ligature
    const test = run(
      egg(),
      [
        (view) => {
          expect(rows(view.zone).map(nameOf)).toEqual(['Oeufs frais de test'])
          expect(statusOf(view.zone)).toBe('Résultats pour « oeuf » (rien trouvé pour « œuf »)')
          expect(queryOf(view.zone)).toBe('oeuf')
          choose(view.zone, 'Oeufs frais')
        },
      ],
      { shelf, found: { oeuf: ['2000010'] } },
    )

    // When
    await test.start()

    // Then : deux recherches, puis l'ajout au panier du produit choisi
    expect(test.adapter.calls).toEqual(['find œuf', 'find oeuf', 'cart 2000010 1'])
    expect(lineOf(test.sent[0], 'oeuf')).toMatchObject({ outcome: 'CHOSEN' })
  })

  it('une réponse du nom lui-même ne dit rien de plus : « Résultats pour « poivre » », une seule requête', async () => {
    const test = run(pepper(), [
      (view) => {
        expect(statusOf(view.zone)).toBe('Résultats pour « poivre »')
        return { kind: 'skip' }
      },
    ])

    await test.start()

    expect(test.adapter.calls).toEqual(['find poivre'])
  })

  it('rien ne répond : « Aucun produit trouvé pour « zzqxkw ». Essayez un autre mot. », au plus 5 requêtes, le champ garde le nom', async () => {
    // Given
    const test = run(
      { ...fresh('zzqxkw'), name: 'Zzqxkw', searchQuery: 'zzqxkw' },
      [
        (view) => {
          expect(statusOf(view.zone)).toBe(
            'Aucun produit trouvé pour « zzqxkw ». Essayez un autre mot.',
          )
          expect(queryOf(view.zone)).toBe('zzqxkw')
          expect(rows(view.zone)).toHaveLength(0)
          return { kind: 'skip' }
        },
      ],
      { found: {} },
    )

    // When
    await test.start()

    // Then : le nom, puis son pluriel (la seule autre forme d'un mot inventé)
    expect(test.adapter.calls).toEqual(['find zzqxkw', 'find zzqxkws'])
    expect(lineOf(test.sent[0], 'zzqxkw')).toMatchObject({ outcome: 'SKIPPED' })
  })

  it('un nom long dont aucune forme ne répond fait 5 requêtes au plus, toutes différentes', async () => {
    const name = 'Herbes de Provence'
    const test = run({ ...fresh('herbes'), name, searchQuery: name }, [() => ({ kind: 'skip' })], {
      found: {},
    })

    await test.start()

    expect(test.adapter.calls).toHaveLength(5)
    expect(new Set(test.adapter.calls).size).toBe(5)
    expect(test.adapter.calls.every((call) => call.startsWith('find '))).toBe(true)
  })

  it('les requêtes de repli se font en série, à la suite les unes des autres', async () => {
    const test = run(egg(), [() => ({ kind: 'skip' })], { found: {} })

    await test.start()

    expect(test.adapter.maxInFlight()).toBeLessThanOrEqual(1)
  })

  it('ce que l’utilisateur tape lui-même n’est pas réécrit : une recherche sans réponse ne lance qu’une requête', async () => {
    // Given : l'utilisateur cherche « tomates » dans « Chercher autre chose », sans réponse
    const type = (view: View, query: string) => {
      const input = view.zone.querySelector<HTMLInputElement>('#chercher')
      if (!input) throw new Error('champ absent')
      input.value = query
      view.zone.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    }
    const test = run(pepper(), [
      async (view) => {
        type(view, 'tomates')
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(statusOf(view.zone)).toBe(
          'Aucun produit trouvé pour « tomates ». Essayez un autre mot.',
        )
        return { kind: 'skip' }
      },
    ])

    // When
    await test.start()

    // Then
    expect(test.adapter.calls).toEqual(['find poivre', 'find tomates'])
  })

  it('un blocage pendant une requête de repli arrête le passage, sans autre requête', async () => {
    const test = run(egg(), [() => ({ kind: 'skip' })], {
      found: {},
      before: (call) => {
        if (call === 'find oeuf') throw new LeclercError('BLOCKED', 403)
      },
    })

    await test.start()

    expect(test.adapter.calls).toEqual(['find œuf', 'find oeuf'])
    expect(test.sent[0]).toMatchObject({ outcome: 'partial' })
  })
})
