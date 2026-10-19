// L'interface superposée (DRV-304) : chaque écran (rendu, réponses, échappement), le focus et l'isolation. jsdom, sans réseau.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { h } from '../src/ui/dom'
import { createUi, ERROR_TEXTS, renderPicker, type UiHandle } from '../src/ui'
import { STYLES } from '../src/ui/styles'
import type { ChooserProps, DiagnosticRow, DiagnosticView, EndProps, SummaryProps } from '../src/ui'
import { ERROR_CODES } from '../protocol'

const HOSTILE = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>'

let ui: UiHandle | null = null

/** L'interface en mode ouvert : seul moyen pour un test de lire le Shadow DOM, qu'en production la page ne peut pas lire. */
function open(): UiHandle {
  ui = createUi({ mode: 'open' })
  return ui
}

const shadow = () => (ui?.host?.shadowRoot ?? null) as ShadowRoot
const buttons = () => [...shadow().querySelectorAll('button')]
const labels = () => buttons().map((button) => button.textContent)
/** Les boutons que l'utilisateur voit : ceux d'une partie cachée (`hidden`) ne comptent pas. */
const visibleLabels = () =>
  buttons()
    .filter((button) => !button.closest('[hidden]'))
    .map((button) => button.textContent)
const press = (label: string) => {
  const found = buttons().find((button) => button.textContent === label)
  if (!found) throw new Error(`Pas de bouton « ${label} » parmi ${labels().join(', ')}`)
  found.click()
}

afterEach(() => {
  ui?.close()
  ui = null
  document.body.innerHTML = ''
})

const SUMMARY: SummaryProps = {
  known: 2,
  new: 1,
  haveAtHome: 1,
  skipped: 0,
  lines: [
    { name: 'Farine', status: 'KNOWN', detail: 'Farine T55 1 kg' },
    { name: 'Poivre', status: 'NEW' },
    { name: 'Sel', status: 'HAVE_AT_HOME' },
  ],
}

const END: EndProps = {
  outcome: 'completed',
  added: 2,
  chosen: 1,
  haveAtHome: 1,
  skipped: 0,
  unavailable: 0,
  failed: 0,
}

describe('le conteneur', () => {
  it('ne montre rien tant qu’aucun écran n’est affiché, puis se pose dans la page', async () => {
    const before = document.documentElement.outerHTML
    const handle = open()
    expect(document.documentElement.outerHTML).toBe(before)
    expect(handle.host).toBeNull()

    void handle.show('welcome', {})

    expect(handle.host?.parentElement).toBe(document.documentElement)
  })

  it('est fermé par défaut : la page ne lit pas l’interface', () => {
    const closed = createUi()
    void closed.show('welcome', {})

    expect(closed.host?.shadowRoot).toBeNull()
    closed.close()
  })

  it('est épinglé par des déclarations !important que les règles de la page ne battent pas', () => {
    const handle = open()
    void handle.show('welcome', {})

    for (const name of ['display', 'position', 'z-index', 'visibility']) {
      expect(handle.host?.style.getPropertyPriority(name)).toBe('important')
    }
    expect(handle.host?.style.getPropertyValue('z-index')).toBe('2147483647')
  })

  it('se retire de la page à la fermeture et se recrée à l’écran suivant', () => {
    const handle = open()
    void handle.show('welcome', {})
    handle.close()
    expect(document.documentElement.contains(handle.host)).toBe(false)
    expect(handle.host).toBeNull()

    void handle.show('welcome', {})

    expect(handle.host?.isConnected).toBe(true)
  })

  it('porte sa feuille de style dans le Shadow DOM, sans rien ajouter à la page', () => {
    const handle = open()
    void handle.show('welcome', {})

    const sheets = shadow().adoptedStyleSheets.length + shadow().querySelectorAll('style').length
    expect(sheets).toBe(1)
    expect(document.querySelector('style')).toBeNull()
  })

  it('se rabat sur une balise style quand la feuille adoptée est impossible', () => {
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        constructor() {
          throw new Error('non pris en charge')
        }
      },
    )
    const handle = open()
    void handle.show('welcome', {})

    const css = shadow().querySelector('style')?.textContent ?? ''
    expect(css).toContain('prefers-color-scheme:dark')
    expect(css).toContain('prefers-reduced-motion')
    vi.unstubAllGlobals()
  })

  it('est une boîte de dialogue modale nommée', () => {
    const handle = open()
    void handle.show('welcome', {})

    const dialog = shadow().querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-label')).toBeTruthy()
  })
})

describe('la demande de vérification de l’anti-robot (ticket K)', () => {
  const host = () => ui?.host as HTMLElement
  const overlay = () => shadow().querySelector('.overlay') as HTMLElement
  const backdrop = () => shadow().querySelector('.backdrop') as HTMLElement

  it('dit quoi faire : faire la vérification dans la page, puis toucher « Reprendre »', () => {
    const handle = open()
    void handle.show('challenge', {})

    expect(shadow().querySelector('h1')?.textContent).toBe('Leclerc demande une vérification')
    expect(shadow().textContent).toContain('Faites-la dans la page, puis touchez Reprendre.')
    expect(labels()).toEqual(['Reprendre', 'Arrêter'])
    expect(shadow().activeElement?.textContent).toBe('Reprendre')
  })

  it.each([
    ['Reprendre', 'resume'],
    ['Arrêter', 'stop'],
  ])('« %s » rend « %s »', async (label, expected) => {
    const handle = open()
    const answer = handle.show('challenge', {})

    press(label)

    await expect(answer).resolves.toBe(expected)
  })

  it('laisse la page visible et touchable derrière : un bandeau, sans fond, qui ne capte aucun toucher hors de lui', () => {
    const handle = open()
    void handle.show('challenge', {})

    expect(host().style.getPropertyValue('pointer-events')).toBe('none')
    expect(host().style.getPropertyPriority('pointer-events')).toBe('important')
    expect(overlay().classList.contains('sheet')).toBe(true)
    expect(backdrop().hidden).toBe(true)
    expect(overlay().getAttribute('aria-modal')).toBe('false')
    expect(STYLES).toMatch(/\.overlay\.sheet\s*\{[^}]*pointer-events:none/)
    expect(STYLES).toMatch(/\.overlay\.sheet>\.screen\s*\{[^}]*pointer-events:auto/)
  })

  it('un écran suivant reprend toute la fenêtre : fond, toucher capté, boîte de dialogue modale', () => {
    const handle = open()
    void handle.show('challenge', {})

    void handle.show('progress', { total: 2, done: 0, current: 'Farine', log: [] })

    expect(host().style.getPropertyValue('pointer-events')).toBe('auto')
    expect(overlay().classList.contains('sheet')).toBe(false)
    expect(backdrop().hidden).toBe(false)
    expect(overlay().getAttribute('aria-modal')).toBe('true')
  })

  it('un écran ordinaire ne touche pas aux réglages du bandeau', () => {
    const handle = open()
    void handle.show('summary', SUMMARY)

    expect(host().style.getPropertyValue('pointer-events')).toBe('auto')
    expect(overlay().classList.contains('sheet')).toBe(false)
    expect(backdrop().hidden).toBe(false)
  })
})

