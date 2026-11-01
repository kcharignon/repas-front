// Ce que la page d'Auchan montre de l'étape guidée (DRV-757) : le mur de cookies, la barre, le panneau de choix du drive (champ, ville proposée, magasins, « Utiliser ce magasin »).
// Formes PLAUSIBLES (le constat du 2026-11-01 : un DIV aria-modal, « Code postal, ville… », « Dardilly 69570 »). jsdom ne mesure rien : chaque test place ses éléments.
import { afterEach, describe, expect, it } from 'vitest'

import { AuchanAdapter } from '../src/auchan'
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

  it('une barre cachée n’est pas désignée ; la connexion sans contrôle montré ne cite aucun libellé', () => {
    const bar = add('a', 'Choisir vos courses', 10, document.body, { role: 'button' })
    bar.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)

    expect(readAuchanLook(document, 'store')).toBeNull()
    // La connexion : aucun contrôle montré, la carte dit où chercher (pas de libellé inventé)
    expect(readAuchanLook(document, 'login')).toMatchObject({ sub: 'connexion', target: null })
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

describe('Auchan : le cadre de vérification reCAPTCHA (DRV-757)', () => {
  const adapter = () =>
    new AuchanAdapter({
      fetch: () => Promise.reject(new Error('aucune requête')),
      location: { hostname: 'www.auchan.fr', pathname: '/courses' } as Location,
      document,
      authenticated: () => 'false',
      parseHtml: () => document,
      sleep: () => Promise.resolve(),
      timer: () => () => undefined,
      random: () => 0,
      now: () => 0,
    } as ConstructorParameters<typeof AuchanAdapter>[0])

  function frame(title: string, top: number, height: number, width = 300): HTMLIFrameElement {
    const el = document.createElement('iframe')
    el.setAttribute('title', title)
    document.body.appendChild(el)
    el.getBoundingClientRect = () =>
      ({
        top,
        bottom: top + height,
        left: 10,
        right: 10 + width,
        width,
        height,
        x: 10,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect
    return el
  }

  it('un petit cadre reCAPTCHA est gardé libre, avec le contrôle de connexion, sans réduire la carte', () => {
    const login = add('a', 'Se connecter', 20)
    const captcha = frame('reCAPTCHA', 300, 78)

    const look = adapter().guideLook('login')

    expect(look.keep).toEqual(expect.arrayContaining([login, captcha]))
    expect(look.crowded).toBe(false)
  })

  it('un cadre qui couvre plus de 30 % de la fenêtre (le défi image) réduit la carte', () => {
    const captcha = frame('recaptcha challenge', 100, 500, 700)

    const look = adapter().guideLook('login')

    expect(look.keep).toContain(captcha)
    expect(look.crowded).toBe(true)
  })

  it('un cadre d’un autre service n’est jamais gardé ; sans cadre la lecture est celle de la page', () => {
    frame('publicité', 300, 300, 700)

    const look = adapter().guideLook('login')

    expect(look.keep).toEqual([])
    expect(look.crowded).toBeUndefined()
  })
})

describe('Auchan : le mot que la personne voit (DRV-757, suite)', () => {
  const shownFor = (element: HTMLElement, hit: HTMLElement | null = element): void => {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => hit,
    })
    void element
  }
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('la barre : le libellé est celui de l’élément que la page MONTRE (opacité 0 écartée), même si un autre élément cache le même mot d’une autre phrase', () => {
    const ghost = add('a', 'Choisir vos courses', 10, document.body, { role: 'button' })
    ;(ghost as unknown as { checkVisibility: () => boolean }).checkVisibility = () => false
    const bar = add('a', 'Choisir mon mode de livraison', 60, document.body, { role: 'button' })

    const look = readAuchanLook(document, 'store')

    expect(look?.target).toMatchObject({ element: bar, label: 'Choisir mon mode de livraison' })
  })

  it('la barre : un élément que la page recouvre (le doigt tomberait ailleurs) passe après celui qui reçoit le toucher', () => {
    const covered = add('a', 'Choisir vos courses', 10, document.body, { role: 'button' })
    const touched = add('a', 'Choisir mon mode de livraison', 60, document.body, { role: 'button' })
    // Une fenêtre de la page recouvre le premier : le doigt tomberait sur elle
    const overlay = add('div', '', 0)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: (_x: number, y: number) => (y < 40 ? overlay : touched),
    })

    const look = readAuchanLook(document, 'store')

    expect(look?.target?.element).toBe(touched)
    expect(look?.target?.label).toBe('Choisir mon mode de livraison')
    expect(covered.isConnected).toBe(true)
  })

  it('un bouton sans texte dont le NOM ACCESSIBLE est « Choisir mon mode de livraison » est la barre : le libellé est son nom', () => {
    const bar = add('button', '', 60, document.body, {
      'aria-label': 'Choisir mon mode de livraison',
    })
    shownFor(bar)

    const look = readAuchanLook(document, 'store')

    expect(look?.sub).toBe('bar')
    expect(look?.target).toMatchObject({ element: bar, label: 'Choisir mon mode de livraison' })
  })

  it('la connexion : le contrôle de la page, montré, avec son libellé ; un « Me connecter » caché n’est jamais cité', () => {
    const hidden = add('a', 'Me connecter', 10)
    hidden.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
    const icon = add('button', '', 60)
    shownFor(icon)

    const nameless = readAuchanLook(document, 'login')

    // Le bouton du bandeau n'a aucun nom : la carte ne cite rien, elle dit où il est
    expect(nameless).toMatchObject({ sub: 'connexion', target: null })

    const link = add('a', 'Se connecter', 120)
    const named = readAuchanLook(document, 'login')
    expect(named?.target).toMatchObject({ element: link, label: 'Se connecter' })
  })

  it('les mots de la connexion d’Auchan : le libellé de la page, sinon « l’icône de connexion, en haut à droite »', () => {
    const text = GUIDE_TEXTS.connexion
    expect(text?.text).toContain('{label}')
    expect(text?.bare).toBe('Touche l’icône de connexion, en haut à droite de la page.')
  })
})
