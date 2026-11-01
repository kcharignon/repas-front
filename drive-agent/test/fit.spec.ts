// La place de la carte du guide (DRV-757) : réduite à une barre fine quand la page a besoin de la place, jamais sur un champ où l'on écrit, un contrôle à toucher ou un
// bouton d'un mur de cookies ; elle revient d'elle-même ensuite. jsdom ne mesure rien : les tests donnent les positions (la preuve avec un vrai navigateur est
// `e2e/carte-guide.spec.ts`).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { choose, fitGuide, typingIn } from '../src/ui/fit'

const box = (top: number, bottom: number, left = 0, right = 300) => ({ top, bottom, left, right })
const rect = (top: number, bottom: number, left = 0, right = 300): DOMRect =>
  ({
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect

/** La boîte de la carte selon sa place : pleine en bas 500-760, pleine en haut 8-268, barre en bas 700-750, barre en haut 8-58. */
const placed = (spot: { min: boolean; top: boolean }) =>
  spot.min ? (spot.top ? box(8, 58) : box(700, 750)) : spot.top ? box(8, 268) : box(500, 760)

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('où poser la carte', () => {
  it('rien à éviter : pleine, en bas', () => {
    expect(choose(placed, [], [], false)).toEqual({ min: false, top: false })
  })

  it('le bas couvrirait un contrôle : pleine, en haut', () => {
    expect(choose(placed, [box(640, 690)], [box(640, 690)], false)).toEqual({
      min: false,
      top: true,
    })
  })

  it('les deux places pleines couvrent un contrôle : la carte pleine n’a pas de place', () => {
    expect(choose(placed, [box(100, 150), box(640, 690)], [], false)).toBeNull()
  })

  it('la barre : en bas si c’est libre, sinon en haut', () => {
    expect(choose(placed, [box(100, 150)], [box(100, 150)], true)).toEqual({
      min: true,
      top: false,
    })
    expect(choose(placed, [box(710, 740)], [box(710, 740)], true)).toEqual({ min: true, top: true })
  })

  it('la barre cache le moins possible : un contrôle qu’on évite sans y tenir peut passer dessous, jamais un contrôle à toucher', () => {
    const soft = box(710, 740)
    const hard = box(20, 40)
    expect(choose(placed, [hard, soft], [hard], true)).toEqual({ min: true, top: false })
    expect(choose(placed, [hard, soft], [hard, box(720, 730)], true)).toBeNull()
  })
})

describe('la carte posée dans la page', () => {
  const card = () => {
    const el = document.createElement('section')
    document.body.appendChild(el)
    el.getBoundingClientRect = () =>
      rect(
        ...(() => {
          const spot = placed({
            min: el.classList.contains('min'),
            top: el.classList.contains('top'),
          })
          return [spot.top, spot.bottom] as const
        })(),
      )
    return el
  }
  const control = (top: number, bottom: number) => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    el.getBoundingClientRect = () => rect(top, bottom)
    return el
  }
  const options = (keep: HTMLElement[], extra: Partial<Parameters<typeof fitGuide>[2]> = {}) => ({
    needs: () => ({ keep, maybe: [], sub: null, target: keep[0] ?? null, compact: false }),
    consent: false,
    collapsible: true,
    pointed: () => null,
    changed: () => undefined,
    ...extra,
  })

  it('la page n’a besoin de rien : la carte pleine reste en bas', () => {
    const el = card()
    const fit = fitGuide(window, el, options([control(100, 150)]))
    expect(el.classList.contains('min')).toBe(false)
    expect(el.classList.contains('top')).toBe(false)
    fit.stop()
  })

  it('la carte pleine couvrirait un contrôle à toucher : elle se réduit toute seule, sans bouger si la barre est libre', () => {
    const el = card()
    const fit = fitGuide(window, el, options([control(600, 640)]))
    expect(el.classList.contains('min')).toBe(false) // pleine en haut (8-268) : libre
    expect(el.classList.contains('top')).toBe(true)
    fit.stop()
    const both = card()
    const stuck = fitGuide(window, both, options([control(100, 150), control(600, 640)]))
    expect(both.classList.contains('min')).toBe(true)
    expect(both.classList.contains('top')).toBe(false)
    stuck.stop()
  })

  it('un champ a le focus (le clavier est ouvert) : la carte se réduit, et revient dès que la saisie est finie', () => {
    const field = document.createElement('input')
    field.type = 'text'
    document.body.appendChild(field)
    field.getBoundingClientRect = () => rect(100, 150)
    const el = card()
    const fit = fitGuide(window, el, options([]))
    expect(el.classList.contains('min')).toBe(false)

    field.focus()
    window.dispatchEvent(new Event('resize'))
    expect(typingIn(document)).toBe(field)
    expect(el.classList.contains('min')).toBe(true)

    field.blur()
    window.dispatchEvent(new Event('resize'))
    expect(el.classList.contains('min')).toBe(false)
    fit.stop()
  })

  it('un champ qui a le focus n’est jamais couvert : sans place pour la barre, elle s’efface', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.getBoundingClientRect = () => rect(700, 750)
    const top = control(20, 40)
    const el = card()
    field.focus()
    const fit = fitGuide(window, el, options([top]))
    expect(el.hidden).toBe(true)
    expect(el.classList.contains('away')).toBe(true)
    fit.stop()
  })

  it('la personne réduit, puis rouvre : sa demande est suivie ; la valeur d’un champ n’est jamais lue', () => {
    const el = card()
    const fit = fitGuide(window, el, options([control(100, 150)]))
    fit.ask('min')
    expect(el.classList.contains('min')).toBe(true)
    fit.ask('full')
    expect(el.classList.contains('min')).toBe(false)
    fit.stop()
  })

  it('rouverte sans place libre, la carte pleine s’affiche en bas : c’est la personne qui l’a demandée', () => {
    const el = card()
    const fit = fitGuide(window, el, options([control(100, 150), control(600, 640)]))
    expect(el.classList.contains('min')).toBe(true)
    fit.ask('full')
    expect(el.classList.contains('min')).toBe(false)
    expect(el.classList.contains('top')).toBe(false)
    fit.stop()
  })

  it('une carte qui ne se réduit pas (le magasin ouvert) reste pleine, en bas ou en haut', () => {
    const el = card()
    const fit = fitGuide(
      window,
      el,
      options([control(100, 150), control(600, 640)], { collapsible: false }),
    )
    expect(el.classList.contains('min')).toBe(false)
    fit.stop()
  })

  it('DRV-757 : « Afficher » tient quand un champ a le focus, même sans lecture du guide (la sous-étape absente ne la remet pas à « auto » à chaque passe)', () => {
    const field = document.createElement('input')
    field.type = 'text'
    document.body.appendChild(field)
    field.getBoundingClientRect = () => rect(100, 150)
    field.focus()
    const el = card()
    const fit = fitGuide(window, el, { ...options([]), needs: null })
    expect(el.classList.contains('min')).toBe(true)

    fit.ask('full')
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))

    expect(el.classList.contains('min')).toBe(false)
    fit.stop()
  })

  it('DRV-757 : une lecture qui lève ne laisse pas la carte cachée (« Arrêter pour l’instant » reste atteignable)', () => {
    const el = card()
    const broken = control(100, 150)
    broken.getBoundingClientRect = () => {
      throw new Error('la page ne se laisse pas lire')
    }
    const fit = fitGuide(window, el, options([broken]))

    expect(el.hidden).toBe(false)
    window.dispatchEvent(new Event('resize'))
    expect(el.hidden).toBe(false)
    fit.stop()
  })

  it('DRV-757 : un défilement ne relit pas le guide (des requêtes sur le document) : une page de 3000 éléments, 200 défilements, aucune lecture de plus et une remesure au plus tous les 200 ms', async () => {
    for (let i = 0; i < 3000; i += 1) document.body.appendChild(document.createElement('div'))
    let reads = 0
    const el = card()
    const key = control(100, 150)
    const fit = fitGuide(window, el, {
      ...options([key]),
      needs: () => {
        reads += 1
        return { keep: [key], maybe: [], sub: null, target: key, compact: false }
      },
    })
    expect(reads).toBe(1)
    const start = performance.now()

    for (let i = 0; i < 200; i += 1) window.dispatchEvent(new Event('scroll'))

    expect(reads, 'aucune lecture du guide pendant un défilement').toBe(1)
    expect(performance.now() - start).toBeLessThan(500)
    fit.stop()
  })

  it('DRV-757 : une lecture qui lève après avoir posé la carte ailleurs remet l’état complet de la dernière mesure réussie (réduite, en haut, effacée), pas seulement « cachée »', () => {
    const field = document.createElement('input')
    field.type = 'text'
    document.body.appendChild(field)
    field.getBoundingClientRect = () => rect(100, 150)
    field.focus()
    const el = card()
    const measure = el.getBoundingClientRect
    const fit = fitGuide(window, el, options([]))
    // La dernière mesure réussie : la carte est réduite (le clavier est ouvert)
    expect(el.classList.contains('min')).toBe(true)
    expect(el.hidden).toBe(false)

    // La carte lève en pleine mesure, après que la mesure l'a déjà posée en pleine, en bas
    let calls = 0
    el.getBoundingClientRect = () => {
      calls += 1
      if (calls > 1) throw new Error('la page ne se laisse pas mesurer')
      return measure.call(el)
    }
    window.dispatchEvent(new Event('resize'))

    expect(calls).toBeGreaterThan(1)
    expect(el.classList.contains('min')).toBe(true)
    expect(el.classList.contains('top')).toBe(false)
    expect(el.classList.contains('away')).toBe(false)
    expect(el.hidden).toBe(false)
    fit.stop()
  })

  it('DRV-757 : le plafond de 200 ms du défilement : cinquante défilements d’affilée ne remesurent la carte qu’une fois, un défilement 250 ms plus tard la remesure', async () => {
    const el = card()
    const key = control(100, 150)
    const measure = el.getBoundingClientRect
    let measures = 0
    el.getBoundingClientRect = () => {
      measures += 1
      return measure.call(el)
    }
    const fit = fitGuide(window, el, options([key]))
    const afterStart = measures

    for (let i = 0; i < 50; i += 1) window.dispatchEvent(new Event('scroll'))
    const oneBurst = measures - afterStart

    // Une seule remesure (au plus six mesures de places), jamais cinquante
    expect(oneBurst).toBeGreaterThan(0)
    expect(oneBurst).toBeLessThanOrEqual(6)

    await new Promise((resolve) => setTimeout(resolve, 250))
    window.dispatchEvent(new Event('scroll'))
    expect(measures - afterStart - oneBurst).toBeGreaterThan(0)
    fit.stop()
  })
})