describe('écran d’accueil', () => {
  it.each([
    ['Diagnostic', 'diagnostic'],
    ['Fermer', 'close'],
  ])('« %s » rend « %s »', async (label, expected) => {
    const handle = open()
    const answer = handle.show('welcome', {})

    press(label)

    await expect(answer).resolves.toBe(expected)
    expect(shadow().querySelector('h1')?.textContent).toBe('Ouvrez d’abord Repas')
  })
})

describe('récapitulatif et confirmation', () => {
  it('annonce les nombres, la liste repliable et le rappel avant « Commencer »', () => {
    const handle = open()
    void handle.show('summary', SUMMARY)

    const text = shadow().textContent ?? ''
    expect(text).toContain('2 produits connus à mettre au panier')
    expect(text).toContain('1 nouveau produit à choisir')
    expect(text).toContain('1 « j’en ai toujours »')
    expect(text).toContain('0 « pas cette fois »')
    expect(text).toContain('Farine : connu (Farine T55 1 kg)')
    expect(text).toContain('Poivre : à choisir')
    expect(text).toContain('Repas ne vide pas votre panier Leclerc.')
    expect(shadow().querySelector('details')).not.toBeNull()
  })

  it.each([
    ['Commencer', 'start'],
    ['Annuler', 'cancel'],
  ])('« %s » rend « %s »', async (label, expected) => {
    const handle = open()
    const answer = handle.show('summary', SUMMARY)

    press(label)

    await expect(answer).resolves.toBe(expected)
  })

  it('donne le focus à « Commencer » à l’ouverture', () => {
    const handle = open()
    void handle.show('summary', SUMMARY)

    expect(shadow().activeElement?.textContent).toBe('Commencer')
  })
})

describe('reprise', () => {
  it.each([
    ['Reprendre', 'resume'],
    ['Recommencer', 'restart'],
    ['Annuler', 'cancel'],
  ])('« %s » rend « %s »', async (label, expected) => {
    const handle = open()
    const answer = handle.show('resume', { done: 3, total: 8 })
    expect(shadow().textContent).toContain('3 articles sur 8 sont déjà faits')

    press(label)

    await expect(answer).resolves.toBe(expected)
  })
})

describe('progression', () => {
  const props = { total: 4, done: 1, current: 'Farine', log: ['Farine : ajouté'] }

  it('montre la barre, la ligne en cours et le journal dans une zone annoncée poliment', () => {
    const handle = open()
    void handle.show('progress', props)

    const bar = shadow().querySelector('progress')
    expect(bar?.max).toBe(4)
    expect(bar?.value).toBe(1)
    expect(bar?.getAttribute('aria-label')).toBeTruthy()
    expect(shadow().textContent).toContain('1 sur 4')
    expect(shadow().textContent).toContain('En cours : Farine')
    expect(shadow().querySelector('[aria-live="polite"] li')?.textContent).toBe('Farine : ajouté')
  })

  it('porte le titre du remplissage du panier, ou celui que l’appelant donne (le test automatique)', () => {
    const handle = open()
    void handle.show('progress', props)
    expect(shadow().querySelector('h1, h2')?.textContent).toBe('Votre panier se remplit')

    void handle.show('progress', { ...props, title: 'Test automatique' })

    expect(shadow().querySelector('h1, h2')?.textContent).toBe('Test automatique')
    expect(shadow().textContent).not.toContain('Votre panier se remplit')
  })

  it('se met à jour sans refaire l’écran et ne garde que les cinq dernières actions', () => {
    const handle = open()
    void handle.show('progress', props)
    const live = shadow().querySelector('.live')

    for (let i = 1; i <= 6; i += 1) handle.update({ done: 1 + i, entry: `Action ${i}` })
    handle.update({ current: 'Lait', total: 10 })

    expect(shadow().querySelector('.live')).toBe(live)
    expect([...shadow().querySelectorAll('.live li')].map((li) => li.textContent)).toEqual([
      'Action 2',
      'Action 3',
      'Action 4',
      'Action 5',
      'Action 6',
    ])
    expect(shadow().textContent).toContain('En cours : Lait')
    expect(shadow().querySelector('progress')?.max).toBe(10)
    expect(shadow().querySelector('progress')?.value).toBe(7)
  })

  it('« Arrêter » rend « stop » une fois et dit qu’il s’arrête après la ligne en cours', async () => {
    const handle = open()
    const answer = handle.show('progress', props)

    press('Arrêter')

    await expect(answer).resolves.toBe('stop')
    const stop = buttons()[0]
    expect(stop?.disabled).toBe(true)
    expect(stop?.textContent).toContain('J’arrête')
  })

  it('une mise à jour sans écran de progression ne fait rien', () => {
    const handle = open()
    void handle.show('welcome', {})

    expect(() => handle.update({ done: 3 })).not.toThrow()
    expect(() => createUi().update({ done: 3 })).not.toThrow()
  })
})

describe('quantité à vérifier', () => {
  const props = { ingredient: 'Farine', productLabel: 'Farine T55 1 kg', packs: 3 }
  const input = () => shadow().querySelector('input') as HTMLInputElement
  const submit = () => (shadow().querySelector('form') as HTMLFormElement).requestSubmit()

  it('prérempli avec les packs du plan, le focus dans le champ', () => {
    const handle = open()
    void handle.show('quantity', props)

    expect(input().value).toBe('3')
    expect(input().min).toBe('1')
    expect(input().max).toBe('99')
    expect(shadow().activeElement).toBe(input())
    expect(shadow().textContent).toContain('Combien de « Farine T55 1 kg » pour Farine ?')
  })

  it('propose 1 quand le plan ne donne pas de quantité', () => {
    const handle = open()
    void handle.show('quantity', { ...props, packs: null })

    expect(input().value).toBe('1')
  })

  it('« Valider » rend le nombre saisi', async () => {
    const handle = open()
    const answer = handle.show('quantity', props)
    input().value = '12'

    press('Valider')

    await expect(answer).resolves.toBe(12)
  })

  it('la touche Entrée valide aussi', async () => {
    const handle = open()
    const answer = handle.show('quantity', props)

    submit()

    await expect(answer).resolves.toBe(3)
  })

  it.each([[''], ['0'], ['100'], ['2.5'], ['-1']])(
    'refuse « %s » et garde l’écran avec un message',
    async (value) => {
      const handle = open()
      const settled = vi.fn<() => void>()
      void handle.show('quantity', props).then(settled)
      input().value = value

      submit()
      await Promise.resolve()

      expect(settled).not.toHaveBeenCalled()
      expect(shadow().querySelector('[role="alert"]')?.textContent).toBe(
        'Entrez un nombre entier de 1 à 99.',
      )
      expect(input().getAttribute('aria-invalid')).toBe('true')
    },
  )

  it('« Passer » rend null', async () => {
    const handle = open()
    const answer = handle.show('quantity', props)

    press('Pas cette fois')

    await expect(answer).resolves.toBeNull()
  })
})

