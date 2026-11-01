// Ce que la page d'Auchan montre de l'étape guidée (DRV-757) : le mur de cookies, la barre, le panneau de choix du drive (champ, ville proposée, magasins, « Utiliser ce magasin »).
// Formes PLAUSIBLES (le constat du 2026-11-01 : un DIV aria-modal, « Code postal, ville… », « Dardilly 69570 »). jsdom ne mesure rien : chaque test place ses éléments.
import { afterEach, describe, expect, it } from 'vitest'

import { readAuchanLook } from '../src/auchan/guide-look'
import { GUIDE_TEXTS } from '../src/auchan/texts'

afterEach(() => {
  document.body.innerHTML = ''
})

function at<T extends HTMLElement>(el: T, top: number, height = 40): T {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 10,
      right: 310,
      width: 300,
      height,
      x: 10,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}
function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  top: number,
  parent: HTMLElement = document.body,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.textContent = text
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  parent.appendChild(el)
  return at(el, top)
}
/** Le panneau : un DIV aria-modal avec son champ (dont la valeur ne se lit jamais). */
function panel(): { box: HTMLElement; field: HTMLInputElement } {
  const box = add('div', '', 0, document.body, { 'aria-modal': 'true' })
  const field = document.createElement('input')
  field.type = 'text'
  Object.defineProperty(field, 'value', {
    get() {
      throw new Error('la valeur d’un champ ne se lit jamais')
    },
  })
  box.appendChild(field)
  at(field, 80)
  return { box, field }
}

describe('Auchan : la sous-étape lue dans la page', () => {
  it('la barre à toucher : « bar », avec le libellé que la page affiche (les deux textes connus)', () => {
    for (const label of ['Choisir vos courses', 'Choisir mon mode de livraison']) {
      document.body.innerHTML = ''
      const bar = add('a', label, 10, document.body, { role: 'button' })

      const look = readAuchanLook(document, 'store')

      expect(look?.sub).toBe('bar')
      expect(look?.target).toMatchObject({ element: bar, label })
      expect(look?.keep).toEqual([bar])
    }
  })

  it('le mur de cookies d’abord : « wall », rien n’est entouré (la barre est derrière)', () => {
    add('a', 'Choisir vos courses', 10, document.body, { role: 'button' })
    add('button', 'Continuer sans accepter', 500)

    const look = readAuchanLook(document, 'store')

    expect(look).toMatchObject({ sub: 'wall', target: null, keep: [] })
  })

  it('le panneau de choix ouvert : « field », le champ entouré et gardé libre', () => {
    const { field } = panel()

    const look = readAuchanLook(document, 'store')

    expect(look?.sub).toBe('field')
    expect(look?.target?.element).toBe(field)
    expect(look?.keep).toContain(field)
  })

  it('une ville proposée sous le champ (« Dardilly 69570 ») : « city », la ville entourée, le champ gardé libre', () => {
    const { box, field } = panel()
    const city = add('button', 'Dardilly 69570', 130, box)

    const look = readAuchanLook(document, 'store')

    expect(look?.sub).toBe('city')
    expect(look?.target?.element).toBe(city)
    expect(look?.keep).toEqual([field, city])
  })

  it('la liste des drives : « shop », le premier bouton à toucher, les suivants évités', () => {
    const { box } = panel()
    const picks = [0, 1, 2, 3].map((index) =>
      add('button', 'Choisir ce drive', 140 + 120 * index, box),
    )

    const look = readAuchanLook(document, 'store')

    expect(look?.sub).toBe('shop')
    expect(look?.target?.element).toBe(picks[0])
    expect(look?.maybe).toEqual([picks[1], picks[2]])
  })

  it('« Utiliser ce magasin » : « confirm », le bouton cité avec son libellé', () => {
    const { box } = panel()
    const keep = add('button', 'Utiliser ce magasin', 150, box)

    const look = readAuchanLook(document, 'store')

    expect(look?.sub).toBe('confirm')
    expect(look?.target).toMatchObject({ element: keep, label: 'Utiliser ce magasin' })
  })

  it('une barre cachée n’est pas désignée ; rien à lire pour la connexion : la page ne dit rien', () => {
    const bar = add('a', 'Choisir vos courses', 10, document.body, { role: 'button' })
    bar.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)

    expect(readAuchanLook(document, 'store')).toBeNull()
    expect(readAuchanLook(document, 'login')).toBeNull()
  })
})

describe('Auchan : les mots de chaque sous-étape (voix de repas-po)', () => {
  it('quinze mots au plus par phrase, le libellé cité est celui de la page (jamais écrit en dur), aucun mot d’alerte', () => {
    for (const { text, short, bare } of Object.values(GUIDE_TEXTS)) {
      for (const sentence of [text, bare ?? ''].flatMap((one) => one.split(/(?<=[.!?])\s+/))) {
        expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(15)
      }
      expect(`${text} ${short}`).not.toMatch(
        /choisir vos courses|mode de livraison|erreur|incident|fermer|!/i,
      )
      // Une phrase qui cite un libellé en a une version sans libellé
      expect(text.includes('{label}') && bare === undefined).toBe(false)
    }
  })
})
