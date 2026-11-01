// La place de la carte du guide (DRV-757) : réduite à une barre fine quand la page a besoin de la place, jamais sur un champ où l'on écrit, un contrôle à toucher ou un
// bouton d'un mur de cookies ; elle revient d'elle-même ensuite. jsdom ne mesure rien : les tests donnent les positions (la preuve avec un vrai navigateur est
// `e2e/carte-guide.spec.ts`).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { choose, fitGuide, leastCovered, typingIn } from '../src/ui/fit'

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
const placed = (spot: { min: boolean; top: boolean; mid?: boolean }) =>
  spot.min
    ? spot.mid
      ? box(350, 400)
      : spot.top
        ? box(8, 58)
        : box(700, 750)
    : spot.top
      ? box(8, 268)
      : box(500, 760)

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

  it('DRV-757 : le haut et le bas portent des réponses du mur : la barre se pose au MILIEU ; si le milieu aussi, aucune place', () => {
    const blocked = [box(10, 40), box(700, 750)]
    expect(choose(placed, blocked, blocked, true)).toEqual({ min: true, top: false, mid: true })
    const all = [...blocked, box(360, 380)]
    expect(choose(placed, all, all, true)).toBeNull()
  })

  it('la barre cache le moins possible : un contrôle qu’on évite sans y tenir peut passer dessous, jamais un contrôle à toucher', () => {
    const soft = box(710, 740)
    const hard = box(20, 40)
    const middle = box(360, 380)
    expect(choose(placed, [hard, soft, middle], [hard], true)).toEqual({ min: true, top: false })
    expect(choose(placed, [hard, soft, middle], [hard, box(720, 730), middle], true)).toBeNull()
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

  it('DRV-759 : sans place libre, la barre se pose là où elle couvre le MOINS de ce qu’on ne couvre pas, jamais nulle part', () => {
    // Haut (8-58), bas (700-750) et milieu (350-400) portent tous quelque chose ; le milieu en couvre le moins
    const hard = [box(0, 70, 0, 300), box(690, 760, 0, 300), box(360, 380, 0, 100)]
    expect(choose(placed, hard, hard, true)).toBeNull()
    expect(leastCovered(placed, hard)).toEqual({ min: true, top: false, mid: true })
  })

  describe('DRV-759 : un mur de cookies dense, sans place libre', () => {
    const answer = (label: string, top: number, bottom: number) => {
      const el = document.createElement('button')
      el.textContent = label
      document.body.appendChild(el)
      el.getBoundingClientRect = () => rect(top, bottom)
      return el
    }
    /** La carte du mur : la barre en bas (700-750), en haut (8-58) ou au milieu (350-400). */
    const wallCard = () => {
      const el = document.createElement('section')
      document.body.appendChild(el)
      el.getBoundingClientRect = () => {
        const box = el.classList.contains('mid')
          ? [350, 400]
          : el.classList.contains('top')
            ? [8, 58]
            : [700, 750]
        return rect(box[0] ?? 0, box[1] ?? 0)
      }
      return el
    }
    const wallOptions = (keep: HTMLElement[]) => ({
      needs: () => ({ keep, maybe: [], sub: 'wall' as const, target: null, compact: true }),
      consent: true,
      collapsible: true,
      pointed: () => null,
      changed: () => undefined,
    })

    it('le haut, le milieu et le bas portent une réponse : la carte n’est jamais effacée et couvre la MOINS importante, jamais « Continuer sans accepter »', () => {
      const refuse = answer('Continuer sans accepter', 10, 60)
      const settings = answer('Paramétrer les cookies', 340, 410)
      const accept = answer('Tout accepter', 690, 760)
      const el = wallCard()

      const fit = fitGuide(window, el, wallOptions([refuse, settings, accept]))

      expect(el.hidden).toBe(false)
      expect(el.classList.contains('away')).toBe(false)
      expect(el.classList.contains('mid')).toBe(true) // sur « Paramétrer les cookies »
      fit.stop()
    })

    it.each([
      ['Poursuivre sans consentir', 'refus'],
      ['Refuser et continuer', 'refus'],
      ['Non merci', 'refus'],
    ])(
      '« %s » (un refus que la lecture ne connaît pas par son libellé exact) est pesé comme un refus : la carte se pose sur un contrôle sans importance, pas dessus',
      (label) => {
        // Le refus est EN BAS, là où la carte se poserait d'abord à égalité ; deux autres contrôles du mur, sans rapport avec un refus, tiennent le haut et le milieu
        const other = answer('Voir nos partenaires', 8, 58)
        const middle = answer('Lire la suite', 350, 400)
        const refusal = answer(label, 700, 750)
        const el = wallCard()

        const fit = fitGuide(window, el, wallOptions([other, middle, refusal]))

        expect(el.hidden).toBe(false)
        expect(el.classList.contains('top')).toBe(true) // ni sur le refus (bas), ni la première place par défaut
        fit.stop()
      },
    )

    it('une zone sans réponse existe (le texte du mur, au milieu) : la barre s’y pose et ne couvre aucune réponse', () => {
      const refuse = answer('Continuer sans accepter', 10, 60)
      const accept = answer('Tout accepter', 690, 760)
      const el = wallCard()

      const fit = fitGuide(window, el, wallOptions([refuse, accept]))

      expect(el.classList.contains('mid')).toBe(true)
      expect(el.hidden).toBe(false)
      fit.stop()
    })
  })
})