describe('choix de produit (hôte)', () => {
  const base = { ingredient: 'Poivre', position: 2, total: 5 }
  /** Une liste de deux produits, un qui se choisit et un que l'utilisateur ne veut plus. */
  const mountList: ChooserProps['mount'] = (zone, done) =>
    void renderPicker(
      zone,
      {
        need: null,
        replaces: null,
        gone: [],
        checked: new Set<string>(),
        query: 'poivre',
        items: [
          {
            id: '111',
            name: 'Poivre de test',
            label2: null,
            details: [],
            promo: null,
            explain: '',
            state: 'ok',
          },
          {
            id: '222',
            name: 'Poivre à éviter',
            label2: null,
            details: [],
            promo: null,
            explain: '',
            state: 'refused',
          },
        ],
        notice: null,
      },
      { choose: (id) => done(id), search: () => undefined, never: () => undefined },
    )

  it('montre l’ingrédient, le compteur et remplit la zone de contenu une fois dans la page', () => {
    const handle = open()
    const mount = vi.fn<ChooserProps['mount']>((zone) => {
      expect(zone.isConnected).toBe(true)
      zone.appendChild(h('p', { text: 'contenu de test' }))
    })

    void handle.show('chooser', { ...base, mount })

    expect(shadow().textContent).toContain('Poivre (2 sur 5)')
    expect(shadow().querySelector('.zone')?.textContent).toBe('contenu de test')
    expect(mount).toHaveBeenCalledOnce()
  })

  it('range les gestes : « Choisir » est le principal, les autres réponses sont secondaires, « Annuler l’envoi » est discret, tout en bas', () => {
    const handle = open()
    void handle.show('chooser', { ...base, mount: mountList })

    // Les autres réponses sont en haut, avant la liste ; l'annulation est le dernier élément de l'écran, après la liste.
    expect(visibleLabels()).toEqual([
      'Pas cette fois',
      'J’en ai toujours',
      'Passer les 4 suivants',
      'Chercher',
      'Choisir',
      'Ne plus proposer',
      'Annuler l’envoi',
    ])
    const classOf = (label: string) =>
      buttons().find((button) => button.textContent === label)?.className
    expect(classOf('Choisir')).toBe('primary')
    for (const label of ['Pas cette fois', 'J’en ai toujours', 'Passer les 4 suivants']) {
      expect(`${label} : ${classOf(label)}`).toBe(`${label} : secondary`)
    }
    expect(classOf('Chercher')).toBe('secondary')
    expect(classOf('Annuler l’envoi')).toBe('quiet')
    // Rien n'est rouge : annuler n'est plus un bouton d'alarme.
    expect(shadow().querySelector('.danger')).toBeNull()
    // Un seul geste principal par produit (« Choisir ») : ni « Chercher », ni la confirmation (cachée) n'en sont un de plus à l'écran.
    const primaries = buttons().filter(
      (button) => button.className === 'primary' && !button.closest('[hidden]'),
    )
    expect(primaries.map((button) => button.textContent)).toEqual(['Choisir'])
  })

  it.each([
    ['Pas cette fois', { kind: 'skip' }],
    ['J’en ai toujours', { kind: 'have' }],
    ['Annuler l’envoi', { kind: 'cancel' }],
  ])('« %s » rend %j', async (label, expected) => {
    const handle = open()
    const answer = handle.show('chooser', { ...base, mount: () => undefined })

    press(label)

    await expect(answer).resolves.toEqual(expected)
  })

  it('le contenu peut conclure l’écran avec sa propre valeur', async () => {
    const handle = open()
    let conclude: (value: unknown) => void = () => undefined
    const answer = handle.show('chooser', {
      ...base,
      mount: (_zone, done) => {
        conclude = done
      },
    })

    conclude({ productId: '123456' })

    await expect(answer).resolves.toEqual({ kind: 'content', value: { productId: '123456' } })
  })

  it('nettoie le contenu quand l’écran est remplacé, et à la fermeture', () => {
    const handle = open()
    const dispose = vi.fn<() => void>()
    void handle.show('chooser', { ...base, mount: () => dispose })

    void handle.show('welcome', {})
    expect(dispose).toHaveBeenCalledOnce()

    const second = vi.fn<() => void>()
    void handle.show('chooser', { ...base, mount: () => second })
    handle.close()
    expect(second).toHaveBeenCalledOnce()
  })

  describe('« Passer les n suivants » (DRV-624)', () => {
    const leaves = (position: number, total: number) => {
      const handle = open()
      void handle.show('chooser', { ingredient: 'Poivre', position, total, mount: () => undefined })
      return visibleLabels().filter((label) => label?.startsWith('Passer les'))
    }

    it.each([
      [1, 4, ['Passer les 4 suivants']],
      [2, 4, ['Passer les 3 suivants']],
      [3, 4, ['Passer les 2 suivants']],
      [4, 4, []],
      [1, 1, []],
      [1, 2, ['Passer les 2 suivants']],
    ])(
      'au rang %i sur %i, le bouton compte les articles encore à choisir, celui-ci compris, et disparaît quand il n’en reste qu’un',
      (position, total, expected) => {
        expect(leaves(position, total)).toEqual(expected)
      },
    )

    it('passe tout de suite quand rien n’est à confirmer', async () => {
      const handle = open()
      const answer = handle.show('chooser', { ...base, mount: () => undefined })

      press('Passer les 4 suivants')

      await expect(answer).resolves.toEqual({ kind: 'rest' })
    })

    it('demande une confirmation d’une ligne quand un article passé n’a encore aucun produit retenu, et ne répond rien avant', async () => {
      // Given
      const handle = open()
      const settled = vi.fn<(answer: unknown) => void>()
      void handle
        .show('chooser', { ...base, confirmRest: true, mount: () => undefined })
        .then(settled)

      // When
      press('Passer les 4 suivants')
      await Promise.resolve()

      // Then : la question prend la place des réponses, elle est annoncée et prend le focus ; rien n'est répondu
      expect(settled).not.toHaveBeenCalled()
      expect(visibleLabels()).toEqual([
        'Passer les 4 suivants',
        'Revenir au choix',
        'Annuler l’envoi',
      ])
      const question = shadow().querySelector('.sure')
      expect(question?.textContent).toBe('Ces 4 articles ne seront pas mis au panier.')
      expect(question?.getAttribute('role')).toBe('alert')
      expect(shadow().activeElement).toBe(question)
      expect(shadow().querySelector('.confirm .primary')?.textContent).toBe('Passer les 4 suivants')
    })

    it('« Passer les n suivants » de la confirmation répond `rest`', async () => {
      const handle = open()
      const answer = handle.show('chooser', { ...base, confirmRest: true, mount: () => undefined })
      press('Passer les 4 suivants')

      shadow().querySelector<HTMLButtonElement>('.confirm .primary')?.click()

      await expect(answer).resolves.toEqual({ kind: 'rest' })
    })

    it('« Revenir au choix » remet les réponses, avec le focus sur le bouton qu’on vient de toucher', async () => {
      const handle = open()
      const settled = vi.fn<(answer: unknown) => void>()
      void handle
        .show('chooser', { ...base, confirmRest: true, mount: () => undefined })
        .then(settled)
      press('Passer les 4 suivants')

      press('Revenir au choix')
      await Promise.resolve()

      expect(settled).not.toHaveBeenCalled()
      expect(visibleLabels().slice(0, 3)).toEqual([
        'Pas cette fois',
        'J’en ai toujours',
        'Passer les 4 suivants',
      ])
      expect(shadow().activeElement?.textContent).toBe('Passer les 4 suivants')
      expect(shadow().querySelector('.confirm')?.hasAttribute('hidden')).toBe(true)
    })

    it('le dernier article n’a ni bouton ni confirmation, même quand un article sans produit retenu reste', () => {
      const handle = open()
      void handle.show('chooser', {
        ...base,
        position: 5,
        confirmRest: true,
        mount: () => undefined,
      })

      expect(shadow().querySelector('.confirm')).toBeNull()
      expect(visibleLabels()).toEqual(['Pas cette fois', 'J’en ai toujours', 'Annuler l’envoi'])
    })
  })

  describe('focus et annonce', () => {
    it('le focus arrive sur l’article, jamais sur un bouton, et sa ligne avec le compteur est une zone annoncée', () => {
      const handle = open()
      void handle.show('chooser', { ...base, mount: () => undefined })

      const head = shadow().querySelector('.head')
      expect(shadow().activeElement).toBe(head)
      expect(head?.textContent).toBe('Poivre (2 sur 5)')
      expect(head?.getAttribute('role')).toBe('status')
      expect(shadow().querySelector('section')?.getAttribute('aria-labelledby')).toBe('titre')
      expect(shadow().getElementById('titre')?.textContent).toBe('Poivre')
    })

    it('chaque article remplace le précédent : un seul compteur, annoncé avec son rang', () => {
      const handle = open()
      void handle.show('chooser', { ...base, position: 1, total: 3, mount: () => undefined })
      void handle.show('chooser', { ...base, position: 2, total: 3, mount: () => undefined })

      expect(shadow().querySelectorAll('[role="status"]')).toHaveLength(1)
      expect(shadow().querySelector('[role="status"]')?.textContent).toBe('Poivre (2 sur 3)')
    })

    it('quand la question de confirmation est affichée, Tab après le dernier bouton revient au premier bouton visible (jamais à un bouton caché)', () => {
      const handle = open()
      void handle.show('chooser', { ...base, confirmRest: true, mount: () => undefined })
      press('Passer les 4 suivants')
      buttons().at(-1)?.focus()

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      shadow().querySelector('.overlay')?.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(shadow().activeElement?.textContent).toBe('Passer les 4 suivants')
      expect(shadow().activeElement?.closest('[hidden]')).toBeNull()
    })

    it('Tab après « Annuler l’envoi » revient au premier bouton', () => {
      const handle = open()
      void handle.show('chooser', { ...base, mount: () => undefined })
      const items = [...shadow().querySelectorAll<HTMLElement>('button')].filter(
        (button) => !button.closest('[hidden]'),
      )
      items.at(-1)?.focus()

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      shadow().querySelector('.overlay')?.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(shadow().activeElement?.textContent).toBe('Pas cette fois')
    })
  })
})

