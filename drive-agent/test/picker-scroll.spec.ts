// L'affichage de la liste de produits par lots, en défilant (DRV-643). jsdom n'a pas d'`IntersectionObserver` : le chemin avec observateur se joue avec un
// double qui enregistre ce qu'il observe, et le chemin sans observateur (repli) avec l'événement de défilement et une sentinelle dont la position est donnée.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderPicker, type Picker, type PickerHooks, type PickerItem } from '../src/ui'
import { BATCH_SIZE } from '../src/ui/picker'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const item = (n: number, extra: Partial<PickerItem> = {}): PickerItem => ({
  id: String(2000000 + n),
  name: `Produit de test ${n}`,
  label2: null,
  details: ['500 g'],
  promo: null,
  explain: '500 g par produit : 2 produits.',
  state: 'ok',
  photo: `https://photos-test.leclercdrive.fr/image.ashx?id=${n}&use=l&cat=p`,
  ...extra,
})
const many = (count: number, from = 1) => Array.from({ length: count }, (_, i) => item(from + i))

const hooks = (): PickerHooks => ({
  choose: () => undefined,
  search: () => undefined,
  never: () => undefined,
})

function mount(items: PickerItem[]): { zone: HTMLElement; picker: Picker } {
  const zone = document.body.appendChild(document.createElement('div'))
  const picker = renderPicker(
    zone,
    {
      need: null,
      replaces: null,
      gone: [],
      checked: new Set(),
      query: 'poivre',
      items,
      notice: null,
    },
    hooks(),
  )
  return { zone, picker }
}

const rowsOf = (zone: HTMLElement) => [...zone.querySelectorAll<HTMLElement>('li.candidate')]
const sentinel = (zone: HTMLElement) => zone.querySelector<HTMLElement>('.more')

/** Un `IntersectionObserver` de test : il garde ses cibles et se déclenche à la main. */
function fakeObserver() {
  const observers: {
    callback: IntersectionObserverCallback
    options?: IntersectionObserverInit | undefined
    targets: Set<Element>
    disconnected: boolean
  }[] = []
  class Fake {
    state: (typeof observers)[number]
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.state = { callback, options, targets: new Set(), disconnected: false }
      observers.push(this.state)
    }
    observe(target: Element) {
      this.state.targets.add(target)
    }
    unobserve(target: Element) {
      this.state.targets.delete(target)
    }
    disconnect() {
      this.state.disconnected = true
      this.state.targets.clear()
    }
  }
  vi.stubGlobal('IntersectionObserver', Fake)
  /** La sentinelle entre dans la zone visible. */
  const reach = (observer = observers[0]) => {
    if (!observer) throw new Error('Aucun observateur.')
    for (const target of Array.from(observer.targets)) {
      observer.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        {} as never,
      )
    }
  }
  return { observers, reach }
}

