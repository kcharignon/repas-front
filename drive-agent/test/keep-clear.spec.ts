// La lecture du mur de cookies et du contrôle entouré (DRV-753), dont la place de la carte (`fit.spec.ts`) se sert ; jamais d'écriture dans la page.
import { afterEach, describe, expect, it } from 'vitest'

import { consentRects, MAX_SCANNED, pointedRects } from '../src/ui/keep-clear'

/** Une boîte à l'écran : jsdom ne mesure rien, le test donne les positions. */
function box(top: number, bottom: number, left = 0, right = 300): DOMRect {
  return {
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  }
}

function measured(element: Element, rect: DOMRect): void {
  element.getBoundingClientRect = () => rect
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('les boutons du mur de cookies que la page montre', () => {
  it('lit « Tout accepter », « Continuer sans accepter », « Paramétrer les cookies » (libellé exact, sans accent ni casse) et rien d’autre', () => {
    document.body.innerHTML = `<div>
      <button id="a">Tout accepter</button>
      <button id="b">Continuer sans accepter</button>
      <a id="c" role="button">PARAMÉTRER LES COOKIES</a>
      <button id="d">Accepter les conditions générales de vente</button>
      <button id="e">Commencer mes courses</button>
    </div>`
    const rect = box(600, 650)
    for (const element of document.querySelectorAll('button, a')) measured(element, rect)

    expect(consentRects(document, 360, 800)).toHaveLength(3)
  })

  it('un bouton caché ou hors de l’écran n’est pas compté', () => {
    document.body.innerHTML =
      '<button id="a">Tout accepter</button><button id="b">Tout refuser</button>'
    measured(document.getElementById('a') as Element, box(0, 0, 0, 0))
    measured(document.getElementById('b') as Element, box(900, 950))

    expect(consentRects(document, 360, 800)).toEqual([])
  })
})

describe('le coût de la lecture (DRV-753 : une page de méga-menu)', () => {
  it('une page de 3000 contrôles se lit vite, par passe bornée depuis la FIN de la page (là où un mur s’ajoute)', () => {
    // Given : un mur au début (hors borne), 3000 liens de menu avec de gros blocs de texte, un mur à la fin
    const html = ['<button id="first">Tout accepter</button>']
    for (let i = 0; i < 3000; i += 1) {
      html.push(
        `<a href="/rayon-${i}"><span>Rayon ${i}</span><span>${'texte '.repeat(50)}</span><span>x</span><span>y</span></a>`,
      )
    }
    html.push('<button id="last">Tout accepter</button>')
    document.body.innerHTML = html.join('')
    const rect = box(600, 650)
    measured(document.getElementById('first') as Element, rect)
    measured(document.getElementById('last') as Element, rect)
    for (const element of document.querySelectorAll('a')) measured(element, box(0, 0, 0, 0))

    // When
    const started = performance.now()
    const found = consentRects(document, 360, 800)
    const elapsed = performance.now() - started

    // Then : le mur de la fin est lu, celui du début (au-delà de la borne) non ; le travail reste borné
    expect(found).toHaveLength(1)
    expect(MAX_SCANNED).toBeLessThan(3000)
    expect(elapsed).toBeLessThan(400)
  })
})

describe('le contrôle entouré, que la carte ne doit pas cacher', () => {
  it('rien à protéger sans contrôle, hors de l’écran ou recouvert par la page (un mur plein écran)', () => {
    document.body.innerHTML = '<input id="a"><div id="wall"></div>'
    const field = document.getElementById('a') as HTMLElement
    measured(field, box(100, 150))

    expect(pointedRects(null)).toEqual([])
    // Sans `elementFromPoint` on ne sait pas : on protège
    expect(pointedRects(field)).toHaveLength(1)
    // Recouvert par un autre élément : rien à protéger
    document.elementFromPoint = () => document.getElementById('wall')
    expect(pointedRects(field)).toEqual([])
    // Le contrôle lui-même au point : protégé, avec de la place autour pour le cadre et le repère
    document.elementFromPoint = () => field
    const [rect] = pointedRects(field)
    expect(rect?.top).toBeLessThan(100)
    expect(rect?.bottom).toBeGreaterThan(150)
    // Hors de l'écran : rien
    measured(field, box(-500, -450))
    expect(pointedRects(field)).toEqual([])
    delete (document as { elementFromPoint?: unknown }).elementFromPoint
  })
})