describe('diagnostic', () => {
  const rows: DiagnosticRow[] = [
    { label: 'Version de l’agent', badge: 'OK', detail: 'version 0.5.0', tone: 'ok' },
    { label: 'Recherche d’un mot courant', badge: 'KO BLOCKED', detail: null, tone: 'ko' },
    { label: 'Cadre de même origine', badge: 'NON TESTÉ', detail: HOSTILE, tone: 'skip' },
    { label: 'Contenu net des produits', badge: '…', detail: null, tone: 'wait' },
  ]
  const textarea = () => shadow().querySelector('textarea') as HTMLTextAreaElement

  function openDiagnostic(copy: (text: string) => Promise<boolean> = () => Promise.resolve(true)) {
    const handle = open()
    let view: DiagnosticView | null = null
    const answer = handle.show('diagnostic', { copy, start: (given) => (view = given) })
    return { answer, view: () => view as unknown as DiagnosticView }
  }

  it('lance les contrôles une fois dans la page ; le rapport reste caché tant qu’ils tournent', () => {
    const { view } = openDiagnostic()

    expect(shadow().querySelector('h1')?.textContent).toBe('Diagnostic')
    expect(shadow().textContent).toContain('Contrôles en cours…')
    expect(shadow().querySelector('textarea')?.closest('[hidden]')).not.toBeNull()
    expect(view()).toBeDefined()
  })

  it('montre chaque contrôle avec son résultat écrit en toutes lettres, et le détail tel quel même s’il contient du HTML', () => {
    const { view } = openDiagnostic()

    view().update(rows)

    const items = [...shadow().querySelectorAll('.check-row')].map((item) => item.textContent)
    expect(items).toEqual([
      'OKVersion de l’agentversion 0.5.0',
      'KO BLOCKEDRecherche d’un mot courant',
      `NON TESTÉCadre de même origine${HOSTILE}`,
      '…Contenu net des produits',
    ])
    expect(shadow().querySelector('.check-row img, .check-row script')).toBeNull()
  })

  it('remplace les lignes à chaque mise à jour, sans en ajouter', () => {
    const { view } = openDiagnostic()

    view().update(rows)
    view().update(rows.slice(0, 2))

    expect(shadow().querySelectorAll('.check-row')).toHaveLength(2)
  })

  it('à la fin : annonce le résumé et montre le rapport à copier', () => {
    const { view } = openDiagnostic()

    view().finish(
      'Contrôles terminés : 1 réussi, 1 en échec, 0 non testé.',
      'Repas Drive : diagnostic\nAgent : 0.5.0',
    )

    expect(shadow().querySelector('[role="status"]')?.textContent).toBe(
      'Contrôles terminés : 1 réussi, 1 en échec, 0 non testé.',
    )
    expect(textarea().value).toBe('Repas Drive : diagnostic\nAgent : 0.5.0')
    expect(textarea().readOnly).toBe(true)
    expect(textarea().closest('[hidden]')).toBeNull()
    expect(shadow().textContent).toContain('ne contient ni cookie')
  })

  it('« Copier le rapport » copie le texte et le dit', async () => {
    const copy = vi.fn<(text: string) => Promise<boolean>>().mockResolvedValue(true)
    const { view } = openDiagnostic(copy)
    view().finish('fini', 'le rapport')

    press('Copier le rapport')
    await vi.waitFor(() =>
      expect(shadow().querySelector('[role="status"]')?.textContent).toBe('Rapport copié.'),
    )

    expect(copy).toHaveBeenCalledWith('le rapport')
  })

  it('quand le navigateur refuse, sélectionne le texte et dit de le copier à la main', async () => {
    const { view } = openDiagnostic(() => Promise.resolve(false))
    view().finish('fini', 'le rapport')

    press('Copier le rapport')
    await vi.waitFor(() =>
      expect(shadow().querySelector('[role="status"]')?.textContent).toBe(
        'Copie impossible : sélectionnez le texte du rapport et copiez-le.',
      ),
    )

    expect(shadow().activeElement).toBe(textarea())
  })

  it('« Fermer » rend « close »', async () => {
    const { answer } = openDiagnostic()

    press('Fermer')

    await expect(answer).resolves.toBe('close')
  })
})

