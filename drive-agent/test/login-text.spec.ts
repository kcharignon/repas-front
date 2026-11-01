// La page de connexion se reconnaît à ce qu'elle MONTRE (DRV-759) : le texte « Connectez-vous avec votre compte… » ET un champ de saisie montré. Mesuré sur le téléphone : ce texte
// existe aussi, CACHÉ, sur l'accueil de Leclerc et sur la présentation du magasin ; le lire dans tout le document faisait dire « Étape 2 sur 2 · Connecte-toi » à l'accueil, et l'agent
// n'entrait plus dans le magasin. Jamais le texte d'un script, d'un élément caché (hidden, display:none, hors écran, visibility:hidden), ni sans champ montré.
import { afterEach, describe, expect, it } from 'vitest'

import { showsLoginText } from '../src/leclerc/guide-look'

const TEXT = 'Connectez-vous avec votre compte unique E.Leclerc.'

/** Un élément dont la boîte est donnée (jsdom ne mesure rien) ; `visible: false` : aucune boîte, comme un élément caché. */
function shown<T extends HTMLElement>(
  el: T,
  box: { left: number; width: number } | null = { left: 20, width: 300 },
): T {
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      bottom: box === null ? 100 : 140,
      left: box?.left ?? 0,
      right: (box?.left ?? 0) + (box?.width ?? 0),
      width: box?.width ?? 0,
      height: box === null ? 0 : 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}

function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  html: string,
  box: { left: number; width: number } | null = { left: 20, width: 300 },
  parent: HTMLElement = document.body,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.innerHTML = html
  parent.appendChild(el)
  return shown(el, box)
}

const field = () => add('input', '', { left: 20, width: 300 })

afterEach(() => {
  document.body.innerHTML = ''
})

describe('showsLoginText', () => {
  it('le texte MONTRÉ et un champ montré : la page de connexion', () => {
    add('p', TEXT)
    field()

    expect(showsLoginText(document)).toBe(true)
  })

  it('le texte sans aucun champ montré n’est pas la page de connexion', () => {
    add('p', TEXT)

    expect(showsLoginText(document)).toBe(false)
  })

  it('un champ montré sans le texte non plus (l’accueil et son code postal)', () => {
    add('p', 'Choisissez votre drive')
    field()

    expect(showsLoginText(document)).toBe(false)
  })

  it.each([
    ['hidden', (el: HTMLElement) => el.setAttribute('hidden', ''), null],
    ['display:none', (el: HTMLElement) => el.setAttribute('style', 'display:none'), null],
    [
      'hors écran',
      (el: HTMLElement) => el.setAttribute('style', 'position:absolute;left:-9999px'),
      { left: -9999, width: 300 },
    ],
    ['visibility:hidden', (el: HTMLElement) => el.setAttribute('style', 'visibility:hidden'), null],
  ] as const)('le texte caché (%s) ne fait pas une page de connexion', (_name, hide, box) => {
    const hidden = add('p', TEXT, box)
    hide(hidden)
    field()

    expect(showsLoginText(document)).toBe(false)
  })

  it('le texte d’un script, d’un JSON embarqué ou d’un noscript n’est pas montré', () => {
    // (un navigateur ne leur donne aucune boîte : `display: none` par défaut ; l'e2e de l'accueil le prouve avec un vrai navigateur)
    add('script', `var page = {"titre":"${TEXT}"}`, null)
    add('noscript', TEXT, null)
    add('style', `/* ${TEXT} */`, null)
    field()

    expect(showsLoginText(document)).toBe(false)
  })

  it('un champ caché ne compte pas non plus', () => {
    add('p', TEXT)
    add('input', '', null)
    const typeHidden = add('input', '')
    typeHidden.setAttribute('type', 'hidden')

    expect(showsLoginText(document)).toBe(false)
  })
})
