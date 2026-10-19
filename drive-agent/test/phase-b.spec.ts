// La phase B (DRV-306, variante P2) : le choix guidé d'un produit pour chaque ligne à choisir. L'interface est simulée ; la liste de
// produits, elle, est la vraie (elle se monte dans un nœud de jsdom) pour éprouver ce que l'utilisateur voit et touche. Aucun réseau.
import { afterEach, describe, expect, it } from 'vitest'

import type { PlanLine, ProductRef, ResultLine } from '../protocol'
import { guidedChoice, labelOf, MAX_CANDIDATES, productSearchForms } from '../src/flow'
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
  OUT_OF_STOCK,
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
    /** La réponse à « Toujours prendre ce produit ? » (`null` : revenir à la liste). */
    placementAnswer?: 'PRIMARY' | 'ONCE' | null
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
  it('cherche son nom, montre la liste, met au panier le nombre calculé (800 g demandés, 500 g par produit : 2) et le prend pour produit habituel sans question', async () => {
    // Given
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir moulu')])

    // When
    await test.start()

    // Then
    expect(test.adapter.calls).toEqual(['find poivre', 'cart 2000001 2'])
    expect(test.screens.screens()).toEqual(['summary', 'progress', 'chooser', 'progress'])
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
    expect(first?.textContent).toContain('500 g par produit : 2 produits.')
    expect(second?.textContent).toContain('1 kg · 4,99 €')
    expect(second?.textContent).toContain('En promotion : 4,50 €')
    expect(second?.textContent).toContain('1 kg par produit : 1 produit.')
    // La quantité demandée se dit une fois, en haut de la liste, pas sur chaque produit.
    expect(first?.textContent).not.toContain('demandé')
  })

  it('pas de ligne « En promotion » pour une promotion à zéro, et « Plus en stock. » sans nombre de produits (DRV-644)', async () => {
    const shelf = {
      ...SHELF,
      '2000001': { ...SHELF['2000001'], promo: 0 },
    }
    const test = run(pepper(), [() => ({ kind: 'skip' })], { shelf })

    await test.start()

    const [first, , out] = rows(test.user.views[0]?.zone ?? document.createElement('div'))
    expect(first?.textContent).not.toContain('En promotion')
    expect(first?.textContent).toContain('500 g par produit : 2 produits.')
    expect(out?.textContent).toContain('Plus en stock.')
    expect(out?.textContent).not.toContain('À mettre au panier')
    expect(out?.textContent).not.toContain('par produit')
  })

  describe('la taille ne s’affiche qu’une fois par produit (DRV-626)', () => {
    /** Les lignes de texte d'un produit de la liste, une par paragraphe. */
    const linesOf = (row: HTMLElement | undefined) =>
      [...(row?.querySelectorAll('p') ?? [])].map((paragraph) => paragraph.textContent)

    it('retire la seconde ligne du libellé quand elle ne fait que redire la taille', async () => {
      const test = run(pepper(), [() => ({ kind: 'skip' })])

      await test.start()

      const [first, second] = rows(test.user.views[0]?.zone ?? document.createElement('div'))
      // Le nom, la ligne du prix (avec la taille), le nombre de produits : rien d'autre
      expect(linesOf(first)).toEqual([
        'Poivre noir moulu de test',
        '500 g · 2,58 € · 5,16 € / kg',
        '500 g par produit : 2 produits.',
      ])
      expect(linesOf(second)).toEqual([
        'Poivre blanc de test',
        '1 kg · 4,99 €',
        'En promotion : 4,50 €',
        '1 kg par produit : 1 produit.',
      ])
    })

    it.each([['40g'], ['40 G'], ['40\u00a0g'], ['40 g ']])(
      'la reconnaît sous une autre écriture (« %s »)',
      async (second) => {
        const shelf = {
          '5000001': {
            label: 'Poivre de test',
            label2: second,
            content: { value: 40, unit: 'g' as const },
            price: 180,
          },
        }
        const test = run(pepper(), [() => ({ kind: 'skip' })], {
          shelf,
          found: { poivre: ['5000001'] },
        })

        await test.start()

        expect(linesOf(rows(test.user.views[0]?.zone ?? document.createElement('div'))[0])).toEqual(
          ['Poivre de test', '40 g · 1,80 €', '40 g par produit : 20 produits.'],
        )
      },
    )

    it('garde la seconde ligne quand elle dit autre chose que la taille', async () => {
      const shelf = {
        '5000002': {
          label: 'Poivre de test',
          label2: 'Lot de 2 sachets',
          content: { value: 40, unit: 'g' as const },
          price: 180,
        },
        '5000003': {
          label: 'Poivre de test bis',
          label2: '45 g',
          content: { value: 40, unit: 'g' as const },
          price: 180,
        },
      }
      const test = run(pepper(), [() => ({ kind: 'skip' })], {
        shelf,
        found: { poivre: ['5000002', '5000003'] },
      })

      await test.start()

      const [first, second] = rows(test.user.views[0]?.zone ?? document.createElement('div'))
      expect(linesOf(first)).toContain('Lot de 2 sachets')
      // Une autre taille n'est pas une répétition : elle reste (le contenu lu et le libellé se contredisent, l'utilisateur le voit)
      expect(linesOf(second)).toContain('45 g')
    })

    it('garde la seconde ligne quand le contenu est inconnu : elle est alors la seule à donner la taille', async () => {
      const shelf = { '5000004': { label: 'Poivre de test', label2: '40 g', price: 180 } }
      const test = run(pepper(), [() => ({ kind: 'skip' })], {
        shelf,
        found: { poivre: ['5000004'] },
      })

      await test.start()

      expect(linesOf(rows(test.user.views[0]?.zone ?? document.createElement('div'))[0])).toContain(
        '40 g',
      )
    })
  })

  it('montre la quantité demandée en haut de la liste', async () => {
    const test = run(pepper(), [() => ({ kind: 'skip' })])

    await test.start()

    expect(test.user.views[0]?.zone.textContent).toContain('Il te faut : 800 g.')
    expect(test.user.views[0]?.props).toMatchObject({ ingredient: 'Poivre', position: 1, total: 1 })
  })

  it('un produit qui est unique dans son paquet : « 2 paquets » demandés font 2 produits, quel que soit le contenu', async () => {
    const line = pepper({
      needed: { quantity: 2, unitSymbol: 'paquet', dimension: 'PACKAGE', baseFactor: 1 },
    })
    const test = run(line, [(view) => choose(view.zone, 'Poivre noir')])

    await test.start()

    expect(test.adapter.calls).toContain('cart 2000001 2')
    expect(test.user.views[0]?.zone.textContent).toContain('À mettre au panier : 2 produits.')
  })

  it('jamais plus que le stock : la quantité rendue est celle que le panier a gardée', async () => {
    const shelf = { ...SHELF, '2000001': { ...SHELF['2000001'], obtained: () => 1 } }
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')], { shelf })

    await test.start()

    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN', quantity: 1 })
  })

  it('affiche tous les produits de la recherche, huit d’abord puis la suite en défilant, sans aucune requête de plus (DRV-643)', async () => {
    const ids = Array.from({ length: 30 }, (_value, index) => String(3000001 + index))
    const counts: number[] = []
    const test = run(
      pepper(),
      [
        (view) => {
          counts.push(rows(view.zone).length)
          // La personne fait défiler : la sentinelle approche, le lot suivant s'ajoute (huit par huit), les premières fiches ne bougent pas.
          const first = rows(view.zone)[0]
          for (let step = 0; step < 4; step += 1) {
            view.zone.dispatchEvent(new Event('scroll'))
            counts.push(rows(view.zone).length)
          }
          expect(rows(view.zone)[0]).toBe(first)
          return { kind: 'skip' }
        },
      ],
      { found: { poivre: ids }, shelf: {} },
    )

    await test.start()

    // Sans IntersectionObserver (jsdom) tout ce qui est « près » de la fenêtre s'ajoute d'un coup : le défilement dit seulement que la suite est demandée.
    expect(counts[0]).toBe(8)
    expect(counts.at(-1)).toBe(30)
    expect(test.adapter.calls.filter((call) => call.startsWith('find'))).toEqual(['find poivre'])
  })

  it('garde au plus MAX_CANDIDATES produits : un plafond technique, pas un choix d’affichage', async () => {
    const ids = Array.from({ length: MAX_CANDIDATES + 40 }, (_value, index) =>
      String(3000001 + index),
    )
    let total = 0
    const test = run(
      pepper(),
      [
        (view) => {
          view.zone.dispatchEvent(new Event('scroll'))
          total = rows(view.zone).length
          return { kind: 'skip' }
        },
      ],
      { found: { poivre: ids }, shelf: {} },
    )

    await test.start()

    expect(MAX_CANDIDATES).toBe(200)
    expect(total).toBe(MAX_CANDIDATES)
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
    // L'écran dit aussi ce que la liste demande (« Il te faut : 800 g. », DRV-626)
    expect(asked).toEqual([
      { ingredient: 'Poivre', productLabel: 'Mélange mystère de test', packs: null, need: '800 g' },
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
      'Contenu inconnu : tu choisiras la quantité.',
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

  it('« Passer cette fois » et « J’en ai toujours » ne passent que l’article affiché', async () => {
    const test = run(pepper(), [() => ({ kind: 'skip' }), () => ({ kind: 'have' })], {
      others: [fresh('sel')],
    })

    await test.start()

    expect(test.user.views).toHaveLength(2)
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
      'Leclerc n’a pas pu mettre « Poivre blanc de test » au panier. Choisis-en un autre.',
    )
  })

  it('un produit « Plus en stock » se choisit : le bouton est actif et la fiche reste honnête (DRV-635)', async () => {
    const test = run(pepper(), [
      (view) => {
        const card = [...view.zone.querySelectorAll('li')].find((item) =>
          item.textContent.includes('Poivre en grains'),
        )
        const button = buttonOf(view.zone, 'Poivre en grains')
        expect(button.disabled).toBe(false)
        expect(button.textContent).toBe('Choisir')
        expect(card?.textContent).toContain('Plus en stock.')
        return { kind: 'skip' }
      },
    ])

    await test.start()

    expect(test.adapter.writes).toEqual([])
  })

  it('un produit « Plus en stock » que le panier accepte est au panier, comme un autre (le panier tranche)', async () => {
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre en grains')])

    await test.start()

    expect(test.adapter.writes).toEqual([{ id: '2000003', quantity: 4 }])
    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN', product: { id: '2000003' } })
  })

  it('un produit « Plus en stock » que le panier refuse : le choix est enregistré (ligne CHOSEN), le passage continue, la fin dit pourquoi (DRV-644)', async () => {
    const shelf = { ...SHELF, '2000003': { ...SHELF['2000003'], obtained: () => 0 } }
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre en grains')], { shelf })

    await test.start()

    // Une seule liste montrée : ni bandeau, ni retour à la liste ; le panier n'a rien pris, mais le choix part comme un choix ordinaire
    expect(test.user.views).toHaveLength(1)
    expect(test.adapter.writes).toEqual([{ id: '2000003', quantity: 4 }])
    expect(lineOf(test.sent[0])).toEqual({
      ingredientSlug: 'poivre',
      outcome: 'CHOSEN',
      product: expect.objectContaining({ id: '2000003', label: 'Poivre en grains de test' }),
      quantity: 4,
      placement: 'PRIMARY',
    })
    expect(test.screens.propsOf('end')[0]?.unreached).toEqual([
      { label: 'Poivre en grains de test', reason: 'OUT_OF_STOCK' },
    ])
  })

  it('une fiche « Bientôt disponible » que le panier refuse : la raison est dite avec les mots de Leclerc', async () => {
    const shelf = {
      ...SHELF,
      '2000003': { ...SHELF['2000003'], obtained: () => 0, comingSoon: true },
    }
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre en grains')], { shelf })

    await test.start()

    expect(test.screens.propsOf('end')[0]?.unreached).toEqual([
      { label: 'Poivre en grains de test', reason: 'COMING_SOON' },
    ])
  })

  it('une fiche disponible que le panier ne prend pas, sans rien en dire : « CART_REFUSED », le choix est enregistré', async () => {
    const shelf = {
      ...SHELF,
      '2000001': {
        ...SHELF['2000001'],
        obtained: () => 0,
        cartFacts: { stock: 12, availability: 1 },
      },
    }
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')], { shelf })

    await test.start()

    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN', product: { id: '2000001' } })
    expect(test.screens.propsOf('end')[0]?.unreached).toEqual([
      { label: 'Poivre noir moulu de test', reason: 'CART_REFUSED' },
    ])
  })

  it('une fiche disponible dont la réponse du panier dit un stock nul : la raison est la rupture (le motif lu)', async () => {
    const shelf = {
      ...SHELF,
      '2000001': {
        ...SHELF['2000001'],
        obtained: () => 0,
        cartFacts: { stock: 0, availability: 2 },
      },
    }
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')], { shelf })

    await test.start()

    expect(test.screens.propsOf('end')[0]?.unreached).toEqual([
      { label: 'Poivre noir moulu de test', reason: 'OUT_OF_STOCK' },
    ])
  })

  it('un produit pris au panier ne laisse aucune mention « pas dans ton panier »', async () => {
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')])

    await test.start()

    expect(test.screens.propsOf('end')).toEqual([])
    expect(lineOf(test.sent[0])).toMatchObject({ outcome: 'CHOSEN', quantity: 2 })
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
    '1000001': OUT_OF_STOCK,
    '1000002': OUT_OF_STOCK,
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
    // chaque produit est cherché puis tenté une seule fois au panier (le panier tranche), avant la phase B
    expect(test.adapter.calls.slice(0, 4)).toEqual([
      'search 1000001',
      'cart 1000001 1',
      'search 1000002',
      'cart 1000002 2',
    ])
  })

  it.each([
    ['PRIMARY', 'PRIMARY'],
    ['ONCE', 'ONCE'],
  ] as const)(
    'pose une seule question sur le produit choisi (%s) et rend sa réponse avec les identifiants indisponibles',
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
        { ingredient: 'Farine', productLabel: 'Poivre noir moulu de test 500 g', photo: null },
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

  it('« Revenir à la liste » sur la question ne met rien au panier', async () => {
    const test = run(
      flour(),
      [(view) => choose(view.zone, 'Poivre noir'), () => ({ kind: 'skip' })],
      {
        shelf,
        placementAnswer: null,
      },
    )

    await test.start()

    // seules les deux tentatives de la phase A ont écrit : le produit de la liste n'est pas mis au panier
    expect(test.adapter.writes).toEqual([
      { id: '1000001', quantity: 1 },
      { id: '1000002', quantity: 2 },
    ])
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

  it('nettoie le libellé du produit refusé : une fiche enregistrée avant le durcissement du back ne fait pas refuser tout le lot', async () => {
    // Given : deux fiches mémorisées avec des invisibles que le back refuse aujourd'hui (trait d'union conditionnel, opérateur invisible),
    // la seconde n'étant faite que de cela
    const legacy = [
      {
        ...product('1000001', 1, 'Fari\u00ADne de\u2061 test A'),
        content: { value: 1000, unit: 'g' as const },
      },
      product('1000002', 2, '\u200B\u00AD'),
    ]
    const test = run(
      flour({ products: legacy }),
      [
        (view) => {
          view.zone.querySelector<HTMLInputElement>('#jamais-0')?.click()
          view.zone.querySelector<HTMLInputElement>('#jamais-1')?.click()
          choose(view.zone, 'Poivre noir')
        },
      ],
      { shelf },
    )

    // When
    await test.start()

    // Then : les libellés repartent nettoyés (ou, vides, « Produit <id> ») et le back les accepterait
    const rejected = (lineOf(expectConform(test.sent[0]), 'farine') as { rejected: ProductRef[] })
      .rejected
    expect(rejected.map((item) => item.label)).toEqual(['Farine de test A', 'Produit 1000002'])
    for (const item of rejected) expect(backAcceptsLabel(item.label)).toBe(true)
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

  it('un autre produit demandé (« replaces ») pose aussi la question, sans bandeau ni case', async () => {
    const line = pepper({ replaces: { id: '98765', label: 'Poivre habituel de test' } })
    const test = run(line, [(view) => choose(view.zone, 'Poivre noir')], {
      placementAnswer: 'ONCE',
    })

    await test.start()

    expect(test.screens.screens()).toContain('placement')
    expect(test.user.views[0]?.zone.textContent).toContain(
      'Tu remplaces : Poivre habituel de test.',
    )
    expect(test.user.views[0]?.zone.querySelector('.gone')).toBeNull()
    expect(lineOf(test.sent[0])).toMatchObject({ placement: 'ONCE' })
    expect(lineOf(test.sent[0])).not.toHaveProperty('unavailableIds')
  })

  it('l’agent n’émet plus jamais « FALLBACK » (le protocole l’accepte toujours)', async () => {
    // Given : toutes les issues possibles de la question, et le produit retenu qui revient
    for (const placementAnswer of ['PRIMARY', 'ONCE'] as const) {
      const test = run(flour(), [(view) => choose(view.zone, 'Poivre noir')], {
        shelf,
        placementAnswer,
      })

      // When
      await test.start()

      // Then
      expect(JSON.stringify(test.sent[0])).not.toContain('FALLBACK')
    }
  })

  it('un ingrédient jamais acheté ne pose aucune question de rôle', async () => {
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')])

    await test.start()

    expect(test.screens.screens()).not.toContain('placement')
    expect(lineOf(test.sent[0])).toMatchObject({ placement: 'PRIMARY' })
  })
})

// —— Passer les suivants (DRV-624) ——————————————————————————————————————————————————————————————————————————————————————————

describe('« Passer les n suivants »', () => {
  const four = [fresh('sel'), fresh('huile'), fresh('riz')]
  const rest = (): ChooserAnswer => ({ kind: 'rest' })

  it('choisir le premier, passer les trois suivants : deux touches pour quatre nouveaux articles, rien n’est retenu pour les trois autres', async () => {
    // Given : quatre articles jamais achetés, l'utilisateur choisit le premier puis passe le reste
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir'), rest], {
      others: four,
      found: { ...FOUND, sel: ['2000004'] },
    })

    // When
    await test.start()

    // Then : deux écrans de choix seulement, les trois suivants sont passés sans même être cherchés
    expect(test.user.views.map((view) => view.props)).toMatchObject([
      { ingredient: 'Poivre', position: 1, total: 4 },
      { ingredient: 'Sel', position: 2, total: 4 },
    ])
    expect(test.adapter.calls).toEqual(['find poivre', 'cart 2000001 2', 'find sel'])
    expect(test.adapter.writes).toEqual([{ id: '2000001', quantity: 2 }])
    const message = expectConform(test.sent[0])
    expect(message).toMatchObject({ outcome: 'completed' })
    expect(message.lines.map((line) => [line.ingredientSlug, line.outcome])).toEqual([
      ['poivre', 'CHOSEN'],
      ['sel', 'SKIPPED'],
      ['huile', 'SKIPPED'],
      ['riz', 'SKIPPED'],
    ])
    // « Pas cette fois » : ni « j'en ai toujours », ni refus, ni produit.
    for (const slug of ['sel', 'huile', 'riz']) {
      expect(lineOf(message, slug)).toEqual({ ingredientSlug: slug, outcome: 'SKIPPED' })
    }
    expect(JSON.stringify(message)).not.toContain('HAVE_AT_HOME')
    expect(test.screens.screens().filter((screen) => screen === 'chooser')).toHaveLength(2)
  })

  it('passe aussi l’article affiché, avec ses refus cochés exprès (comme « Pas cette fois »)', async () => {
    const flour = {
      ...known('farine', [
        product('1000001', 1, 'Farine de test A'),
        product('1000002', 2, 'Farine de test B'),
      ]),
      searchQuery: 'poivre',
    }
    const shelf: Record<string, ShelfItem> = {
      ...SHELF,
      '1000001': OUT_OF_STOCK,
      '1000002': OUT_OF_STOCK,
    }
    const test = run(
      flour,
      [
        (view) => {
          view.zone.querySelector<HTMLInputElement>('#jamais-1')?.click()
          return rest()
        },
      ],
      { shelf, others: [fresh('sel')] },
    )

    await test.start()

    expect(expectConform(test.sent[0]).lines).toEqual([
      {
        ingredientSlug: 'farine',
        outcome: 'SKIPPED',
        rejected: [{ id: '1000002', label: 'Farine de test B' }],
      },
      { ingredientSlug: 'sel', outcome: 'SKIPPED' },
    ])
  })

  it('compte les articles qui restent dans l’écran : le bouton disparaît au dernier', async () => {
    const test = run(
      pepper(),
      [() => ({ kind: 'skip' }), () => ({ kind: 'skip' }), () => ({ kind: 'skip' })],
      {
        others: [fresh('sel'), fresh('huile')],
      },
    )

    await test.start()

    expect(test.user.views.map((view) => view.props.total - view.props.position + 1)).toEqual([
      3, 2, 1,
    ])
  })

  describe('la confirmation d’une ligne', () => {
    const gone: Record<string, ShelfItem> = {
      ...SHELF,
      '1000001': OUT_OF_STOCK,
      '1000002': OUT_OF_STOCK,
      '1000003': OUT_OF_STOCK,
    }
    /** Un article dont l'unique produit retenu n'est plus en stock (`id`), cherché sous « poivre ». */
    const flourGone = (slug: string, id = '1000001'): PlanLine => ({
      ...known(slug, [product(id, 1, `Produit de test ${id}`)]),
      searchQuery: 'poivre',
    })
    const askedFor = (test: ReturnType<typeof run>) =>
      test.user.views.map((view) => view.props.confirmRest)

    it('est demandée quand un article passé n’a encore aucun produit retenu (celui qui est affiché compris)', async () => {
      const test = run(pepper(), [() => ({ kind: 'skip' }), () => ({ kind: 'skip' })], {
        others: [flourGone('farine')],
        shelf: gone,
      })

      await test.start()

      // L'article affiché (poivre, jamais acheté) fait demander ; une fois passé, il ne reste que la farine, dont le produit est parti.
      expect(askedFor(test)).toEqual([true, false])
    })

    it('est demandée dès qu’un des articles suivants n’a rien de retenu', async () => {
      const test = run(flourGone('farine'), [() => ({ kind: 'skip' }), () => ({ kind: 'skip' })], {
        others: [pepper()],
        shelf: gone,
      })

      await test.start()

      expect(askedFor(test)).toEqual([true, true])
    })

    it('n’est pas demandée quand tous les articles ont un produit retenu devenu indisponible, ou un produit que l’utilisateur remplace', async () => {
      // Given : deux articles dont le produit habituel n'est plus là, et un troisième remplacé exprès
      const replaced = pepper({ replaces: { id: '98765', label: 'Poivre habituel de test' } })
      const test = run(
        flourGone('farine'),
        [() => ({ kind: 'skip' }), () => ({ kind: 'skip' }), () => ({ kind: 'skip' })],
        { others: [flourGone('sucre', '1000002'), replaced], shelf: gone },
      )

      // When
      await test.start()

      // Then : 3 articles à choisir, aucun n'est un premier choix
      expect(askedFor(test)).toEqual([false, false, false])
    })

    it('transmet `rest` tel quel à la phase B : la confirmation est l’affaire de l’écran', async () => {
      const test = run(pepper(), [rest], { others: four })

      await test.start()

      expect(test.user.views).toHaveLength(1)
      expect(expectConform(test.sent[0]).lines.map((line) => line.outcome)).toEqual([
        'SKIPPED',
        'SKIPPED',
        'SKIPPED',
        'SKIPPED',
      ])
    })
  })

  it('le résultat compte les articles passés, et repart tout de suite (rien à lire)', async () => {
    const test = run(pepper(), [rest], { others: four })

    await test.start()

    expect(test.screens.screens()).not.toContain('end')
    const outcomes = test.sent[0]?.lines.map((line) => line.outcome)
    expect(outcomes?.filter((outcome) => outcome === 'SKIPPED')).toHaveLength(4)
    expect(outcomes).not.toContain('CHOSEN')
  })
})

// —— Un produit retenu et disponible n'ouvre jamais l'écran de choix (phase A, DRV-624) ————————————————————————————————————————

describe('un produit retenu et disponible', () => {
  const FARINE = [
    product('1000001', 2, 'Farine de test A'),
    product('1000002', 1, 'Farine de test B'),
  ]
  const shelf: Record<string, ShelfItem> = { ...SHELF, '1000001': {}, '1000002': {} }

  it('est mis au panier par la phase A, sans écran de choix ni question', async () => {
    // Given : la farine a son produit habituel en stock ; le poivre est nouveau
    const adapter = fakeAdapter(shelf, { found: FOUND })
    const user = session((view) => choose(view.zone, 'Poivre noir'))
    const screens = fakeUi({ chooser: user.chooser })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: adapter.adapter,
      phaseB: guidedChoice,
    })

    // When
    await flow.start(plan([known('farine', FARINE), pepper()]))

    // Then : un seul écran de choix, celui du poivre ; la farine est ajoutée avant, sans question
    expect(screens.propsOf('chooser')).toMatchObject([
      { ingredient: 'Poivre', position: 1, total: 1 },
    ])
    expect(screens.screens()).not.toContain('placement')
    expect(lineOf(sent[0], 'farine')).toMatchObject({
      outcome: 'ADDED',
      productId: '1000001',
      usedRank: 1,
    })
  })

  it('même quand le produit habituel manque : le suivant disponible est pris, sans écran de choix', async () => {
    const stock: Record<string, ShelfItem> = { ...shelf, '1000001': OUT_OF_STOCK }
    const adapter = fakeAdapter(stock, { found: FOUND })
    const screens = fakeUi({ chooser: () => Promise.reject(new Error('aucun choix attendu')) })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: adapter.adapter,
      phaseB: guidedChoice,
    })

    await flow.start(plan([known('farine', FARINE)]))

    expect(screens.propsOf('chooser')).toEqual([])
    expect(lineOf(sent[0], 'farine')).toMatchObject({
      outcome: 'ADDED',
      productId: '1000002',
      usedRank: 2,
    })
  })

  it('seul un article dont plus aucun produit retenu n’est disponible ouvre l’écran de choix', async () => {
    const stock: Record<string, ShelfItem> = {
      ...shelf,
      '1000001': OUT_OF_STOCK,
      '1000002': OUT_OF_STOCK,
    }
    const adapter = fakeAdapter(stock, { found: { farine: ['2000001'] } })
    const user = session(() => ({ kind: 'skip' }))
    const screens = fakeUi({ chooser: user.chooser })
    const { flow } = makeFlow({ ui: screens.ui, adapter: adapter.adapter, phaseB: guidedChoice })

    await flow.start(plan([known('farine', FARINE)]))

    expect(screens.propsOf('chooser')).toMatchObject([
      { ingredient: 'Farine', position: 1, total: 1 },
    ])
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
            'Le site ne répond pas. Réessaie dans un instant.',
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
            'Leclerc met trop de temps à répondre. Réessaie dans un instant.',
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

  it('un panier qui refuse le produit (quantité nulle) n’empêche pas de l’enregistrer : le passage continue avec l’article suivant', async () => {
    const shelf = { ...SHELF, '2000001': { ...SHELF['2000001'], obtained: () => 0 } }
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir')], {
      shelf,
      others: [{ ...fresh('sel'), name: 'Sel' }],
    })

    await test.start()

    expect(test.user.views).toHaveLength(2)
    expect(test.sent[0]?.lines.map((item) => item.outcome)).toEqual(['CHOSEN', 'UNAVAILABLE'])
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

  it('retire aussi le trait d’union conditionnel et les opérateurs invisibles, que le back refuse depuis sa PR #198', () => {
    const label = labelOf({
      ...candidate('1'),
      label: 'Fro\u00ADmage ra\u00ADpé\u2061',
      label2: '2\u2062 x 100\u2063 g\u2064',
    })

    expect(label).toBe('Fromage rapé 2 x 100 g')
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

  it('rien ne répond : « Aucun produit trouvé pour « zzqxkw ». Essaie un autre mot. », au plus 5 requêtes, le champ garde le nom', async () => {
    // Given
    const test = run(
      { ...fresh('zzqxkw'), name: 'Zzqxkw', searchQuery: 'zzqxkw' },
      [
        (view) => {
          expect(statusOf(view.zone)).toBe(
            'Aucun produit trouvé pour « zzqxkw ». Essaie un autre mot.',
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
          'Aucun produit trouvé pour « tomates ». Essaie un autre mot.',
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

// —— Introuvable n'est pas indisponible (DRV-635) ————————————————————————————————————————————————————————————————————————————

const SHELF_OUT: Record<string, ShelfItem> = {
  ...SHELF,
  '1000001': OUT_OF_STOCK,
  '1000002': OUT_OF_STOCK,
}

describe('la raison de chaque produit habituel écarté (DRV-635)', () => {
  const LABEL_A = "Gâteaux C'est Nous Pépites 300 g"
  const PRODUCTS = [
    { ...product('1000001', 1, LABEL_A), content: { value: 300, unit: 'g' as const } },
    product('1000002', 1, 'Farine de test B'),
    product('1000003', 1, 'Sucre de test C'),
  ]
  const mixed = (): PlanLine => ({
    ...known('gateaux', PRODUCTS),
    searchQuery: 'poivre',
  })
  /** A est introuvable, B est refusé par le panier, C est en rupture : trois raisons dans la même ligne. */
  const shelf: Record<string, ShelfItem> = {
    ...SHELF,
    '1000001': {},
    '1000002': { stock: 10, obtained: () => 0 },
    '1000003': OUT_OF_STOCK,
  }
  const sees = (_query: string, id: string) => id !== '1000001'

  function runMixed(steps: Step[]) {
    const adapter = fakeAdapter(shelf, { found: FOUND, sees })
    const user = session(...steps)
    const screens = fakeUi({ chooser: user.chooser, placement: () => 'ONCE' })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: adapter.adapter,
      phaseB: guidedChoice,
    })
    return { start: () => flow.start(plan([mixed()])), adapter, user, sent }
  }

  it('chaque raison a sa phrase : la rupture se dit « plus disponible », le reste ne le dit jamais', async () => {
    const test = runMixed([() => ({ kind: 'skip' })])

    await test.start()

    const text = test.user.views[0]?.zone.textContent ?? ''
    expect(text).toContain('Ces produits ne sont plus disponibles : Sucre de test C.')
    expect(text).toContain(`Je ne retrouve pas « ${LABEL_A} » : cherche-le ou choisis-en un autre.`)
    expect(text).toContain(
      'Leclerc n’a pas pu mettre « Farine de test B » au panier. Choisis-en un autre.',
    )
    // « plus disponible » ne qualifie ni le produit introuvable ni celui que le panier a refusé
    expect(text).not.toContain('Farine de test B, ')
    expect(text).not.toMatch(/plus disponibles : [^.]*(Gâteaux|Farine)/)
  })

  it('la recherche est préremplie avec la forme la plus simple du produit introuvable, sans être lancée', async () => {
    const test = runMixed([() => ({ kind: 'skip' })])

    await test.start()

    const input = test.user.views[0]?.zone.querySelector<HTMLInputElement>('#chercher')
    expect(input?.value).toBe(productSearchForms(LABEL_A).at(-1))
    expect(input?.value).toBe('gateaux pepites')
    // la liste montre toujours les résultats de la recherche de l’article : rien n’a été cherché de plus
    expect(test.adapter.calls.filter((call) => call.startsWith('find '))).toEqual(['find poivre'])
  })

  it('sans produit introuvable, la recherche garde le nom de l’article', async () => {
    const gone = {
      ...known('farine', [
        product('1000001', 1, 'Farine de test A'),
        product('1000002', 2, 'Farine de test B'),
      ]),
      searchQuery: 'poivre',
    }
    const test = run(gone, [() => ({ kind: 'skip' })], { shelf: SHELF_OUT })

    await test.start()

    expect(test.user.views[0]?.zone.querySelector<HTMLInputElement>('#chercher')?.value).toBe(
      'poivre',
    )
  })

  it('« Ne plus proposer » est décochée pour chacun, et rien n’est retiré de la mémoire sans un geste', async () => {
    const test = runMixed([(view) => choose(view.zone, 'Poivre noir')])

    await test.start()

    const boxes = [
      ...(test.user.views[0]?.zone.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ??
        []),
    ]
    expect(boxes).toHaveLength(3)
    expect(boxes.every((box) => !box.checked)).toBe(true)
    expect(lineOf(test.sent[0], 'gateaux')).toMatchObject({
      outcome: 'CHOSEN',
      unavailableIds: ['1000001', '1000002', '1000003'],
    })
    expect(lineOf(test.sent[0], 'gateaux')).not.toHaveProperty('rejected')
  })

  it('cocher « Ne plus proposer » sur un produit introuvable est un geste de l’utilisateur : il part dans « rejected »', async () => {
    const test = runMixed([
      (view) => {
        view.zone.querySelector<HTMLInputElement>('#jamais-0')?.click()
        choose(view.zone, 'Poivre noir')
      },
    ])

    await test.start()

    expect(lineOf(test.sent[0], 'gateaux')).toMatchObject({
      rejected: [{ id: '1000001', label: LABEL_A }],
    })
  })
})

// —— Les photos (DRV-633) ————————————————————————————————————————————————————————————————————————————————————————————————————

describe('les photos des produits', () => {
  const PHOTO = (id: string) =>
    `https://photos-test.leclercdrive.fr/image.ashx?id=${id}&use=l&cat=p`
  const withPhotos = (shelf: Record<string, ShelfItem>): Record<string, ShelfItem> =>
    Object.fromEntries(
      Object.entries(shelf).map(([id, entry]) => [id, { ...entry, image: PHOTO(id) }]),
    )

  it('chaque fiche reçoit l’adresse de la photo de son produit ; un produit sans photo n’en a pas', async () => {
    const shelf = { ...withPhotos(SHELF), '2000002': { ...SHELF['2000002'], image: null } }
    const test = run(pepper(), [() => ({ kind: 'skip' })], { shelf })

    await test.start()

    const zone = test.user.views[0]?.zone ?? document.createElement('div')
    expect(rows(zone).map((row) => row.querySelector('img')?.getAttribute('src') ?? null)).toEqual([
      PHOTO('2000001'),
      null,
      PHOTO('2000003'),
      PHOTO('2000004'),
    ])
    expect(rows(zone)[0]?.querySelector('img')?.getAttribute('alt')).toBe(
      'Poivre noir moulu de test',
    )
  })

  it('le résultat renvoyé à Repas est le même, octet pour octet, avec ou sans photos : aucune adresse d’image ne part', async () => {
    const without = run(pepper(), [(view) => choose(view.zone, 'Poivre noir moulu')])
    const photos = run(pepper(), [(view) => choose(view.zone, 'Poivre noir moulu')], {
      shelf: withPhotos(SHELF),
    })

    await without.start()
    await photos.start()

    expect(JSON.stringify(photos.sent)).toBe(JSON.stringify(without.sent))
    expect(JSON.stringify(photos.sent)).not.toMatch(/photo|image|leclercdrive/i)
    expect(photos.adapter.calls).toEqual(without.adapter.calls)
  })

  it('l’état de reprise ne garde aucune adresse de photo', async () => {
    const test = run(pepper(), [(view) => choose(view.zone, 'Poivre noir moulu')], {
      shelf: withPhotos(SHELF),
    })

    await test.start()

    const stored = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: sessionStorage.length }, (_, index) => {
          const key = sessionStorage.key(index) ?? ''
          return [key, sessionStorage.getItem(key)]
        }),
      ),
    )
    expect(stored).not.toMatch(/image\.ashx|leclercdrive|photo/i)
  })

  it('la question « Toujours prendre ce produit ? » reçoit la photo du produit choisi', async () => {
    const FARINE = [
      {
        ...product('1000001', 1, 'Farine de test A'),
        content: { value: 1000, unit: 'g' as const },
      },
    ]
    const shelf = { ...withPhotos(SHELF), '1000001': OUT_OF_STOCK }
    const line = {
      ...known('farine', FARINE),
      searchQuery: 'poivre',
      needed: { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT' as const, baseFactor: 1 },
    }
    const test = run(line, [(view) => choose(view.zone, 'Poivre noir')], { shelf })

    await test.start()

    expect(test.placements).toEqual([
      {
        ingredient: 'Farine',
        productLabel: 'Poivre noir moulu de test 500 g',
        photo: PHOTO('2000001'),
      },
    ])
  })
})