describe('utiliser le magasin (mode configuration, DRV-623)', () => {
  it('montre le numéro quand la page ne donne pas de libellé, et prend « Utiliser ce magasin » pour premier bouton', () => {
    const handle = open()
    void handle.show('store', { id: '123456', label: null })

    expect(shadow().querySelector('h1')?.textContent).toBe('Utiliser ce magasin ?')
    expect(shadow().textContent).toContain('Magasin n° 123456')
    expect(labels()).toEqual(['Utiliser ce magasin', 'Annuler'])
    expect(shadow().activeElement?.textContent).toBe('Utiliser ce magasin')
  })

  it('est un seul écran à un seul bouton principal, et ne parle plus d’« enregistrer » : Repas enregistre tout seul', () => {
    const handle = open()
    void handle.show('store', { id: '123456', label: null })

    expect(shadow().querySelectorAll('button.primary')).toHaveLength(1)
    expect(shadow().querySelectorAll('button')).toHaveLength(2)
    expect(shadow().textContent).not.toMatch(/enregistr/i)
    expect(shadow().textContent).toContain('rien de votre compte Leclerc ne quitte cette page')
  })

  it('montre le libellé quand il y en a un, tel quel même s’il contient du HTML', () => {
    const handle = open()
    void handle.show('store', { id: '123456', label: HOSTILE })

    expect(shadow().textContent).toContain(HOSTILE)
    expect(shadow().textContent).not.toContain('n° 123456')
    expect(shadow().querySelector('img, script')).toBeNull()
  })

  it.each([
    ['Utiliser ce magasin', 'save'],
    ['Annuler', 'cancel'],
  ])('« %s » rend %s', async (label, expected) => {
    const handle = open()
    const answer = handle.show('store', { id: '123456', label: null })

    press(label)

    await expect(answer).resolves.toBe(expected)
  })
})

describe('« Toujours prendre ce produit ? » (DRV-624)', () => {
  const props = { ingredient: 'Farine', productLabel: 'Farine de test 1 kg' }

  it('pose une question, avec deux réponses en boutons, la première par défaut, et une sortie discrète', () => {
    const handle = open()
    void handle.show('placement', props)

    expect(shadow().querySelector('h1')?.textContent).toBe('Toujours prendre ce produit ?')
    expect(shadow().querySelector('section p')?.textContent).toBe(
      'Vous avez choisi « Farine de test 1 kg » pour Farine.',
    )
    expect(labels()).toEqual([
      'Toujours prendre celui-ci',
      'Cette fois seulement',
      'Revenir à la liste',
    ])
    expect(shadow().activeElement?.textContent).toBe('Toujours prendre celui-ci')
    const classes = buttons().map((button) => button.className)
    expect(classes).toEqual(['primary', '', 'quiet'])
  })

  it('ne parle ni de « secours », ni de « préféré », ni de produit de remplacement', () => {
    const handle = open()
    void handle.show('placement', props)

    expect(shadow().textContent).not.toMatch(/secours|préfér|remplacement|habituel/i)
  })

  it.each([
    ['Toujours prendre celui-ci', 'PRIMARY'],
    ['Cette fois seulement', 'ONCE'],
    ['Revenir à la liste', null],
  ])('« %s » rend %s', async (label, expected) => {
    const handle = open()
    const answer = handle.show('placement', props)

    press(label)

    await expect(answer).resolves.toBe(expected)
  })

  it('affiche tel quel un libellé qui contient du HTML', () => {
    const handle = open()
    void handle.show('placement', { ingredient: HOSTILE, productLabel: HOSTILE })

    expect(shadow().querySelector('section')?.textContent).toContain(HOSTILE)
    expect(shadow().querySelector('img, script')).toBeNull()
  })
})

describe('liste de produits dans l’écran de choix', () => {
  const items = [
    {
      id: '111',
      name: HOSTILE,
      label2: '500 g',
      details: ['500 g', '2,58 €'],
      promo: null,
      explain: '800 g demandés, 500 g par produit : 2',
      state: 'ok' as const,
    },
    {
      id: '222',
      name: 'Produit refusé de test',
      label2: null,
      details: [],
      promo: null,
      explain: '',
      state: 'refused' as const,
    },
  ]
  const props = {
    need: '800 g',
    replaces: null,
    gone: [],
    checked: new Set<string>(),
    query: 'poivre',
    items,
    notice: null,
  }
  const mountPicker = (zone: HTMLElement, done: (value: unknown) => void) =>
    void renderPicker(zone, props, {
      choose: (id) => done(id),
      search: (query) => done({ query }),
      never: () => undefined,
    })

  it('affiche des cibles d’au moins 44 px et des libellés hostiles comme du texte, dans le vrai Shadow DOM', async () => {
    const handle = open()
    const answer = handle.show('chooser', {
      ingredient: 'Poivre',
      position: 1,
      total: 1,
      mount: mountPicker,
    })

    expect(shadow().querySelector('.candidate .name')?.textContent).toBe(HOSTILE)
    expect(shadow().querySelector('.picker img, .picker script')).toBeNull()
    expect(
      [...shadow().querySelectorAll<HTMLButtonElement>('.candidate button')].map((b) => [
        b.textContent,
        b.disabled,
      ]),
    ).toEqual([
      ['Choisir', false],
      ['Ne plus proposer', true],
    ])
    press('Choisir')

    await expect(answer).resolves.toEqual({ kind: 'content', value: '111' })
  })

  it('le champ de recherche rend le mot cherché, sans espaces autour', async () => {
    const handle = open()
    const answer = handle.show('chooser', {
      ingredient: 'Poivre',
      position: 1,
      total: 1,
      mount: mountPicker,
    })
    const input = shadow().querySelector<HTMLInputElement>('#chercher')
    if (input) input.value = '  sel gris '

    shadow().querySelector('form')?.requestSubmit()

    await expect(answer).resolves.toEqual({ kind: 'content', value: { query: 'sel gris' } })
  })

  it('dit quelle recherche a répondu quand le nom n’a rien donné (ticket D), sans toucher au champ « Chercher autre chose »', () => {
    const zone = document.createElement('div')
    const hooks = { choose: () => undefined, search: () => undefined, never: () => undefined }

    const picker = renderPicker(zone, props, hooks)
    const status = () => zone.querySelector('[role="status"]')?.textContent

    expect(status()).toBe('Résultats pour « poivre »')

    picker.results('oeuf', items, null, 'œuf')
    expect(status()).toBe('Résultats pour « oeuf » (rien trouvé pour « œuf »)')

    picker.results('œuf', [], null, null)
    expect(status()).toBe('Aucun produit trouvé pour « œuf ». Essayez un autre mot.')

    picker.results('œuf', [], null, 'oeuf')
    expect(status()).toBe('Aucun produit trouvé pour « œuf ». Essayez un autre mot.')
    expect(zone.querySelector<HTMLInputElement>('#chercher')?.value).toBe('poivre')
  })
})