describe('avec un observateur de défilement', () => {
  it('montre un premier lot, puis un lot de plus chaque fois que la sentinelle approche, jusqu’au bout', () => {
    const { observers, reach } = fakeObserver()

    const { zone } = mount(many(30))

    expect(rowsOf(zone)).toHaveLength(BATCH_SIZE)
    // Un seul observateur, qui regarde la sentinelle, avec de l'avance sous l'écran.
    expect(observers).toHaveLength(1)
    expect(observers[0]?.options?.rootMargin).toMatch(/^0px 0px \d+px 0px$/)
    expect([...(observers[0]?.targets ?? [])]).toEqual([sentinel(zone)])
    const first = rowsOf(zone)[0]
    reach()
    expect(rowsOf(zone)).toHaveLength(2 * BATCH_SIZE)
    reach()
    reach()
    expect(rowsOf(zone)).toHaveLength(30)
    // Les fiches déjà affichées n'ont jamais été refaites.
    expect(rowsOf(zone)[0]).toBe(first)
    // Tout est affiché : la sentinelle disparaît et n'est plus observée.
    expect(sentinel(zone)?.hidden).toBe(true)
    expect(observers[0]?.targets.size).toBe(0)
    // Les fiches sont dans l'ordre du site, sans doublon.
    const names = rowsOf(zone).map((row) => row.querySelector('.name')?.textContent)
    expect(names).toEqual(many(30).map((one) => one.name))
    const ids = rowsOf(zone).map((row) => row.querySelector('.name')?.getAttribute('id'))
    expect(new Set(ids).size).toBe(30)
  })

  it('une liste d’un seul lot n’a ni sentinelle visible ni observation', () => {
    const { observers } = fakeObserver()

    const { zone } = mount(many(BATCH_SIZE))

    expect(rowsOf(zone)).toHaveLength(BATCH_SIZE)
    expect(sentinel(zone)?.hidden).toBe(true)
    expect(observers[0]?.targets.size).toBe(0)
  })

  it('une liste vide ne montre aucune fiche et dit qu’il n’y a rien', () => {
    fakeObserver()

    const { zone } = mount([])

    expect(rowsOf(zone)).toHaveLength(0)
    expect(sentinel(zone)?.hidden).toBe(true)
    expect(zone.querySelector('[role="status"]')?.textContent).toContain('Aucun produit trouvé')
  })

  it('une nouvelle recherche repart du premier lot, avec les nouvelles fiches', () => {
    const { reach } = fakeObserver()
    const { zone, picker } = mount(many(30))
    reach()

    picker.results('sel', many(20, 100), null)

    expect(rowsOf(zone)).toHaveLength(BATCH_SIZE)
    expect(rowsOf(zone)[0]?.querySelector('.name')?.textContent).toBe('Produit de test 100')
    expect(sentinel(zone)?.hidden).toBe(false)
    reach()
    reach()
    expect(rowsOf(zone)).toHaveLength(20)
  })

  it('les photos suivent les fiches : le premier lot demande ses images, pas la suite', () => {
    const { reach } = fakeObserver()
    const { zone } = mount(many(30))

    expect(zone.querySelectorAll('img')).toHaveLength(BATCH_SIZE)
    reach()
    expect(zone.querySelectorAll('img')).toHaveLength(2 * BATCH_SIZE)
    const sources = [...zone.querySelectorAll('img')].map((image) => image.getAttribute('src'))
    expect(new Set(sources).size).toBe(2 * BATCH_SIZE)
    expect(zone.querySelector('img')?.getAttribute('loading')).toBe('lazy')
  })

  it('un lot qui arrive pendant une recherche est inactif comme le reste de la liste, et un produit écarté reste grisé', () => {
    const { reach } = fakeObserver()
    const items = many(20)
    items[10] = item(11, { state: 'refused' })
    const { zone, picker } = mount(items)

    picker.busy('Recherche en cours…')
    reach()

    const buttons = [...zone.querySelectorAll('li.candidate button')]
    expect(buttons).toHaveLength(2 * BATCH_SIZE)
    expect(buttons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    picker.busy(null)
    const enabled = [...zone.querySelectorAll('li.candidate button')].filter(
      (button) => !(button as HTMLButtonElement).disabled,
    )
    expect(enabled).toHaveLength(2 * BATCH_SIZE - 1)
    expect(zone.querySelector('[data-off]')?.textContent).toBe('Ne plus proposer')
  })

  it('un produit « Plus en stock » dans un lot suivant reste à choisir (DRV-635)', () => {
    const { reach } = fakeObserver()
    const items = many(20)
    items[12] = item(13, { state: 'out' })
    const { zone } = mount(items)

    reach()

    const row = rowsOf(zone)[12]
    expect(row?.textContent).toContain('Plus en stock.')
    expect(row?.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false)
  })

  it('« dispose » cesse d’observer', () => {
    const { observers } = fakeObserver()
    const { picker } = mount(many(30))

    picker.dispose()

    expect(observers[0]?.disconnected).toBe(true)
  })

  it('ne lance aucune requête réseau : ni fetch ni XMLHttpRequest', () => {
    const { reach } = fakeObserver()
    const fetchSpy = vi.fn<() => void>()
    vi.stubGlobal('fetch', fetchSpy)
    const { zone } = mount(many(30))

    reach()
    reach()
    reach()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(rowsOf(zone)).toHaveLength(30)
  })
})

describe('sans observateur de défilement (repli)', () => {
  /** La sentinelle est à `top` pixels du haut de la fenêtre. */
  function placeSentinel(zone: HTMLElement, top: () => number): void {
    const el = sentinel(zone)
    if (!el) throw new Error('Pas de sentinelle.')
    el.getBoundingClientRect = () => ({ top: top() }) as DOMRect
  }

  it('n’ajoute rien tant que la sentinelle est loin sous l’écran, puis ajoute des lots tant qu’elle est proche', () => {
    expect(typeof IntersectionObserver).toBe('undefined')
    const { zone } = mount(many(40))
    // Chaque fiche pousse la sentinelle de 100 px ; la fenêtre fait 768 px et l'avance 400 px : on ajoute tant que la sentinelle est à 1 168 px ou moins.
    let far = true
    placeSentinel(zone, () => (far ? 5000 : rowsOf(zone).length * 100))

    zone.dispatchEvent(new Event('scroll'))
    expect(rowsOf(zone)).toHaveLength(BATCH_SIZE)

    far = false
    zone.dispatchEvent(new Event('scroll'))
    expect(rowsOf(zone)).toHaveLength(2 * BATCH_SIZE)
  })

  it('arrive au bout de la liste et cache la sentinelle', () => {
    const { zone } = mount(many(25))
    placeSentinel(zone, () => 0)

    zone.dispatchEvent(new Event('scroll'))

    expect(rowsOf(zone)).toHaveLength(25)
    expect(sentinel(zone)?.hidden).toBe(true)
  })

  it('un événement de défilement d’une liste qui n’est plus dans la page ne fait rien, et « dispose » retire l’écoute', () => {
    const { zone, picker } = mount(many(25))
    placeSentinel(zone, () => 0)

    picker.dispose()
    zone.dispatchEvent(new Event('scroll'))

    expect(rowsOf(zone)).toHaveLength(BATCH_SIZE)
  })
})
