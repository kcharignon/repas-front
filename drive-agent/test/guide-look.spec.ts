// Ce que la page de Leclerc montre de l'étape guidée (DRV-757) : la sous-étape, le contrôle à entourer, ce que la carte ne cache pas. jsdom ne mesure rien : chaque test place
// ses éléments. Aucune valeur de champ n'est lue (la lecture est refusée par le test).
import { afterEach, describe, expect, it } from 'vitest'

import { readLoginLook, readStoreLook } from '../src/leclerc/guide-look'
import { GUIDE_TEXTS } from '../src/leclerc/texts'

afterEach(() => {
  document.body.innerHTML = ''
})

/** Donne une boîte à un élément (jsdom n'en calcule pas). */
function at<T extends HTMLElement>(el: T, top: number, height = 40, left = 10, width = 300): T {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left,
      right: left + width,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}

function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  top: number,
  attrs: Record<string, string> = {},
  parent: HTMLElement = document.body,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.textContent = text
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  parent.appendChild(el)
  return at(el, top)
}

/** Un champ « Où souhaitez-vous récupérer vos courses ? » dont la valeur ne doit jamais être lue. */
function postalField(top = 100): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.setAttribute('aria-label', 'Où souhaitez-vous récupérer vos courses ?')
  Object.defineProperty(input, 'value', {
    get() {
      throw new Error('la valeur d’un champ ne se lit jamais')
    },
  })
  document.body.appendChild(input)
  return at(input, top)
}

describe('le choix du magasin, sous-étape par sous-étape', () => {
  it('champ à remplir : la sous-étape « field », le champ entouré et gardé libre', () => {
    const field = postalField()

    const look = readStoreLook(document)

    expect(look.sub).toBe('field')
    expect(look.target?.element).toBe(field)
    expect(look.keep).toEqual([field])
  })

  it('une ville est proposée sous le champ (un contrôle qui porte un code postal) : « city », la ville entourée', () => {
    const field = postalField()
    add('button', 'Saint-Bonnet-de-Mure, Rhône (69720)', 150)
    const suggestion = add('button', 'Villefontaine, Isère (38090)', 200)

    const look = readStoreLook(document)

    expect(look.sub).toBe('city')
    expect(look.target?.element.textContent).toBe('Saint-Bonnet-de-Mure, Rhône (69720)')
    expect(look.keep).toContain(field)
    expect(look.keep).toContain(suggestion)
  })

  it('une ligne au-dessus du champ ou sans code postal n’est pas une ville proposée', () => {
    postalField(100)
    add('button', 'Mon compte (12345)', 40)
    add('button', 'Aide', 160)

    expect(readStoreLook(document).sub).toBe('field')
  })

  it('les magasins sont proposés (« Choisissez votre service… ») : « shop », la flèche du premier à toucher, les deux suivants évités ; les puces sont des filtres', () => {
    postalField()
    add('h2', 'Choisissez votre service autour du 69720', 200)
    for (const [index, chip] of [
      'Tous',
      'Drive',
      'Retrait piéton',
      'Livraison à domicile',
    ].entries())
      add('button', chip, 240 + index)
    const arrows = [0, 1, 2, 3].map((index) =>
      add('button', '', 300 + 130 * index, { 'aria-label': 'Choisir ce magasin' }),
    )

    const look = readStoreLook(document)

    expect(look.sub).toBe('shop')
    expect(look.target?.element).toBe(arrows[0])
    expect(look.keep).toEqual([arrows[0]])
    expect(look.maybe).toEqual([arrows[1], arrows[2]])
  })

  it('la page ne dit rien de connu : le champ du code postal, ou rien', () => {
    expect(readStoreLook(document)).toMatchObject({ sub: null, target: null, keep: [] })
  })
})