describe('erreurs', () => {
  it.each(ERROR_CODES)('« %s » a un titre et un conseil en français', (code) => {
    const handle = open()
    void handle.show('error', { code, canReturn: false })

    expect(shadow().querySelector('h1')?.textContent).toBe(ERROR_TEXTS[code].title)
    expect(shadow().textContent).toContain(ERROR_TEXTS[code].text)
  })

  it('dit quoi faire quand Leclerc ralentit les requêtes ou quand le site a changé', () => {
    expect(ERROR_TEXTS.BLOCKED.text).toContain('Attendez')
    expect(ERROR_TEXTS.BLOCKED.text).toContain('rechargez la page')
    // Quand l'utilisateur ne peut rien faire, le texte le dit franchement et propose le repli : chercher à la main
    expect(ERROR_TEXTS.CONTRACT_CHANGED.text).toBe(
      'Leclerc a changé son site, l’envoi automatique est arrêté. Ce qui est déjà au panier y reste. Cherchez vos produits à la main sur Leclerc.',
    )
    expect(ERROR_TEXTS.NOT_LOGGED_IN.text).toContain('Connectez-vous')
  })

  it.each(ERROR_CODES)(
    '« %s » tient en trois phrases de 20 mots au plus : ce qui s’est passé, ce qui est sauf, une action',
    (code) => {
      const sentences = ERROR_TEXTS[code].text.split(/(?<=[.!?])\s+/)

      expect(sentences).toHaveLength(3)
      expect(sentences[1]).toBe('Ce qui est déjà au panier y reste.')
      for (const sentence of sentences) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(20)
      // Aucun code à l'écran
      expect(ERROR_TEXTS[code].text).not.toMatch(/[A-Z]{2,}_[A-Z_]+/)
    },
  )

  it('le site mobile (cause PAGE_MOBILE) dit « Ce n’est pas la version ordinateur du site » et quoi faire (ticket J)', () => {
    const handle = open()
    void handle.show('error', { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'PAGE_MOBILE' })

    expect(shadow().querySelector('h1')?.textContent).toBe(
      'Ce n’est pas la version ordinateur du site',
    )
    expect(shadow().textContent).toContain('version ordinateur')
    expect(shadow().textContent).not.toContain(ERROR_TEXTS.UNSUPPORTED_PAGE.title)
  })

  it('une cause sans texte à elle garde le titre et le conseil du code d’erreur', () => {
    const handle = open()
    void handle.show('error', { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'PAGE_PATH' })

    expect(shadow().querySelector('h1')?.textContent).toBe(ERROR_TEXTS.UNSUPPORTED_PAGE.title)
    expect(shadow().textContent).toContain(ERROR_TEXTS.UNSUPPORTED_PAGE.text)
  })

  it('une cause hostile (« constructor », « __proto__ ») ne change rien au texte', () => {
    for (const cause of ['constructor', '__proto__', 'toString']) {
      const handle = open()
      void handle.show('error', { code: 'NETWORK', canReturn: false, cause })

      expect(shadow().querySelector('h1')?.textContent).toBe(ERROR_TEXTS.NETWORK.title)
      handle.close()
    }
  })

  it('sans retour possible, ne propose que « Fermer »', async () => {
    const handle = open()
    const answer = handle.show('error', { code: 'INVALID_MESSAGE', canReturn: false })
    expect(labels()).toEqual(['Fermer'])

    press('Fermer')

    await expect(answer).resolves.toBe('close')
  })

  it('avec un retour possible, propose « Retourner dans Repas » en premier', async () => {
    const handle = open()
    const answer = handle.show('error', { code: 'STORE_MISMATCH', canReturn: true })
    expect(labels()).toEqual(['Retourner dans Repas', 'Fermer'])
    expect(shadow().activeElement?.textContent).toBe('Retourner dans Repas')

    press('Retourner dans Repas')

    await expect(answer).resolves.toBe('return')
  })
})

