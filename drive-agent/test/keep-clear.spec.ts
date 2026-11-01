// La carte du guide ne cache jamais les boutons d'un mur de cookies (DRV-753) : en bas, ou en haut quand le bas les couvrirait ; jamais d'écriture dans la page.
import { afterEach, describe, expect, it } from 'vitest'

import { arrange, AT_TOP, consentRects } from '../src/ui/keep-clear'

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

describe('la place de la carte', () => {
  const card = (rect: () => DOMRect) => {
    const el = document.createElement('div')
    el.getBoundingClientRect = rect
    return el
  }

  it('aucun bouton de mur : en bas', () => {
    const el = card(() => box(500, 760))
    el.classList.add(AT_TOP)

    arrange(el, [])

    expect(el.classList.contains(AT_TOP)).toBe(false)
  })

  it('le bas couvrirait un bouton du mur : la carte passe en haut', () => {
    // La boîte de la carte dépend de sa classe : en bas 500-760, en haut 8-268
    const el = document.createElement('div')
    el.getBoundingClientRect = () => (el.classList.contains(AT_TOP) ? box(8, 268) : box(500, 760))

    arrange(el, [box(640, 690)])

    expect(el.classList.contains(AT_TOP)).toBe(true)
  })

  it('le bas est libre : la carte reste en bas', () => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => (el.classList.contains(AT_TOP) ? box(8, 268) : box(500, 760))

    arrange(el, [box(100, 150)])

    expect(el.classList.contains(AT_TOP)).toBe(false)
  })

  it('les deux places couvrent un bouton : elle reste en bas (jamais pire)', () => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => (el.classList.contains(AT_TOP) ? box(8, 268) : box(500, 760))

    arrange(el, [box(100, 150), box(640, 690)])

    expect(el.classList.contains(AT_TOP)).toBe(false)
  })
})
