// Le nom accessible d'un contrôle (DRV-761, DRV-764) : le libellé que la carte cite, dans l'ordre des noms accessibles (aria-labelledby, aria-label, texte visible).
// Une lecture seule : le texte (jamais du HTML de la page), un identifiant introuvable est ignoré.
import { afterEach, describe, expect, it } from 'vitest'

import { accessibleName } from '../src/retailers/guide'

afterEach(() => {
  document.body.innerHTML = ''
})

function page(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.querySelector<HTMLElement>('#c') as HTMLElement
}

const LONG = 'Ceci est une phrase beaucoup trop longue pour être un libellé de bouton'

describe('accessibleName', () => {
  it('lit le texte du contrôle, nettoyé', () => {
    expect(accessibleName(page('<button id="c">  Choisir \n  mon magasin </button>'))).toBe(
      'Choisir mon magasin',
    )
  })

  it("préfère l'aria-label au texte visible", () => {
    expect(accessibleName(page('<button id="c" aria-label="Menu">≡</button>'))).toBe('Menu')
  })

  it("préfère aria-labelledby à l'aria-label et au texte", () => {
    const el = page(
      '<span id="a">Choisir</span><span id="b">mon magasin</span><button id="c" aria-labelledby="a b" aria-label="Autre">Texte</button>',
    )
    expect(accessibleName(el)).toBe('Choisir mon magasin')
  })

  it('ignore un identifiant introuvable et garde ceux qui existent', () => {
    const el = page(
      '<span id="a">Choisir</span><button id="c" aria-labelledby="nope a">Texte</button>',
    )
    expect(accessibleName(el)).toBe('Choisir')
  })

  it("passe à l'aria-label quand aria-labelledby ne mène à rien ou à rien d'écrit", () => {
    expect(
      accessibleName(page('<button id="c" aria-labelledby="nope" aria-label="Menu">≡</button>')),
    ).toBe('Menu')
    expect(
      accessibleName(
        page(
          '<span id="a"> </span><button id="c" aria-labelledby="a" aria-label="Menu">≡</button>',
        ),
      ),
    ).toBe('Menu')
  })

  it('passe au candidat suivant quand le nom cité est trop long (plus de 40 caractères)', () => {
    expect(
      accessibleName(
        page(
          `<span id="a">${LONG}</span><button id="c" aria-labelledby="a" aria-label="Menu">≡</button>`,
        ),
      ),
    ).toBe('Menu')
    expect(
      accessibleName(page(`<button id="c" aria-label="${LONG}">Retour au magasin</button>`)),
    ).toBe('Retour au magasin')
  })

  it('accepte 40 caractères et refuse 41', () => {
    expect(accessibleName(page(`<button id="c">${'a'.repeat(40)}</button>`))).toBe('a'.repeat(40))
    expect(accessibleName(page(`<button id="c">${'a'.repeat(41)}</button>`))).toBeNull()
  })

  it('rend null quand tout est vide ou trop long', () => {
    expect(accessibleName(page('<button id="c"> </button>'))).toBeNull()
    expect(accessibleName(page(`<button id="c" aria-label="${LONG}">${LONG}</button>`))).toBeNull()
  })

  it("ne lit que du texte : le HTML d'un nom cité n'est jamais injecté", () => {
    const el = page(
      '<span id="a"><img src="x" onerror="alert(1)">Valider</span><button id="c" aria-labelledby="a"></button>',
    )
    expect(accessibleName(el)).toBe('Valider')
    expect(document.body.querySelectorAll('img')).toHaveLength(1)
  })

  it("résout l'identifiant dans le shadow DOM de l'élément", () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML =
      '<span id="a">Dans l’ombre</span><button id="c" aria-labelledby="a"></button>'
    expect(accessibleName(shadow.querySelector('#c') as Element)).toBe('Dans l’ombre')
  })

  it('ignore un élément hors du document (sans racine qui sache chercher)', () => {
    const button = document.createElement('button')
    button.setAttribute('aria-labelledby', 'a')
    button.textContent = 'Texte'
    expect(accessibleName(button)).toBe('Texte')
  })
})
