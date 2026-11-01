// Le mur de cookies (DRV-757) : « D'abord, réponds aux cookies » seulement devant un VRAI mur, jamais pour un lien qui reste dans la page après la réponse.
import { afterEach, describe, expect, it } from 'vitest'

import { consentButtons, wallLook } from '../src/retailers/consent'

afterEach(() => {
  document.body.innerHTML = ''
})

function at<T extends HTMLElement>(el: T, top: number, size = { width: 300, height: 40 }): T {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + size.height,
      left: 0,
      right: size.width,
      width: size.width,
      height: size.height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}

function button(text: string, top: number, parent: HTMLElement = document.body): HTMLButtonElement {
  const el = document.createElement('button')
  el.textContent = text
  parent.appendChild(el)
  return at(el, top)
}

describe('un mur de cookies est là seulement devant une réponse franche', () => {
  it.each(['Tout accepter', 'Continuer sans accepter', 'Tout refuser', 'Refuser tout'])(
    '« %s » visible : un mur',
    (label) => {
      button(label, 500)

      expect(wallLook(document)?.sub).toBe('wall')
    },
  )

  it.each([
    'Gérer mes cookies',
    'Personnaliser',
    'Paramétrer les cookies',
    'Paramètres des cookies',
    'Accepter',
  ])(
    'un lien persistant « %s » seul n’est pas un mur : la carte ne dit pas de répondre aux cookies, le repère reste',
    (label) => {
      button(label, 700)

      expect(wallLook(document)).toBeNull()
      // La carte se tient quand même hors de ce bouton
      expect(consentButtons(document, 1024, 768)).toHaveLength(1)
    },
  )

  it('après la réponse, le lien « Gérer mes cookies » qui reste dans le pied de page ne rappelle pas le mur', () => {
    const wall = document.createElement('div')
    document.body.appendChild(wall)
    button('Tout accepter', 500, wall)
    button('Gérer mes cookies', 740)
    expect(wallLook(document)?.sub).toBe('wall')

    wall.remove()

    expect(wallLook(document)).toBeNull()
  })

  it('une boîte fixe qui couvre une grande part de l’écran est un mur, même avec un libellé non franc', () => {
    const box = at(document.createElement('div'), 0, { width: 1024, height: 700 })
    box.setAttribute('style', 'position:fixed;inset:0')
    document.body.appendChild(box)
    button('Personnaliser', 600, box)

    expect(wallLook(document)?.sub).toBe('wall')
  })

  it('une petite boîte fixe (une bannière basse) n’en est pas un tant que sa réponse n’est pas franche', () => {
    const box = at(document.createElement('div'), 700, { width: 1024, height: 60 })
    box.setAttribute('style', 'position:fixed;bottom:0')
    document.body.appendChild(box)
    button('Personnaliser', 710, box)

    expect(wallLook(document)).toBeNull()
  })

  it.each([
    'Continuer sans accepter →',
    'Continuer sans accepter  ›',
    '→ Continuer sans accepter',
    'Continuer sans accepter.',
    'Tout accepter »',
  ])(
    'DRV-757 : « %s » (le lien du HAUT du mur, flèche ou ponctuation dans son libellé) est une réponse du mur : la carte s’en tient à l’écart',
    (label) => {
      const link = document.createElement('a')
      link.setAttribute('role', 'button')
      link.textContent = label
      document.body.appendChild(link)
      at(link, 20)

      expect(consentButtons(document, 1024, 768)).toEqual([link])
      expect(wallLook(document)?.sub).toBe('wall')
    },
  )
})