describe('la connexion', () => {
  const where = (hostname: string, pathname: string) => ({ hostname, pathname })
  const COURSES = where('m-courses.leclercdrive.fr', '/magasin-000001-000001-ville-test')
  const ACCOUNT = (page: string) =>
    where('fd8-espace-client.leclercdrive.fr', `/drive/magasin-000001-000001-Ville-Test/${page}`)

  it('menu fermé : le bouton du menu est entouré', () => {
    const menu = add('button', 'Menu', 10, { 'aria-label': 'Menu' })
    const login = add('a', 'Connexion / Inscription', 0)
    login.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)

    const look = readLoginLook(document, COURSES, true)

    expect(look.sub).toBe('menu')
    expect(look.target?.element).toBe(menu)
  })

  it('menu ouvert : « Connexion / Inscription » a deux zones, seul le mot « Connexion » est entouré', () => {
    const login = add('a', 'Connexion / Inscription', 60)

    const look = readLoginLook(document, COURSES, true)

    expect(look.sub).toBe('connexion')
    expect(look.target).toMatchObject({ element: login, word: 'Connexion' })
    expect(look.keep).toEqual([login])
  })

  it('deux liens séparés : le lien « Connexion » est entouré tout entier (pas de mot à isoler)', () => {
    const login = add('a', 'Connexion', 60)
    add('a', 'Inscription', 60)

    const look = readLoginLook(document, COURSES, true)

    expect(look.sub).toBe('connexion')
    expect(look.target?.element).toBe(login)
    expect(look.target?.word).toBeUndefined()
  })

  it('la création de compte (adresse) : « signup », le lien « Me connecter » est entouré', () => {
    const link = add('a', 'Me connecter', 80)

    const look = readLoginLook(document, ACCOUNT('creation-compte-ccc.aspx'), false)

    expect(look.sub).toBe('signup')
    expect(look.target?.element).toBe(link)
  })

  it('la page de connexion (adresse) : « form », les champs et le bouton de la page restent libres ; aucun contrôle entouré', () => {
    const email = add('input', '', 100, { type: 'email' })
    const next = add('button', 'Continuer', 160)
    add('button', 'Aide', 400)

    const look = readLoginLook(document, ACCOUNT('authentification.aspx'), false)

    expect(look.sub).toBe('form')
    expect(look.target).toBeNull()
    expect(look.keep).toEqual([email, next])
  })

  it('la fenêtre du code reçu par e-mail : « code », les six cases et « Valider » restent libres', () => {
    add('h2', 'Saisissez le code reçu par e-mail', 100)
    const digits = [0, 1, 2, 3, 4, 5].map((index) =>
      at(add('input', '', 180, { maxlength: '1' }), 180, 40, 10 + 50 * index, 40),
    )
    const validate = add('button', 'Valider', 300)

    const look = readLoginLook(document, ACCOUNT('authentification.aspx'), false)

    expect(look.sub).toBe('code')
    expect(look.keep).toEqual([...digits, validate])
  })

  it('une fenêtre du code cachée n’en est pas une', () => {
    const title = add('h2', 'Saisissez le code reçu par e-mail', 100)
    title.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)

    expect(readLoginLook(document, ACCOUNT('authentification.aspx'), false).sub).toBe('form')
  })

  it('une page qui n’est pas celle de la version mobile : le contrôle de connexion seul, sans sous-étape', () => {
    const login = add('a', 'Se connecter', 60)

    const look = readLoginLook(document, where('www.leclercdrive.fr', '/'), false)

    expect(look.sub).toBeNull()
    expect(look.target?.element).toBe(login)
  })
})

describe('les mots de chaque sous-étape (voix de repas-po)', () => {
  it('quinze mots au plus par phrase, tutoiement, aucun jargon ni mot d’alerte', () => {
    for (const { text, short } of Object.values(GUIDE_TEXTS)) {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(15)
      }
      expect(short.split(/\s+/).length).toBeLessThanOrEqual(6)
      expect(`${text} ${short}`).not.toMatch(/erreur|échec|introuvable|incident|fermer|!/i)
    }
  })

  it('chaque sous-étape dit autre chose que les autres', () => {
    const texts = Object.values(GUIDE_TEXTS).map((entry) => entry.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('le texte du magasin ne parle jamais de connexion', () => {
    for (const sub of ['field', 'city', 'shop'] as const) {
      expect(GUIDE_TEXTS[sub]?.text).not.toMatch(/connect|identifi|mot de passe/i)
    }
  })
})