describe('fin', () => {
  it('récapitule les issues et propose de retourner dans Repas', async () => {
    const handle = open()
    const answer = handle.show('end', END)

    // Seuls les compteurs qui existent : jamais un zéro, ni « Échecs », ni « Prix lus »
    expect([...shadow().querySelectorAll('.counts li')].map((item) => item.textContent)).toEqual([
      'Ajoutés au panier : 2',
      'Choisis sur Leclerc : 1',
      'J’en ai toujours : 1',
    ])
    const text = shadow().textContent ?? ''
    expect(text).not.toMatch(/Échecs|Prix lus|: 0/)
    expect(shadow().querySelector('h1')?.textContent).toBe('Le panier est rempli')
    expect(shadow().querySelector('h1 + p')?.textContent).toBe(
      'Vos produits sont dans votre panier Leclerc. Retournez dans Repas pour le finaliser.',
    )

    press('Retourner dans Repas')

    await expect(answer).resolves.toBe('return')
  })

  it('sans ligne recalculée, ne montre pas la mention « contenu différent »', () => {
    const handle = open()
    void handle.show('end', END)

    expect(shadow().textContent).not.toContain('Contenu différent')
  })

  it('montre chaque ligne dont le nombre de produits a été recalculé sur le contenu lu en direct', async () => {
    const handle = open()
    const answer = handle.show('end', {
      ...END,
      changes: [
        { name: 'Farine', planned: 1, live: 10 },
        { name: HOSTILE, planned: 4, live: 2 },
      ],
    })

    const note = shadow().querySelector('.notice')
    expect(note?.querySelector('strong')?.textContent).toBe(
      'Contenu différent de celui dont Repas se souvenait',
    )
    expect([...(note?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'Farine : 10 au lieu de 1',
      `${HOSTILE} : 2 au lieu de 4`,
    ])
    expect(shadow().querySelector('img, script, iframe, object')).toBeNull()
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()
    press('Retourner dans Repas')
    await expect(answer).resolves.toBe('return')
  })

  it('sans quantité conservée ni illisible, ne montre aucune de ces mentions', () => {
    const handle = open()
    void handle.show('end', END)

    expect(shadow().textContent).not.toContain('Déjà')
    expect(shadow().textContent).not.toContain('illisible')
  })

  it('dit pour chaque ligne la quantité déjà au panier qui est conservée', async () => {
    const handle = open()
    const answer = handle.show('end', {
      ...END,
      kept: [
        { name: 'Farine', wanted: 2, inCart: 5 },
        { name: HOSTILE, wanted: 1, inCart: 3 },
      ],
    })

    const note = shadow().querySelector('.notice')
    expect(note?.querySelector('strong')?.textContent).toBe('Quantités déjà au panier')
    expect(note?.textContent).toContain('Repas ne réduit jamais')
    expect([...(note?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'Farine — Déjà 5 au panier : conservé',
      `${HOSTILE} — Déjà 3 au panier : conservé`,
    ])
    expect(shadow().querySelector('img, script, iframe, object')).toBeNull()
    press('Retourner dans Repas')
    await expect(answer).resolves.toBe('return')
  })

  it('signale les quantités que la recherche ne donnait pas, avec le plancher connu quand il y en a un', () => {
    const handle = open()
    void handle.show('end', {
      ...END,
      unreadable: [
        { name: 'Farine', atLeast: 4 },
        { name: 'Sucre', atLeast: null },
      ],
    })

    const notes = [...shadow().querySelectorAll('.notice')]
    const note = notes.find((item) => item.textContent?.includes('illisible'))
    expect(note?.querySelector('strong')?.textContent).toBe('Quantité au panier illisible')
    expect([...(note?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'Farine — au moins 4 gardés, vérifiez dans votre panier',
      'Sucre — vérifiez dans votre panier',
    ])
  })

  it('sans réponse trop lente, ne montre pas la mention « Leclerc met trop de temps »', () => {
    const handle = open()
    void handle.show('end', END)

    expect(shadow().textContent).not.toContain('trop de temps')
  })

  it('dit quand Leclerc a mis trop de temps à répondre, et quoi faire : relancer, ce qui est au panier n’est pas touché', () => {
    const handle = open()
    void handle.show('end', { ...END, outcome: 'partial', failed: 2, slow: true })

    const note = shadow().querySelector('.notice')
    expect(note?.textContent).toBe(
      'Leclerc a mis trop de temps à répondre. Relancez l’envoi dans un moment : ce qui est déjà au panier n’est pas touché.',
    )
  })

  it('dit ce qui s’est passé, ce qui est sauf avec ce qu’il reste à ajouter, et l’action', () => {
    const handle = open()
    void handle.show('end', {
      ...END,
      outcome: 'partial',
      error: 'BLOCKED',
      failed: 2,
      unavailable: 1,
    })

    expect(shadow().querySelector('h1')?.textContent).toBe('Le panier est rempli en partie')
    expect(shadow().querySelector('h1 + p')?.textContent).toBe(
      'Leclerc a ralenti les demandes. Ce qui est déjà au panier y reste : il reste 3 articles à ajouter. Attendez quelques minutes, rechargez la page, puis reprenez l’envoi depuis Repas.',
    )
    // « Échecs » n'existe plus : l'échec se dit dans la phrase ; l'indisponible reste un compteur parce qu'il existe
    expect([...shadow().querySelectorAll('.counts li')].map((item) => item.textContent)).toEqual([
      'Ajoutés au panier : 2',
      'Choisis sur Leclerc : 1',
      'J’en ai toujours : 1',
      'Indisponibles : 1',
    ])
  })

  it.each([
    [
      { outcome: 'partial', failed: 1 },
      'Le panier est rempli en partie',
      'L’envoi s’est arrêté avant la fin. Ce qui est déjà au panier y reste : il reste 1 article à ajouter. Retournez dans Repas pour reprendre l’envoi.',
    ],
    [
      { outcome: 'aborted' },
      'Vous avez arrêté l’envoi',
      'Ce qui est déjà au panier y reste. Retournez dans Repas pour reprendre l’envoi.',
    ],
    [
      { outcome: 'aborted', error: 'CANCELLED' },
      'Vous avez arrêté l’envoi',
      'Ce qui est déjà au panier y reste. Retournez dans Repas pour reprendre l’envoi.',
    ],
    [
      { outcome: 'error', error: 'NOT_LOGGED_IN' },
      'L’envoi s’est arrêté',
      'Vous n’êtes pas connecté à Leclerc. Ce qui est déjà au panier y reste. Connectez-vous à Leclerc, puis reprenez l’envoi depuis Repas.',
    ],
    [
      { outcome: 'error', error: 'CONTRACT_CHANGED' },
      'L’envoi s’est arrêté',
      'Leclerc a changé son site, l’envoi automatique est arrêté. Ce qui est déjà au panier y reste. Cherchez vos produits à la main sur Leclerc.',
    ],
    [
      { outcome: 'error' },
      'L’envoi s’est arrêté',
      'L’envoi n’a pas pu aller au bout. Ce qui est déjà au panier y reste. Retournez dans Repas pour reprendre l’envoi.',
    ],
  ] as const)('issue %j : titre « %s », trois phrases', (extra, expectedTitle, expectedText) => {
    const handle = open()
    void handle.show('end', { ...END, ...extra })

    expect(shadow().querySelector('h1')?.textContent).toBe(expectedTitle)
    expect(shadow().querySelector('h1 + p')?.textContent).toBe(expectedText)
  })

  it.each(['completed', 'partial', 'aborted', 'error'] as const)(
    'issue « %s » : aucun compteur à zéro, aucun code, un seul bouton principal',
    (outcome) => {
      const handle = open()
      void handle.show('end', {
        ...END,
        outcome,
        ...(outcome === 'error' && { error: 'NETWORK' as const }),
        ...(outcome === 'partial' && { failed: 2 }),
      })

      const text = shadow().textContent ?? ''
      expect(text).not.toMatch(/(^|[^\d])0(?!\d)/)
      expect(text).not.toMatch(/Échecs|Prix lus|[A-Z]{2,}_[A-Z_]+|Code\s*:/)
      expect(labels()).toEqual(['Retourner dans Repas'])
      expect(shadow().querySelectorAll('button.primary')).toHaveLength(1)
    },
  )

  it('sans aucun compteur, ne montre pas de liste vide', () => {
    const handle = open()
    void handle.show('end', {
      ...END,
      outcome: 'aborted',
      added: 0,
      chosen: 0,
      haveAtHome: 0,
    })

    expect(shadow().querySelector('.counts')).toBeNull()
  })
})

describe('un écran remplacé', () => {
  it('ne résout plus sa promesse', async () => {
    const handle = open()
    const first = vi.fn<() => void>()
    void handle.show('summary', SUMMARY).then(first)
    const staleStart = buttons().find((button) => button.textContent === 'Commencer')

    const second = handle.show('end', END)
    staleStart?.click()
    press('Retourner dans Repas')

    await expect(second).resolves.toBe('return')
    expect(first).not.toHaveBeenCalled()
  })
})

describe('échappement', () => {
  it('affiche tel quel un libellé qui contient du HTML, sans rien exécuter', () => {
    const handle = open()
    Object.assign(window, { pwned: undefined })

    void handle.show('summary', {
      ...SUMMARY,
      lines: [{ name: HOSTILE, status: 'KNOWN', detail: HOSTILE }],
    })
    void handle.show('quantity', { ingredient: HOSTILE, productLabel: HOSTILE, packs: 1 })
    expect(shadow().textContent).toContain(HOSTILE)
    void handle.show('progress', { total: 1, done: 0, current: HOSTILE, log: [HOSTILE] })
    handle.update({ entry: HOSTILE, current: HOSTILE })
    void handle.show('chooser', {
      ingredient: HOSTILE,
      position: 1,
      total: 1,
      mount: () => undefined,
    })

    expect(shadow().textContent).toContain(HOSTILE)
    expect(shadow().querySelector('img, script, iframe, object')).toBeNull()
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()
  })

  it('refuse un attribut qui lancerait du code', () => {
    expect(() => h('div', { attrs: { onclick: 'alert(1)' } })).toThrow(/interdit/)
    expect(() => h('iframe', { attrs: { srcdoc: '<p>' } })).toThrow(/interdit/)
  })
})

describe('clavier', () => {
  const tab = (shiftKey = false) => {
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey,
      bubbles: true,
      cancelable: true,
    })
    shadow().querySelector('.overlay')?.dispatchEvent(event)
    return event
  }

  it('Tab après le dernier élément revient au premier', () => {
    const handle = open()
    void handle.show('summary', SUMMARY)
    const last = buttons().at(-1)
    last?.focus()

    const event = tab()

    expect(event.defaultPrevented).toBe(true)
    expect(shadow().activeElement).toBe(shadow().querySelector('summary'))
  })

  it('Maj+Tab avant le premier va au dernier', () => {
    const handle = open()
    void handle.show('summary', SUMMARY)
    shadow().querySelector<HTMLElement>('summary')?.focus()

    const event = tab(true)

    expect(event.defaultPrevented).toBe(true)
    expect(shadow().activeElement).toBe(buttons().at(-1))
  })

  it('laisse Tab aller son chemin entre deux éléments', () => {
    const handle = open()
    void handle.show('summary', SUMMARY)
    buttons()[0]?.focus()

    expect(tab().defaultPrevented).toBe(false)
  })

  it('ne piège rien sur un écran sans élément focalisable, et ignore les autres touches', () => {
    const handle = open()
    void handle.show('chooser', { ingredient: 'A', position: 1, total: 1, mount: () => undefined })
    shadow()
      .querySelectorAll('button')
      .forEach((button) => button.remove())

    expect(tab().defaultPrevented).toBe(false)
    const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    shadow().querySelector('.overlay')?.dispatchEvent(other)
    expect(other.defaultPrevented).toBe(false)
  })
})

// —— l'échelle d'affichage (site de bureau affiché sur un écran de téléphone) ——————————————————————————————————————————————————————————————

/** `visualViewport` de test : une cible d'événements dont l'on change les mesures à la main. */
class FakeViewport extends EventTarget {
  width = 980
  height = 2016
  offsetLeft = 0
  offsetTop = 0
  scale = 0.4207
  set(
    parts: Partial<Pick<FakeViewport, 'width' | 'height' | 'offsetLeft' | 'offsetTop' | 'scale'>>,
  ) {
    Object.assign(this, parts)
    this.dispatchEvent(new Event('resize'))
  }
}

describe('l’échelle d’affichage', () => {
  const originals = { innerWidth: window.innerWidth, innerHeight: window.innerHeight }
  const define = (target: object, name: string, value: unknown) =>
    Object.defineProperty(target, name, { value, configurable: true, writable: true })

  /** La WebView d'un Pixel 9 en mode ordinateur, telle que mesurée (fenêtre de 980 px CSS, écran de 412 dp, échelle 0,4207). */
  function pixel9(): FakeViewport {
    const viewport = new FakeViewport()
    define(window, 'innerWidth', 980)
    define(window, 'innerHeight', 2016)
    define(window.screen, 'width', 412)
    define(window, 'visualViewport', viewport)
    return viewport
  }

  afterEach(() => {
    define(window, 'innerWidth', originals.innerWidth)
    define(window, 'innerHeight', originals.innerHeight)
    Reflect.deleteProperty(window.screen, 'width')
    Reflect.deleteProperty(window, 'visualViewport')
  })

  const frame = () => shadow().querySelector<HTMLElement>('.overlay') as HTMLElement

  it('agrandit le cadre pour qu’il fasse la largeur de l’écran, sur toute la zone visible', () => {
    pixel9()
    const handle = open()

    void handle.show('summary', SUMMARY)

    const scale = 1 / 0.4207
    expect(frame().style.getPropertyValue('transform')).toBe(`scale(${scale})`)
    // Avant son agrandissement le cadre mesure 412 px CSS : la largeur de l'écran en dp, comme sur un téléphone.
    expect(parseFloat(frame().style.getPropertyValue('width'))).toBeCloseTo(412.286, 2)
    expect(parseFloat(frame().style.getPropertyValue('height'))).toBeCloseTo(2016 * 0.4207, 2)
    expect(frame().style.getPropertyValue('left')).toBe('0px')
    expect(frame().style.getPropertyValue('top')).toBe('0px')
    // Le conteneur, lui, couvre toujours toute la fenêtre de la page.
    expect(handle.host?.style.getPropertyValue('inset')).toBe('0px')
    expect(shadow().querySelector('.backdrop')).not.toBeNull()
  })

  it('ne change rien sur un écran ordinaire (facteur 1) : pas d’agrandissement', () => {
    define(window, 'innerWidth', 412)
    define(window, 'innerHeight', 860)
    define(window.screen, 'width', 412)
    define(
      window,
      'visualViewport',
      Object.assign(new FakeViewport(), { width: 412, height: 860, scale: 1 }),
    )
    const handle = open()

    void handle.show('summary', SUMMARY)

    expect(frame().style.getPropertyValue('transform')).toBe('')
    expect(frame().style.getPropertyValue('width')).toBe('412px')
    expect(frame().style.getPropertyValue('height')).toBe('860px')
  })

  it('sans mesure d’écran ni de zone visible (jsdom), le cadre prend toute la fenêtre, sans agrandissement', () => {
    const handle = open()

    void handle.show('summary', SUMMARY)

    expect(frame().style.getPropertyValue('transform')).toBe('')
    expect(frame().style.getPropertyValue('width')).toBe(`${window.innerWidth}px`)
  })

  it('sans aucune mesure (fenêtre vide), laisse la feuille de style remplir le conteneur', () => {
    define(window, 'innerWidth', 0)
    define(window, 'innerHeight', 0)
    const handle = open()

    void handle.show('summary', SUMMARY)

    for (const name of ['left', 'top', 'width', 'height', 'transform']) {
      expect(frame().style.getPropertyValue(name)).toBe('')
    }
  })

  it('se pose sur la zone visible quand la page est agrandie au pincement, à la taille d’un téléphone', () => {
    const viewport = pixel9()
    // L'utilisateur a agrandi la page jusqu'à 0,7 dp par pixel CSS et regarde en bas à droite.
    viewport.scale = 0.7
    viewport.width = 589
    viewport.height = 1318
    viewport.offsetLeft = 391
    viewport.offsetTop = 698
    const handle = open()

    void handle.show('summary', SUMMARY)

    expect(frame().style.getPropertyValue('left')).toBe('391px')
    expect(frame().style.getPropertyValue('top')).toBe('698px')
    expect(frame().style.getPropertyValue('transform')).toBe(`scale(${1 / 0.7})`)
    expect(parseFloat(frame().style.getPropertyValue('width'))).toBeCloseTo(412.3, 1)
  })

  it('suit les changements de la zone visible (zoom initial qui arrive tard, rotation, clavier, défilement)', () => {
    const viewport = pixel9()
    viewport.scale = 1 // la WebView n'a pas encore appliqué le zoom de la fenêtre large
    viewport.width = 412
    viewport.height = 860
    const handle = open()
    void handle.show('summary', SUMMARY)
    expect(frame().style.getPropertyValue('transform')).toBe('')

    // Le zoom arrive : l'interface s'agrandit sans qu'on la rouvre.
    viewport.set({ scale: 0.4207, width: 980, height: 2016 })
    expect(frame().style.getPropertyValue('transform')).toBe(`scale(${1 / 0.4207})`)

    // Un défilement de la zone visible la déplace.
    viewport.offsetTop = 120
    viewport.dispatchEvent(new Event('scroll'))
    expect(frame().style.getPropertyValue('top')).toBe('120px')

    // Une rotation change la fenêtre elle-même.
    define(window, 'innerWidth', 980)
    viewport.scale = 0.89
    viewport.height = 409
    viewport.offsetTop = 0
    window.dispatchEvent(new Event('resize'))
    expect(frame().style.getPropertyValue('transform')).toBe(`scale(${1 / 0.89})`)
    expect(frame().style.getPropertyValue('height')).toBe(`${409 / (1 / 0.89)}px`)
  })

  it('cesse de suivre l’affichage une fois fermée, et reprend à la réouverture', () => {
    const viewport = pixel9()
    const handle = open()
    void handle.show('summary', SUMMARY)
    handle.close()

    viewport.set({ scale: 0.5 })
    window.dispatchEvent(new Event('resize'))

    expect(handle.host).toBeNull()
    void handle.show('summary', SUMMARY)
    expect(frame().style.getPropertyValue('transform')).toBe(`scale(${1 / 0.5})`)
  })

  it('garde les cibles tactiles à 48 px et refuse le zoom de la page par-dessus l’interface', () => {
    expect(STYLES).toContain('--target:48px')
    expect(STYLES).toMatch(/\.overlay\{[^}]*touch-action:pan-y/)
    expect(STYLES).not.toMatch(/min-height:44px|min-width:44px|width:44px|height:44px/)
  })
})
