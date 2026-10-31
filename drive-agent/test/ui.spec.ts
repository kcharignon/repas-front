// L'interface superposée (DRV-304) : chaque écran (rendu, réponses, échappement), le focus et l'isolation. jsdom, sans réseau.
import { EXEMPLE, LECLERC } from './retailer-fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { h } from '../src/ui/dom'
import { createUi, errorTexts, renderPicker, type UiHandle } from '../src/ui'
import { ENTRY_KINDS, viewOf } from '../src/ui/entries'
import { STYLES } from '../src/ui/styles'
import type {
  ChooserProps,
  DiagnosticRow,
  DiagnosticView,
  EndProps,
  GuideProps,
  ProgressEntry,
  ProgressProps,
  SummaryProps,
} from '../src/ui'
import { ERROR_CODES } from '../protocol'

const HOSTILE = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>'

let ui: UiHandle | null = null

/** L'interface en mode ouvert : seul moyen pour un test de lire le Shadow DOM, qu'en production la page ne peut pas lire. */
function open(): UiHandle {
  ui = createUi({ mode: 'open', retailer: LECLERC })
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
    const closed = createUi({ retailer: LECLERC })
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
    expect(shadow().textContent).toContain('Fais-la dans la page, puis touche Reprendre.')
    expect(labels()).toEqual(['Reprendre', 'Arrêter pour l’instant'])
    expect(shadow().activeElement?.textContent).toBe('Reprendre')
  })

  it.each([
    ['Reprendre', 'resume'],
    ['Arrêter pour l’instant', 'stop'],
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

describe('le guide d’une étape (DRV-751)', () => {
  const overlay = () => shadow().querySelector('.overlay') as HTMLElement
  const STOP = 'Arrêter pour l’instantTa liste est gardée, tu pourras reprendre.'
  const props = (extra: Partial<GuideProps> = {}): GuideProps => ({
    step: 'store',
    stage: 'waiting',
    index: 1,
    total: 2,
    label: 'Choisir mon mode de livraison',
    ...extra,
  })
  /** Les conteneurs que l'agent a posés dans la page : celui de l'interface, et celui du repère (le second, sans prise sur les touchers). */
  const hosts = () => [...document.documentElement.children].filter((el) => el.shadowRoot !== null)

  it('étape 1 sur 2 : un repère, un titre, une phrase qui dit quoi faire et où, ce que l’agent fait, et UNE seule action', () => {
    const handle = open()
    void handle.show('guide', props())

    expect(shadow().querySelector('.g-step')?.textContent).toBe('Étape 1 sur 2')
    expect(shadow().querySelectorAll('.g-seg.on')).toHaveLength(1)
    expect(shadow().querySelectorAll('.g-seg')).toHaveLength(2)
    expect(shadow().querySelector('h1')?.textContent).toBe('Choisis ton magasin')
    expect(shadow().querySelector('.g-text')?.textContent).toBe(
      'Touche « Choisir mon mode de livraison » en haut de la page, puis ton magasin.',
    )
    expect(shadow().querySelector('.g-status')?.textContent).toBe('Je continue dès que c’est fait.')
    expect(labels()).toEqual([STOP])
  })

  it('étape 2 sur 2 : se connecter, le mot de passe se tape à la main', () => {
    const handle = open()
    void handle.show('guide', props({ step: 'login', index: 2, label: 'Se connecter' }))

    expect(shadow().querySelector('.g-step')?.textContent).toBe('Étape 2 sur 2')
    expect(shadow().querySelectorAll('.g-seg.on')).toHaveLength(2)
    expect(shadow().querySelector('h1')?.textContent).toBe('Connecte-toi')
    expect(shadow().querySelector('.g-text')?.textContent).toBe(
      'Touche « Se connecter », puis entre tes identifiants. Tu tapes toi-même ton mot de passe.',
    )
  })

  it('une seule étape qui reste : « Il reste une étape », sans « 1 sur 1 »', () => {
    const handle = open()
    void handle.show('guide', props({ step: 'login', index: 1, total: 1, label: null }))

    expect(shadow().querySelector('.g-step')?.textContent).toBe('Il reste une étape')
    expect(shadow().querySelector('.g-text')?.textContent).toBe(
      'Touche le bouton de connexion de la page, puis entre tes identifiants. Tu tapes toi-même ton mot de passe.',
    )
  })

  it('sans libellé lu dans la page, la phrase n’en cite aucun', () => {
    const handle = open()
    void handle.show('guide', props({ label: null }))

    expect(shadow().querySelector('.g-text')?.textContent).toBe(
      'Touche la barre du magasin en haut de la page, puis ton magasin.',
    )
  })

  it('le texte du magasin ne parle jamais de connexion : le magasin d’abord', () => {
    const handle = open()
    void handle.show('guide', props({ label: null }))

    expect(shadow().textContent).not.toMatch(/connect|identifi|mot de passe/i)
  })

  it('une carte en bas : la page reste visible et touchable, sans fond, aucune boîte modale', () => {
    const handle = open()
    void handle.show('guide', props())

    expect(overlay().classList.contains('sheet')).toBe(true)
    expect(overlay().getAttribute('aria-modal')).toBe('false')
    expect((shadow().querySelector('.backdrop') as HTMLElement).hidden).toBe(true)
    expect(handle.host?.style.getPropertyValue('pointer-events')).toBe('none')
    expect(shadow().querySelector('.screen')?.classList.contains('guide')).toBe(true)
  })

  it('« Arrêter pour l’instant » rend « stop » : il dit que la liste est gardée', async () => {
    const handle = open()
    const answer = handle.show('guide', props())

    press(STOP)

    await expect(answer).resolves.toBe('stop')
  })

  it('la lecture du magasin (réglages) dit que rien n’est enregistré, pas que la liste est gardée', () => {
    const handle = open()
    void handle.show('guide', props({ total: 0, setup: true }))

    expect(shadow().querySelector('.g-head')).toBeNull()
    expect(labels()).toEqual([
      'Arrêter pour l’instantRien n’est enregistré, tu pourras recommencer.',
    ])
  })

  it('l’attente s’allonge : « Attendre encore » et « Arrêter pour l’instant », rien d’autre', async () => {
    const handle = open()
    const answer = handle.show('guide', props({ stage: 'late' }))

    expect(shadow().querySelector('h1')?.textContent).toBe('Je suis toujours là')
    expect(labels()).toEqual(['Attendre encore', STOP])
    expect(shadow().querySelector('.g-status')).toBeNull()
    press('Attendre encore')
    await expect(answer).resolves.toBe('wait')
  })

  it('l’étape est faite : « C’est bon », « Ton magasin est choisi », « Je remplis ton panier » et une barre fine', () => {
    const handle = open()
    void handle.show('guide', props({ stage: 'done' }))

    expect(shadow().querySelector('.g-step')?.textContent).toBe('C’est bon')
    expect(shadow().querySelector('h1')?.textContent).toBe('Ton magasin est choisi')
    expect(shadow().querySelector('.g-text')?.textContent).toBe(
      'Je remplis ton panier. Tu n’as rien à faire.',
    )
    expect(shadow().querySelector('.g-meter')).not.toBeNull()
    expect(shadow().querySelector('.g-status')).toBeNull()
  })

  it('connecté : « Tu es connecté »', () => {
    const handle = open()
    void handle.show('guide', props({ step: 'login', stage: 'done' }))

    expect(shadow().querySelector('h1')?.textContent).toBe('Tu es connecté')
  })

  it('aucun mot d’alerte : ni « erreur », ni « introuvable », ni « incident », ni « Fermer »', () => {
    const handle = open()
    for (const stage of ['waiting', 'late', 'done'] as const) {
      for (const step of ['store', 'login'] as const) {
        void handle.show('guide', props({ stage, step }))
        expect(shadow().textContent).not.toMatch(
          /erreur|introuvable|incident|fermer|annuler|pas connecté/i,
        )
      }
    }
  })

  it('les boutons mesurent 56 px au moins, sur deux lignes pour l’action secondaire', () => {
    expect(STYLES).toMatch(/\.guide>button\{[^}]*min-height:56px/)
    const handle = open()
    void handle.show('guide', props())

    expect(shadow().querySelectorAll('.g-stop > span')).toHaveLength(2)
  })

  it('la carte reste au-dessus du bouton de menu de l’application (marge basse de 88 px)', () => {
    expect(STYLES).toMatch(/\.screen\.guide\{[^}]*margin:auto 8px var\(--clear\)/)
    expect(STYLES).toMatch(/--clear:88px/)
  })

  describe('le repère dans la page', () => {
    /** Un contrôle de la page, avec la position que le navigateur lui donnerait (jsdom ne mesure rien). */
    function control(rect: { left: number; top: number; width: number; height: number }) {
      const element = document.createElement('a')
      document.body.appendChild(element)
      element.getBoundingClientRect = () =>
        ({
          ...rect,
          right: rect.left + rect.width,
          bottom: rect.top + rect.height,
          x: rect.left,
          y: rect.top,
        }) as DOMRect
      return element
    }

    it('entoure le contrôle d’un trait de 3 px à 3 px de lui, avec « Touche ici » dessous ; la page n’est pas modifiée', () => {
      const element = control({ left: 20, top: 100, width: 200, height: 40 })
      const before = element.outerHTML
      const handle = open()
      void handle.show('guide', props({ target: () => element }))

      const pointer = hosts().find((host) => host !== handle.host) as HTMLElement
      const ring = pointer.shadowRoot?.querySelector('.ring') as HTMLElement
      expect(ring.hidden).toBe(false)
      expect(ring.style.left).toBe('14px')
      expect(ring.style.top).toBe('94px')
      expect(ring.style.width).toBe('212px')
      expect(ring.style.height).toBe('52px')
      expect(pointer.shadowRoot?.querySelector('.label')?.textContent).toBe('Touche ici')
      expect(pointer.style.getPropertyValue('pointer-events')).toBe('none')
      expect(element.outerHTML).toBe(before)
      expect(element.getAttribute('style')).toBeNull()
    })

    it('l’attente longue garde le repère : l’étape reste à faire', () => {
      const element = control({ left: 20, top: 100, width: 200, height: 40 })
      const handle = open()
      void handle.show('guide', props({ stage: 'late', target: () => element }))

      expect(hosts()).toHaveLength(2)
      const pointer = hosts().find((host) => host !== handle.host) as HTMLElement
      const ring = (pointer.shadowRoot as ShadowRoot).querySelector('.ring') as HTMLElement
      expect(ring.hidden).toBe(false)
    })

    it('la page « fait » ou la page de connexion déjà ouverte : rien à entourer', () => {
      const element = control({ left: 20, top: 100, width: 200, height: 40 })
      const handle = open()
      void handle.show('guide', props({ step: 'login', form: true }))

      expect(shadow().querySelector('.g-text')?.textContent).toBe(
        'Entre tes identifiants dans la page. Tu tapes toi-même ton mot de passe.',
      )
      expect(hosts()).toHaveLength(1)
      void handle.show('guide', props({ stage: 'done', target: () => element }))
      expect(hosts()).toHaveLength(1)
    })

    it('le contrôle est résolu à l’affichage et gardé : un défilement ne relit pas la page à chaque image', async () => {
      const element = control({ left: 20, top: 100, width: 200, height: 40 })
      let reads = 0
      const handle = open()
      void handle.show(
        'guide',
        props({
          target: () => {
            reads += 1
            return element
          },
        }),
      )
      expect(reads).toBe(1)

      for (let i = 0; i < 20; i += 1) window.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(reads).toBe(1)
    })

    it('le contrôle disparu de la page est relu, au plus une fois par seconde ; un redimensionnement le relit tout de suite', async () => {
      let element: HTMLElement | null = control({ left: 20, top: 100, width: 200, height: 40 })
      let reads = 0
      const handle = open()
      void handle.show(
        'guide',
        props({
          target: () => {
            reads += 1
            return element
          },
        }),
      )
      const first = element as HTMLElement
      first.remove()

      // La page l'a retiré : les défilements qui suivent n'y changent rien avant la seconde
      for (let i = 0; i < 10; i += 1) window.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(reads).toBe(1)

      // La page en dessine un autre ; la fenêtre change de taille : relu aussitôt
      element = control({ left: 30, top: 120, width: 100, height: 30 })
      window.dispatchEvent(new Event('resize'))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(reads).toBe(2)
      const pointer = hosts().find((host) => host !== handle.host) as HTMLElement
      const ring = (pointer.shadowRoot as ShadowRoot).querySelector('.ring') as HTMLElement
      expect(ring.style.left).toBe('24px')
    })

    it('ne dessine rien quand la page ne montre pas le contrôle', () => {
      const handle = open()
      void handle.show('guide', props({ target: () => null }))

      const pointer = hosts().find((host) => host !== handle.host) as HTMLElement
      const root = pointer.shadowRoot as ShadowRoot
      expect((root.querySelector('.ring') as HTMLElement).hidden).toBe(true)
      expect((root.querySelector('.tag') as HTMLElement).hidden).toBe(true)
    })

    it('disparaît avec la carte : étape suivante sans contrôle, ou fermeture', () => {
      const element = control({ left: 20, top: 100, width: 200, height: 40 })
      const handle = open()
      void handle.show('guide', props({ target: () => element }))
      expect(hosts()).toHaveLength(2)

      void handle.show('guide', props({ stage: 'done', target: () => element }))
      expect(hosts()).toHaveLength(1)

      void handle.show('guide', props({ target: () => element }))
      handle.close()
      expect(hosts()).toHaveLength(0)
    })

    it('suit le contrôle quand la page défile', async () => {
      let top = 100
      const element = control({ left: 20, top: 100, width: 200, height: 40 })
      element.getBoundingClientRect = () =>
        ({
          left: 20,
          top,
          width: 200,
          height: 40,
          right: 220,
          bottom: top + 40,
          x: 20,
          y: top,
        }) as DOMRect
      const handle = open()
      void handle.show('guide', props({ target: () => element }))
      const pointer = hosts().find((host) => host !== handle.host) as HTMLElement
      const ring = pointer.shadowRoot?.querySelector('.ring') as HTMLElement
      expect(ring.style.top).toBe('94px')

      top = 60
      window.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(ring.style.top).toBe('54px')
    })
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
    expect(shadow().querySelector('h1')?.textContent).toBe('Ouvre d’abord Repas')
  })
})

describe('récapitulatif et confirmation', () => {
  it('dit les comptes en une phrase, la même que l’écran de l’envoi de Repas, et la liste repliable : ni rassurance ni rappel (DRV-628)', () => {
    const handle = open()
    void handle.show('summary', SUMMARY)

    const text = shadow().textContent ?? ''
    // « j'en ai toujours » et « pas cette fois » se disent ensemble : ni l'un ni l'autre n'ira au panier
    expect(shadow().querySelector('.lead')?.textContent).toBe(
      '4 articles : 2 sont déjà choisis, 1 est à choisir sur Leclerc, 1 ne sera pas mis au panier.',
    )
    expect(text).toContain('Farine : connu (Farine T55 1 kg)')
    expect(text).toContain('Poivre : à choisir')
    expect(text).not.toContain('Rien ne part')
    expect(text).not.toContain('Repas ne vide pas')
    expect(text).not.toContain('commandé')
    expect(shadow().querySelector('.notice')).toBeNull()
    // Le titre, une phrase, la liste repliée, deux boutons : rien d'autre
    expect([...shadow().querySelectorAll('h1, p, summary, button')].map((n) => n.tagName)).toEqual([
      'H1',
      'P',
      'SUMMARY',
      'BUTTON',
      'BUTTON',
    ])
    expect(shadow().querySelector('details')).not.toBeNull()
  })

  it('n’écrit aucun compteur, aucun zéro, ni « produits connus » ni « nouveaux produits » (DRV-626)', () => {
    const handle = open()
    void handle.show('summary', {
      known: 2,
      new: 4,
      haveAtHome: 0,
      skipped: 0,
      lines: [{ name: 'Farine', status: 'KNOWN' }],
    })

    const text = (shadow().textContent ?? '').replace(/Farine : connu/, '')
    expect(shadow().querySelector('.lead')?.textContent).toBe(
      '6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc.',
    )
    expect(shadow().querySelector('.counts')).toBeNull()
    expect(text).not.toMatch(/(^|\D)0(\D|$)/)
    expect(text).not.toMatch(
      /produits? connus?|nouveaux? produits?|« j’en ai toujours »|« pas cette fois »/,
    )
  })

  it('sans aucun article, pas de phrase (jamais « 0 article »)', () => {
    const handle = open()
    void handle.show('summary', { known: 0, new: 0, haveAtHome: 0, skipped: 0, lines: [] })

    expect(shadow().querySelector('.lead')).toBeNull()
    expect(shadow().textContent).not.toContain('0 article')
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
  const props: ProgressProps = {
    total: 4,
    done: 1,
    current: 'Farine',
    log: [{ kind: 'added', name: 'Farine' }],
  }
  const rows = () => [...shadow().querySelectorAll<HTMLElement>('.done-list li')]
  const bar = () => shadow().querySelector<HTMLElement>('[role="progressbar"]')

  it('montre le repère d’enseigne, le titre, la carte d’avancement, l’article en cours et le journal', () => {
    const handle = open()
    void handle.show('progress', props)

    expect(shadow().querySelector('.brand')?.textContent).toBe('Panier Leclerc')
    expect(shadow().querySelector('.brand svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(shadow().querySelector('h1')?.textContent).toBe('Ton panier se remplit')
    expect(shadow().querySelector('.big')?.textContent).toBe('1 sur 4')
    expect(shadow().querySelector('.what')?.textContent).toBe('articles traités')
    const now = shadow().querySelector('.now')
    expect(now?.getAttribute('aria-live')).toBe('polite')
    expect(now?.textContent).toContain('En ce moment')
    expect(now?.querySelector('strong')?.textContent).toBe('Farine')
    expect(rows().map((row) => row.getAttribute('aria-label'))).toEqual(['Farine : ajouté'])
    expect(shadow().querySelector('.keep')?.textContent).toBe('Garde l’application ouverte.')
    expect(shadow().querySelector('.keep svg')?.getAttribute('aria-hidden')).toBe('true')
    // La liste défile : elle se parcourt au clavier
    expect(shadow().querySelector('.done-list')?.getAttribute('tabindex')).toBe('0')
    expect(buttons().map((button) => button.textContent)).toEqual(['Arrêter'])
  })

  it('le repère d’enseigne vient de la table de l’enseigne, sans condition sur son nom', () => {
    ui = createUi({ mode: 'open', retailer: EXEMPLE })
    void ui.show('progress', props)

    expect(shadow().querySelector('.brand')?.textContent).toBe('Panier Exemple')
  })

  it('la barre est une vraie barre de progression, nommée, avec ses bornes et sa valeur dite', () => {
    const handle = open()
    void handle.show('progress', props)

    expect(bar()?.getAttribute('aria-label')).toBe('Avancement')
    expect(bar()?.getAttribute('aria-valuemin')).toBe('0')
    expect(bar()?.getAttribute('aria-valuemax')).toBe('4')
    expect(bar()?.getAttribute('aria-valuenow')).toBe('1')
    expect(bar()?.getAttribute('aria-valuetext')).toBe('1 sur 4')
    expect(bar()?.querySelector<HTMLElement>('.fill')?.style.width).toBe('25%')

    void handle.show('progress', { ...props, total: 0, done: 3 })

    expect(bar()?.getAttribute('aria-valuemax')).toBe('1')
    expect(bar()?.getAttribute('aria-valuenow')).toBe('1')
  })

  it.each(ENTRY_KINDS)(
    'la ligne « %s » a son icône, son nom, son état et sa phrase complète pour nom accessible',
    (kind) => {
      const handle = open()
      const entry: ProgressEntry = { kind, name: 'Figolu' }
      void handle.show('progress', { ...props, log: [entry] })
      const view = viewOf(entry, LECLERC)

      const row = rows()[0]
      expect(row?.getAttribute('aria-label')).toBe(view.sentence)
      expect(row?.querySelector('.label')?.textContent).toBe('Figolu')
      expect(row?.querySelector('.state')?.textContent).toBe(view.state)
      expect(row?.querySelector('.dot')?.classList.contains(view.tone)).toBe(true)
      expect(row?.querySelector('.dot svg')?.getAttribute('aria-hidden')).toBe('true')
      expect(row?.classList.contains('attention')).toBe(view.tone === 'attention')
    },
  )

  it('range les états : coche pleine pour ajouté, maison pour « j’en ai toujours », trait pour « pas cette fois », attention pour le reste', () => {
    const icons = Object.fromEntries(
      ENTRY_KINDS.map((kind) => [kind, viewOf({ kind, name: 'X' }, LECLERC)] as const).map(
        ([kind, view]) => [kind, `${view.icon}/${view.tone}`],
      ),
    )

    expect(icons).toEqual({
      added: 'check/ok',
      addedBackup: 'check/ok',
      acceptedAnyway: 'check/ok',
      savedNotInCart: 'attention/attention',
      haveAtHome: 'home/neutral',
      skipped: 'dash/neutral',
      toChoose: 'attention/attention',
      unavailable: 'attention/attention',
      notFound: 'attention/attention',
      cartRefused: 'attention/attention',
      slow: 'attention/attention',
      failed: 'attention/attention',
    })
  })

  it('les phrases complètes sont celles d’avant, mot pour mot', () => {
    const sentences = ENTRY_KINDS.map((kind) => viewOf({ kind, name: 'Lait' }, LECLERC).sentence)

    expect(sentences).toEqual([
      'Lait : ajouté',
      'Lait : ajouté, produit de remplacement',
      'Lait : ajouté, Leclerc l’a accepté',
      'Lait : enregistré, pas dans le panier',
      'Lait : j’en ai toujours',
      'Lait : pas cette fois',
      'Lait : à choisir ensuite',
      'Lait : plus disponible, à choisir ensuite',
      'Lait : produit introuvable, à choisir ensuite',
      'Lait : pas pris par le panier, à choisir ensuite',
      'Lait : Leclerc met trop de temps à répondre',
      'Lait : échec',
    ])
  })

  it('une note (le test automatique) n’a pas d’état en petit', () => {
    const handle = open()
    void handle.show('progress', {
      ...props,
      title: 'Test automatique',
      log: [{ kind: 'note', text: 'Étape 1' }],
    })

    expect(rows()[0]?.getAttribute('aria-label')).toBe('Étape 1')
    expect(rows()[0]?.querySelector('.state')).toBeNull()
    expect(shadow().querySelector('.brand')).toBeNull()
  })

  it('porte le titre du remplissage du panier, ou celui que l’appelant donne (le test automatique)', () => {
    const handle = open()
    void handle.show('progress', props)
    expect(shadow().querySelector('h1, h2')?.textContent).toBe('Ton panier se remplit')

    void handle.show('progress', { ...props, title: 'Test automatique' })

    expect(shadow().querySelector('h1, h2')?.textContent).toBe('Test automatique')
    expect(shadow().textContent).not.toContain('Ton panier se remplit')
  })

  it('porte la phrase de synthèse sous le titre quand le passage la donne, et rien sinon (plus d’écran de confirmation)', () => {
    const handle = open()
    const lead = '2 articles : 1 est déjà choisi, 1 est à choisir sur Leclerc.'
    void handle.show('progress', { ...props, lead })

    expect(shadow().querySelector('p.lead')?.textContent).toBe(lead)
    expect(shadow().querySelector('h1')?.nextElementSibling?.textContent).toBe(lead)
    expect(buttons().map((button) => button.textContent)).toEqual(['Arrêter'])

    void handle.show('progress', props)

    expect(shadow().querySelector('p.lead')).toBeNull()
  })

  it('se met à jour sans refaire l’écran, garde les plus récentes en bas et défile avec elles', () => {
    const handle = open()
    void handle.show('progress', props)
    const list = shadow().querySelector<HTMLElement>('.done-list')

    for (let i = 1; i <= 6; i += 1) {
      handle.update({ done: 1 + i, entry: { kind: 'added', name: `Article ${i}` } })
    }
    handle.update({ current: 'Lait', total: 10 })

    expect(shadow().querySelector('.done-list')).toBe(list)
    expect(rows().map((row) => row.querySelector('.label')?.textContent)).toEqual([
      'Farine',
      'Article 1',
      'Article 2',
      'Article 3',
      'Article 4',
      'Article 5',
      'Article 6',
    ])
    expect(shadow().querySelector('.now strong')?.textContent).toBe('Lait')
    expect(shadow().querySelector('.big')?.textContent).toBe('7 sur 10')
    expect(bar()?.getAttribute('aria-valuemax')).toBe('10')
    expect(bar()?.getAttribute('aria-valuenow')).toBe('7')
  })

  it('reste lisible quand le journal est long : un envoi entier, et pas un article de plus', () => {
    const handle = open()
    void handle.show('progress', { ...props, log: [] })

    for (let i = 1; i <= 120; i += 1) {
      handle.update({ entry: { kind: 'added', name: `Article ${i}` } })
    }

    expect(rows()).toHaveLength(100)
    expect(rows()[0]?.querySelector('.label')?.textContent).toBe('Article 21')
    expect(rows()[99]?.querySelector('.label')?.textContent).toBe('Article 120')
  })

  it('l’écran garde sa palette sombre, quel que soit le thème, et la perd avec l’écran suivant', () => {
    const handle = open()
    void handle.show('progress', props)
    const overlay = () => shadow().querySelector('.overlay')
    const backdrop = () => shadow().querySelector('.backdrop')

    expect(overlay()?.classList.contains('dark')).toBe(true)
    expect(backdrop()?.classList.contains('dark')).toBe(true)
    expect(STYLES).toMatch(/\.dark\{[^}]*--bg:#0f1713[^}]*--accent:#4fb58a/)

    void handle.show('welcome', {})

    expect(overlay()?.classList.contains('dark')).toBe(false)
    expect(backdrop()?.classList.contains('dark')).toBe(false)
  })

  it('l’indicateur tourne, sauf en mouvement réduit : un point fixe, sans animation', () => {
    const handle = open()
    void handle.show('progress', props)

    expect(shadow().querySelector('.now .spin')?.getAttribute('aria-hidden')).toBe('true')
    expect(STYLES).toMatch(/\.spin\{[^}]*animation:spin 1s linear infinite/)
    const reduced = STYLES.slice(STYLES.indexOf('@media (prefers-reduced-motion:reduce)'))
    expect(reduced).toMatch(/animation:none!important/)
    expect(reduced).toMatch(/\.spin\{border:0;background:radial-gradient/)
  })

  it('« Arrêter » rend « stop » une fois et dit qu’il s’arrête après la ligne en cours', async () => {
    const handle = open()
    const answer = handle.show('progress', props)

    press('Arrêter')

    await expect(answer).resolves.toBe('stop')
    const stop = buttons()[0]
    expect(stop?.disabled).toBe(true)
    expect(stop?.textContent).toBe('J’arrête après l’article en cours…')
    expect(stop?.disabled).toBe(true)
  })

  it('une mise à jour sans écran de progression ne fait rien', () => {
    const handle = open()
    void handle.show('welcome', {})

    expect(() => handle.update({ done: 3 })).not.toThrow()
    expect(() => createUi({ retailer: LECLERC }).update({ done: 3 })).not.toThrow()
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

  describe('le nombre se tape par-dessus le « 1 » prérempli (DRV-626)', () => {
    /** Les champs sur lesquels `select()` est appelé (jsdom ne sait pas lire la sélection d'un champ numérique). */
    const watchSelect = () => {
      const selected: HTMLInputElement[] = []
      vi.spyOn(HTMLInputElement.prototype, 'select').mockImplementation(function (
        this: HTMLInputElement,
      ) {
        selected.push(this)
      })
      return selected
    }

    it('sélectionne tout le champ à l’ouverture (le focus de l’écran)', () => {
      const selected = watchSelect()
      const handle = open()
      void handle.show('quantity', { ...props, packs: null })

      expect(selected).toEqual([input()])
    })

    it('le resélectionne quand on le touche tant que rien n’a été tapé (le toucher pose le curseur après le « 1 »)', async () => {
      vi.useFakeTimers()
      try {
        const handle = open()
        void handle.show('quantity', { ...props, packs: null })
        const selected = watchSelect()

        input().dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await vi.advanceTimersByTimeAsync(1)

        expect(selected).toEqual([input()])
      } finally {
        vi.useRealTimers()
      }
    })

    it('la première frappe re-sélectionne tout juste avant d’insérer (le curseur a pu se placer après le « 1 » depuis)', () => {
      const handle = open()
      void handle.show('quantity', { ...props, packs: null })
      const selected = watchSelect()

      input().dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }))
      input().dispatchEvent(
        new InputEvent('beforeinput', { data: '4', inputType: 'insertText', bubbles: true }),
      )

      expect(selected).toEqual([input(), input()])
    })

    it('ne touche plus à la sélection dès que l’utilisateur a tapé (jamais « 14 » effacé sous ses doigts)', async () => {
      vi.useFakeTimers()
      try {
        const handle = open()
        void handle.show('quantity', { ...props, packs: null })
        input().value = '4'
        input().dispatchEvent(new Event('input', { bubbles: true }))
        const selected = watchSelect()

        input().dispatchEvent(new MouseEvent('click', { bubbles: true }))
        input().dispatchEvent(new FocusEvent('focus'))
        input().dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))
        input().dispatchEvent(
          new InputEvent('beforeinput', { data: '2', inputType: 'insertText', bubbles: true }),
        )
        await vi.advanceTimersByTimeAsync(1)

        expect(selected).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it('dit la quantité demandée par la liste quand l’étape la connaît, comme l’écran de choix', () => {
    const handle = open()
    void handle.show('quantity', { ...props, need: '200 g' })

    expect(shadow().textContent).toContain('Il te faut : 200 g.')
    // Le texte vient avant le champ : on le lit avant de taper
    const paragraphs = [...shadow().querySelectorAll('p')].map((p) => p.textContent)
    expect(paragraphs.indexOf('Il te faut : 200 g.')).toBeGreaterThan(0)
  })

  it('n’écrit rien quand la quantité demandée est inconnue', () => {
    const handle = open()
    void handle.show('quantity', { ...props, need: null })
    expect(shadow().textContent).not.toContain('Il te faut')

    void handle.show('quantity', props)
    expect(shadow().textContent).not.toContain('Il te faut')
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
        'Entre un nombre entier de 1 à 99.',
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

describe('contenance du produit dans l’unité de la liste (DRV-652)', () => {
  const props = {
    ingredient: 'Cheddar en tranche',
    productLabel: 'Fromage Cheddar Burger Les Croisés 20 Tranches - 340g',
    quantity: 15,
    unitName: 'tranche',
    prefill: 20 as number | null,
  }
  const input = () => shadow().querySelector('input') as HTMLInputElement
  const submit = () => (shadow().querySelector('form') as HTMLFormElement).requestSubmit()
  const validate = () => buttons().find((button) => button.textContent === 'Valider')
  const type = (value: string) => {
    input().value = value
    input().dispatchEvent(new Event('input', { bubbles: true }))
  }
  const preview = () => shadow().querySelector('#apercu')?.textContent

  it('demande combien de tranches y a-t-il dans le produit, au pluriel, avec le focus dans le champ', () => {
    const handle = open()
    void handle.show('packSize', props)

    expect(shadow().querySelector('label')?.textContent).toBe(
      'Combien de tranches y a-t-il dans «\u00a0Fromage Cheddar Burger Les Croisés 20 Tranches - 340g\u00a0»\u00a0?',
    )
    expect(shadow().querySelector('label')?.getAttribute('for')).toBe(input().id)
    expect(shadow().activeElement).toBe(input())
    expect(shadow().textContent).not.toContain('Nombre de produits')
  })

  it('prérempli avec le nombre du libellé, et l’aperçu le dit tout de suite : « Il te faut 15 tranches : 1 produit »', () => {
    const handle = open()
    void handle.show('packSize', props)

    expect(input().value).toBe('20')
    expect(preview()).toBe('Il te faut 15 tranches : 1 produit')
    expect(validate()?.disabled).toBe(false)
  })

  it('sans proposition, le champ est vide, « Valider » est inactif et l’aperçu ne dit que la quantité', () => {
    const handle = open()
    void handle.show('packSize', { ...props, prefill: null })

    expect(input().value).toBe('')
    expect(validate()?.disabled).toBe(true)
    expect(preview()).toBe('Il te faut 15 tranches.')
  })

  it('une proposition décimale s’écrit avec la virgule française', () => {
    const handle = open()
    void handle.show('packSize', { ...props, prefill: 12.5 })

    expect(input().value).toBe('12,5')
  })

  it.each([
    ['20', 'Il te faut 15 tranches : 1 produit'],
    ['15', 'Il te faut 15 tranches : 1 produit'],
    ['14', 'Il te faut 15 tranches : 2 produits'],
    ['10', 'Il te faut 15 tranches : 2 produits'],
    ['7,5', 'Il te faut 15 tranches : 2 produits'],
    ['7,4', 'Il te faut 15 tranches : 3 produits'],
    ['1', 'Il te faut 15 tranches : 15 produits'],
    ['0,001', 'Il te faut 15 tranches : 99 produits'],
  ])('l’aperçu suit la frappe en direct : « %s » donne « %s »', (typed, expected) => {
    const handle = open()
    void handle.show('packSize', { ...props, prefill: null })

    type(typed)

    expect(preview()).toBe(expected)
    expect(validate()?.disabled).toBe(false)
  })

  it('l’unité s’accorde à la quantité demandée : 1 tranche, 1,5 tranche, 2 tranches', () => {
    for (const [quantity, expected] of [
      [1, 'Il te faut 1 tranche : 1 produit'],
      [1.5, 'Il te faut 1,5 tranche : 1 produit'],
      [2, 'Il te faut 2 tranches : 1 produit'],
    ] as const) {
      const handle = open()
      void handle.show('packSize', { ...props, quantity })
      expect(preview()).toBe(expected)
      ui?.close()
    }
  })

  it('une unité de plusieurs mots met le premier au pluriel : « cuillères à soupe »', () => {
    const handle = open()
    void handle.show('packSize', {
      ...props,
      unitName: 'cuillère à soupe',
      quantity: 2,
      prefill: null,
    })

    expect(shadow().querySelector('label')?.textContent).toContain(
      'Combien de cuillères à soupe y a-t-il',
    )
    expect(preview()).toBe('Il te faut 2 cuillères à soupe.')
  })

  it.each([
    [''],
    ['  '],
    ['0'],
    ['0,0004'],
    ['10000'],
    ['12,3456'],
    ['-3'],
    ['vingt'],
    ['1e3'],
    ['1 000'],
  ])(
    'refuse « %s » : « Valider » inactif, aucun aperçu en produits, rien ne part',
    async (value) => {
      const handle = open()
      const settled = vi.fn<() => void>()
      void handle.show('packSize', props).then(settled)

      type(value)
      submit()
      await Promise.resolve()

      expect(validate()?.disabled).toBe(true)
      expect(preview()).toBe('Il te faut 15 tranches.')
      expect(settled).not.toHaveBeenCalled()
      expect(shadow().querySelector('[role="alert"]')?.textContent).toBe(
        'Entre un nombre, par exemple 20 ou 12,5.',
      )
      expect(input().getAttribute('aria-invalid')).toBe('true')
    },
  )

  it('le message d’erreur disparaît dès que le nombre est valide', () => {
    const handle = open()
    void handle.show('packSize', props)
    type('abc')
    submit()
    expect(shadow().querySelector('[role="alert"]')?.textContent).not.toBe('')

    type('12,5')

    expect(shadow().querySelector('[role="alert"]')?.textContent).toBe('')
    expect(input().hasAttribute('aria-invalid')).toBe(false)
    expect(validate()?.disabled).toBe(false)
  })

  it('« Valider » rend le nombre tapé, virgule française comprise', async () => {
    const handle = open()
    const answer = handle.show('packSize', { ...props, prefill: null })
    type('12,5')

    press('Valider')

    await expect(answer).resolves.toBe(12.5)
  })

  it('la touche Entrée valide la proposition', async () => {
    const handle = open()
    const answer = handle.show('packSize', props)

    submit()

    await expect(answer).resolves.toBe(20)
  })

  it('« Pas cette fois » rend null', async () => {
    const handle = open()
    const answer = handle.show('packSize', props)

    press('Pas cette fois')

    await expect(answer).resolves.toBeNull()
  })

  it('le libellé du produit et le nom de l’unité sont du texte, jamais du HTML', () => {
    const handle = open()
    void handle.show('packSize', { ...props, productLabel: HOSTILE, unitName: HOSTILE })

    expect(shadow().querySelector('img, script')).toBeNull()
    expect(shadow().textContent).toContain(HOSTILE.split(' ')[0])
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()
  })
})

describe('le produit montré à l’écran « Vérifie la quantité » (DRV-652)', () => {
  const preview = () => shadow().querySelector('#apercu')?.textContent
  const PHOTO = 'https://photos-test.leclercdrive.fr/image.ashx?id=11&use=l&cat=p'
  const card = {
    name: 'Tomates cerises mélangées Barquette',
    label2: '400 g',
    details: ['400 g', '2,58 € ', '6,45 € / kg'].map((text) => text.trim()),
    photo: PHOTO,
  }
  const base = {
    ingredient: 'Tomate',
    productLabel: card.name,
    quantity: 2.5,
    unitName: 'unité',
    prefill: 1,
  }
  const media = () => shadow().querySelector('.product')

  it('montre la photo à gauche (décorative : texte alternatif vide), puis le nom, la seconde ligne et « 400 g · 2,58 € · 6,45 € / kg »', () => {
    const handle = open()
    void handle.show('packSize', { ...base, product: card })

    expect(media()?.firstElementChild?.classList.contains('photo')).toBe(true)
    const image = media()?.querySelector('img')
    expect(image?.getAttribute('alt')).toBe('')
    expect(image?.getAttribute('src')).toBe(PHOTO)
    expect(media()?.querySelector('.name')?.textContent).toBe('Tomates cerises mélangées Barquette')
    expect(media()?.textContent).toContain('400 g')
    expect(media()?.textContent).toContain('2,58 € · 6,45 € / kg')
    // Avant la question et le champ : on regarde le produit, puis on répond
    const order = [...shadow().querySelectorAll('.product, label, input')].map((el) => el.tagName)
    expect(order).toEqual(['DIV', 'LABEL', 'INPUT'])
  })

  it('la question élide « de » devant une voyelle : « Combien d’unités », jamais « Combien de unités »', () => {
    const handle = open()
    void handle.show('packSize', { ...base, product: card })

    expect(shadow().querySelector('label')?.textContent).toBe(
      'Combien d’unités y a-t-il dans «\u00a0Tomates cerises mélangées Barquette\u00a0»\u00a0?',
    )
    expect(shadow().textContent).not.toContain('de unités')
    expect(preview()).toBe('Il te faut 2,5 unités : 3 produits')
  })

  it.each([
    ['sans photo', { ...card, photo: null }],
    ['avec une adresse refusée', { ...card, photo: 'http://photos-test.leclercdrive.fr/a.jpg' }],
    ['sans photo (adresse d’un autre hôte)', { ...card, photo: 'https://exemple.invalid/a.jpg' }],
  ])('%s : aucune image, aucune trace, le nom et les détails restent', (_name, product) => {
    const handle = open()
    void handle.show('packSize', { ...base, product })

    expect(media()?.querySelector('img, .photo')).toBeNull()
    expect(media()?.querySelector('.name')?.textContent).toBe(card.name)
    expect(media()?.textContent).toContain('400 g')
  })

  it('une photo qui ne charge pas se retire sans laisser de trou', () => {
    const handle = open()
    void handle.show('packSize', { ...base, product: card })

    media()?.querySelector('img')?.dispatchEvent(new Event('error'))

    expect(media()?.querySelector('.photo')).toBeNull()
    expect(media()?.querySelector('.name')?.textContent).toBe(card.name)
  })

  it('sans prix ni contenu ni seconde ligne : seulement le nom, aucune ligne vide', () => {
    const handle = open()
    void handle.show('packSize', {
      ...base,
      product: { name: card.name, label2: null, details: [], photo: null },
    })

    expect([...(media()?.querySelectorAll('p') ?? [])].map((p) => p.textContent)).toEqual([
      card.name,
    ])
  })

  it('sans produit (écran appelé comme avant) : rien de plus que la question', () => {
    const handle = open()
    void handle.show('packSize', base)

    expect(media()).toBeNull()
  })

  it('« Nombre de produits » montre aussi le produit', () => {
    const handle = open()
    void handle.show('quantity', {
      ingredient: 'Farine',
      productLabel: 'Farine T55 1 kg',
      packs: 1,
      product: card,
    })

    expect(media()?.querySelector('.name')?.textContent).toBe(card.name)
    expect(media()?.querySelector('img')?.getAttribute('alt')).toBe('')
  })

  it('le nom, la seconde ligne et les détails sont du texte, jamais du HTML', () => {
    const handle = open()
    void handle.show('packSize', {
      ...base,
      product: { name: HOSTILE, label2: HOSTILE, details: [HOSTILE], photo: null },
    })

    expect(media()?.querySelector('script')).toBeNull()
    expect(media()?.querySelectorAll('img')).toHaveLength(0)
    expect(media()?.textContent).toContain('<img src=x')
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()
  })
})

describe('choix de produit (hôte)', () => {
  const base = { ingredient: 'Poivre', position: 2, total: 5 }
  /** Une liste de deux produits, un qui se choisit et un que l'utilisateur ne veut plus. */
  const mountList: ChooserProps['mount'] = (zone, done) =>
    void renderPicker(
      zone,
      {
        retailer: LECLERC,
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
      'Passer ces 4 articles',
      // le bloc « Trier » (DRV-743), sous « Il te faut » et avant la recherche
      'Pertinence',
      'Prix',
      'Prix au kilo',
      'A → Z',
      'Chercher',
      'Choisir',
      'Pas mon habituel',
      'Ne plus proposer',
      'Annuler l’envoi',
    ])
    const classOf = (label: string) =>
      buttons().find((button) => button.textContent === label)?.className
    expect(classOf('Choisir')).toBe('primary')
    for (const label of ['Pas cette fois', 'J’en ai toujours', 'Passer ces 4 articles']) {
      expect(`${label} : ${classOf(label)}`).toBe(`${label} : secondary`)
    }
    expect(classOf('Pas mon habituel')).toBe('secondary')
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

  describe('« Passer ces n articles » (DRV-624, DRV-626)', () => {
    const leaves = (position: number, total: number) => {
      const handle = open()
      void handle.show('chooser', { ingredient: 'Poivre', position, total, mount: () => undefined })
      return visibleLabels().filter((label) => label?.startsWith('Passer ces'))
    }

    it.each([
      [1, 4, ['Passer ces 4 articles']],
      [2, 4, ['Passer ces 3 articles']],
      [3, 4, ['Passer ces 2 articles']],
      [4, 4, []],
      [1, 1, []],
      [1, 2, ['Passer ces 2 articles']],
    ])(
      'au rang %i sur %i, le bouton compte les articles encore à choisir, celui-ci compris, et disparaît quand il n’en reste qu’un',
      (position, total, expected) => {
        expect(leaves(position, total)).toEqual(expected)
      },
    )

    it('passe tout de suite quand rien n’est à confirmer', async () => {
      const handle = open()
      const answer = handle.show('chooser', { ...base, mount: () => undefined })

      press('Passer ces 4 articles')

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
      press('Passer ces 4 articles')
      await Promise.resolve()

      // Then : la question prend la place des réponses, elle est annoncée et prend le focus ; rien n'est répondu
      expect(settled).not.toHaveBeenCalled()
      // Un écran à deux boutons : ni la liste de produits, ni la recherche, ni « Annuler l'envoi » (DRV-626)
      expect(visibleLabels()).toEqual(['Passer ces 4 articles', 'Revenir au choix'])
      const question = shadow().querySelector('.sure')
      expect(question?.textContent).toBe('Ces 4 articles ne seront pas mis au panier.')
      expect(question?.getAttribute('role')).toBe('alert')
      expect(shadow().activeElement).toBe(question)
      expect(shadow().querySelector('.confirm .primary')?.textContent).toBe('Passer ces 4 articles')
    })

    it('la confirmation cache la liste de produits et la recherche : deux boutons, une seule décision (DRV-626)', () => {
      const handle = open()
      void handle.show('chooser', { ...base, confirmRest: true, mount: mountList })
      expect(visibleLabels()).toContain('Choisir')
      expect(visibleLabels()).toContain('Chercher')

      press('Passer ces 4 articles')

      // Aucun « Choisir » vert sous la question, aucune recherche : tout ce qui est dans la liste est caché
      const hidden = (node: Element | null) => node?.closest('[hidden]') !== null
      expect(shadow().querySelector('.zone')).not.toBeNull()
      expect(hidden(shadow().querySelector('.zone'))).toBe(true)
      expect(hidden(shadow().querySelector('.picker input'))).toBe(true)
      expect(visibleLabels()).toEqual(['Passer ces 4 articles', 'Revenir au choix'])
      // La ligne de l'article reste : on voit de quel article il s'agit
      expect(shadow().querySelector('.head')?.textContent).toBe('Poivre (2 sur 5)')
      expect(hidden(shadow().querySelector('.head'))).toBe(false)
    })

    it('« Revenir au choix » remet la liste de produits, la recherche et les réponses', () => {
      const handle = open()
      void handle.show('chooser', { ...base, confirmRest: true, mount: mountList })
      press('Passer ces 4 articles')

      press('Revenir au choix')

      expect(visibleLabels()).toEqual([
        'Pas cette fois',
        'J’en ai toujours',
        'Passer ces 4 articles',
        'Pertinence',
        'Prix',
        'Prix au kilo',
        'A → Z',
        'Chercher',
        'Choisir',
        'Pas mon habituel',
        'Ne plus proposer',
        'Annuler l’envoi',
      ])
    })

    it('« Passer ces n articles » de la confirmation répond `rest`', async () => {
      const handle = open()
      const answer = handle.show('chooser', { ...base, confirmRest: true, mount: () => undefined })
      press('Passer ces 4 articles')

      shadow().querySelector<HTMLButtonElement>('.confirm .primary')?.click()

      await expect(answer).resolves.toEqual({ kind: 'rest' })
    })

    it('« Revenir au choix » remet les réponses, avec le focus sur le bouton qu’on vient de toucher', async () => {
      const handle = open()
      const settled = vi.fn<(answer: unknown) => void>()
      void handle
        .show('chooser', { ...base, confirmRest: true, mount: () => undefined })
        .then(settled)
      press('Passer ces 4 articles')

      press('Revenir au choix')
      await Promise.resolve()

      expect(settled).not.toHaveBeenCalled()
      expect(visibleLabels().slice(0, 3)).toEqual([
        'Pas cette fois',
        'J’en ai toujours',
        'Passer ces 4 articles',
      ])
      expect(shadow().activeElement?.textContent).toBe('Passer ces 4 articles')
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

  it('n’affiche pas « (1 sur 1) » quand il n’y a qu’un article à choisir (DRV-626)', () => {
    const handle = open()
    void handle.show('chooser', { ...base, position: 1, total: 1, mount: () => undefined })

    expect(shadow().querySelector('.head')?.textContent).toBe('Poivre')
    expect(shadow().textContent).not.toContain('sur 1')
    // L'article reste annoncé et reçoit le focus
    expect(shadow().activeElement).toBe(shadow().querySelector('.head'))
    expect(shadow().querySelector('.head')?.getAttribute('role')).toBe('status')
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
      press('Passer ces 4 articles')
      // Le dernier bouton que l'on voit est « Revenir au choix » : la liste et « Annuler l'envoi » sont cachés
      buttons()
        .filter((button) => !button.closest('[hidden]'))
        .at(-1)
        ?.focus()
      expect(shadow().activeElement?.textContent).toBe('Revenir au choix')

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      shadow().querySelector('.overlay')?.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(shadow().activeElement?.textContent).toBe('Passer ces 4 articles')
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
        'Copie impossible : sélectionne le texte du rapport et copie-le.',
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
    // Le titre et le bouton disent tout : plus de note sur ce qui est transmis (DRV-628)
    expect([...shadow().querySelectorAll('h1, p, button')].map((n) => n.tagName)).toEqual([
      'H1',
      'P',
      'BUTTON',
      'BUTTON',
    ])
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

describe('les deux gestes d’une fiche de produit (0.41.0)', () => {
  const item = (id: string, name: string, state: 'ok' | 'refused' = 'ok') => ({
    id,
    name,
    label2: null,
    details: [],
    promo: null,
    explain: '',
    state,
  })
  const props = {
    retailer: LECLERC,
    need: null,
    replaces: null,
    gone: [],
    checked: new Set<string>(),
    query: 'farine',
    items: [item('111', 'Farine de test 1 kg'), item('222', 'Farine écartée', 'refused')],
    notice: null,
  }
  const mountPicker = (zone: HTMLElement, done: (value: unknown) => void) =>
    void renderPicker(zone, props, {
      choose: (id, placement) => done({ id, placement }),
      search: () => undefined,
      never: () => undefined,
    })
  const show = () =>
    open().show('chooser', { ingredient: 'Farine', position: 1, total: 1, mount: mountPicker })
  const card = () => shadow().querySelector('.candidate')

  it('« Choisir » est le principal, « Pas mon habituel » est le secondaire, côte à côte sous la fiche', () => {
    void show()

    const pair = [...(card()?.querySelectorAll<HTMLButtonElement>('.pick > button') ?? [])]
    expect(pair.map((button) => [button.textContent, button.className])).toEqual([
      ['Choisir', 'primary'],
      ['Pas mon habituel', 'secondary'],
    ])
    expect(card()?.lastElementChild?.className).toBe('pick')
  })

  it('les noms accessibles commencent par le texte visible et nomment le produit', () => {
    void show()

    const names = [...(card()?.querySelectorAll('button') ?? [])].map((button) =>
      button.getAttribute('aria-label'),
    )
    expect(names).toEqual([
      'Choisir : Farine de test 1 kg',
      'Pas mon habituel : Farine de test 1 kg',
    ])
  })

  it('« Choisir » rend PRIMARY, sans autre écran', async () => {
    const answer = show()

    press('Choisir')

    await expect(answer).resolves.toEqual({
      kind: 'content',
      value: { id: '111', placement: 'PRIMARY' },
    })
    expect(shadow().textContent).not.toContain('Toujours prendre')
  })

  it('« Pas mon habituel » rend ONCE', async () => {
    const answer = show()

    press('Pas mon habituel')

    await expect(answer).resolves.toEqual({
      kind: 'content',
      value: { id: '111', placement: 'ONCE' },
    })
  })

  it('un produit écarté n’a qu’un bouton, grisé : « Ne plus proposer »', () => {
    void show()

    const refused = shadow().querySelectorAll('.candidate')[1]
    expect(
      [...(refused?.querySelectorAll<HTMLButtonElement>('button') ?? [])].map((button) => [
        button.textContent,
        button.disabled,
      ]),
    ).toEqual([['Ne plus proposer', true]])
  })

  it('ne parle ni de « secours », ni de « préféré », ni de remplacement, et ne pose plus « Toujours prendre ce produit ? »', () => {
    void show()

    expect(shadow().textContent).not.toMatch(/secours|préfér|remplacement|Toujours prendre/i)
    expect(shadow().textContent).not.toContain('Cette fois seulement')
  })

  it('affiche tel quel un libellé qui contient du HTML, y compris dans le nom accessible', () => {
    const zone = document.body.appendChild(document.createElement('div'))
    renderPicker(
      zone,
      { ...props, items: [item('111', HOSTILE)] },
      { choose: () => undefined, search: () => undefined, never: () => undefined },
    )

    expect(zone.querySelector('.name')?.textContent).toBe(HOSTILE)
    expect(zone.querySelector('.pick button')?.getAttribute('aria-label')).toBe(
      `Choisir : ${HOSTILE}`,
    )
    expect(zone.querySelector('img, script')).toBeNull()
    zone.remove()
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
    retailer: LECLERC,
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
      ['Pas mon habituel', false],
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
    expect(status()).toBe('Aucun produit trouvé pour « œuf ». Essaie un autre mot.')

    picker.results('œuf', [], null, 'oeuf')
    expect(status()).toBe('Aucun produit trouvé pour « œuf ». Essaie un autre mot.')
    expect(zone.querySelector<HTMLInputElement>('#chercher')?.value).toBe('poivre')
  })
})

describe('erreurs', () => {
  it.each(ERROR_CODES)('« %s » a un titre et un conseil en français', (code) => {
    const handle = open()
    void handle.show('error', { code, canReturn: false })

    expect(shadow().querySelector('h1')?.textContent).toBe(errorTexts(LECLERC)[code].title)
    expect(shadow().textContent).toContain(errorTexts(LECLERC)[code].text)
  })

  it('dit quoi faire quand Leclerc ralentit les requêtes ou quand le site a changé', () => {
    expect(errorTexts(LECLERC).BLOCKED.text).toContain('Attends')
    expect(errorTexts(LECLERC).BLOCKED.text).toContain('recharge la page')
    // Quand l'utilisateur ne peut rien faire, le texte le dit franchement et propose le repli : chercher à la main
    expect(errorTexts(LECLERC).CONTRACT_CHANGED.text).toBe(
      'Leclerc a changé son site, l’envoi automatique est arrêté. Ce qui est déjà au panier y reste. Cherche tes produits à la main sur Leclerc.',
    )
    expect(errorTexts(LECLERC).NOT_LOGGED_IN.text).toContain('Connecte-toi')
  })

  it.each(ERROR_CODES)(
    '« %s » tient en trois phrases de 20 mots au plus : ce qui s’est passé, ce qui est sauf, une action',
    (code) => {
      const sentences = errorTexts(LECLERC)[code].text.split(/(?<=[.!?])\s+/)

      expect(sentences).toHaveLength(3)
      expect(sentences[1]).toBe('Ce qui est déjà au panier y reste.')
      for (const sentence of sentences) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(20)
      // Aucun code à l'écran
      expect(errorTexts(LECLERC)[code].text).not.toMatch(/[A-Z]{2,}_[A-Z_]+/)
    },
  )

  it('le site mobile (cause PAGE_MOBILE) dit « Ce n’est pas la version ordinateur du site » et quoi faire (ticket J)', () => {
    const handle = open()
    void handle.show('error', { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'PAGE_MOBILE' })

    expect(shadow().querySelector('h1')?.textContent).toBe(
      'Ce n’est pas la version ordinateur du site',
    )
    expect(shadow().textContent).toContain('version ordinateur')
    expect(shadow().textContent).not.toContain(errorTexts(LECLERC).UNSUPPORTED_PAGE.title)
  })

  it('une cause sans texte à elle garde le titre et le conseil du code d’erreur', () => {
    const handle = open()
    void handle.show('error', { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'PAGE_PATH' })

    expect(shadow().querySelector('h1')?.textContent).toBe(
      errorTexts(LECLERC).UNSUPPORTED_PAGE.title,
    )
    expect(shadow().textContent).toContain(errorTexts(LECLERC).UNSUPPORTED_PAGE.text)
  })

  it('une cause hostile (« constructor », « __proto__ ») ne change rien au texte', () => {
    for (const cause of ['constructor', '__proto__', 'toString']) {
      const handle = open()
      void handle.show('error', { code: 'NETWORK', canReturn: false, cause })

      expect(shadow().querySelector('h1')?.textContent).toBe(errorTexts(LECLERC).NETWORK.title)
      handle.close()
    }
  })

  it('sans retour possible, ne propose que « Fermer »', async () => {
    const handle = open()
    const answer = handle.show('error', { code: 'INVALID_MESSAGE', canReturn: false })
    expect(labels()).toEqual(['Fermer ce message'])

    press('Fermer ce message')

    await expect(answer).resolves.toBe('close')
  })

  it('avec un retour possible, propose « Revenir à ma liste dans Repas » en premier', async () => {
    const handle = open()
    const answer = handle.show('error', { code: 'STORE_MISMATCH', canReturn: true })
    expect(labels()).toEqual(['Revenir à ma liste dans Repas', 'Fermer ce message'])
    expect(shadow().activeElement?.textContent).toBe('Revenir à ma liste dans Repas')

    press('Revenir à ma liste dans Repas')

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
      'Tes produits sont dans ton panier Leclerc. Retourne dans Repas pour le finaliser.',
    )

    press('Revenir à ma liste dans Repas')

    await expect(answer).resolves.toBe('return')
  })

  it('sans ligne recalculée, ne montre pas la mention « contenu différent »', () => {
    const handle = open()
    void handle.show('end', END)

    expect(shadow().textContent).not.toContain('Quantités changées')
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
    expect(note?.querySelector('strong')?.textContent).toBe('Quantités changées')
    expect(note?.textContent).toContain('Vérifie ces articles dans ton panier.')
    expect([...(note?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'Farine : 10 au lieu de 1',
      `${HOSTILE} : 2 au lieu de 4`,
    ])
    expect(shadow().querySelector('img, script, iframe, object')).toBeNull()
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()
    press('Revenir à ma liste dans Repas')
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
    expect(note?.textContent).toContain('Ces articles sont restés tels quels.')
    expect(note?.textContent).not.toContain('jamais')
    expect([...(note?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'Farine — Déjà 5 au panier : conservé',
      `${HOSTILE} — Déjà 3 au panier : conservé`,
    ])
    expect(shadow().querySelector('img, script, iframe, object')).toBeNull()
    press('Revenir à ma liste dans Repas')
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
      'Farine — au moins 4 gardés',
      'Sucre',
    ])
  })

  it('sans réponse trop lente, ne montre pas la mention « Leclerc met trop de temps »', () => {
    const handle = open()
    void handle.show('end', END)

    expect(shadow().textContent).not.toContain('trop de temps')
  })

  it('dit quand Leclerc a mis trop de temps à répondre : le reste (ce qui est sauf, l’action) est dans le texte de l’écran', () => {
    const handle = open()
    void handle.show('end', { ...END, outcome: 'partial', failed: 2, slow: true })

    const note = shadow().querySelector('.notice')
    expect(note?.textContent).toBe('Leclerc a mis trop de temps à répondre.')
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
      'Leclerc a ralenti les demandes. Ce qui est déjà au panier y reste : il reste 3 articles à ajouter. Attends quelques minutes, recharge la page, puis reprends l’envoi depuis Repas.',
    )
    // « Échecs » n'existe plus : l'échec se dit dans la phrase ; l'indisponible reste un compteur parce qu'il existe
    expect([...shadow().querySelectorAll('.counts li')].map((item) => item.textContent)).toEqual([
      'Ajoutés au panier : 2',
      'Choisis sur Leclerc : 1',
      'J’en ai toujours : 1',
      'Indisponibles : 1',
    ])
  })

  it('arrêté avant que rien ne soit mis au panier ni choisi : « Le panier n’est pas rempli », pas « en partie » (DRV-626)', () => {
    const handle = open()
    void handle.show('end', {
      ...END,
      outcome: 'partial',
      error: 'BLOCKED',
      added: 0,
      chosen: 0,
      haveAtHome: 0,
      failed: 4,
      unavailable: 2,
    })

    expect(shadow().querySelector('h1')?.textContent).toBe('Le panier n’est pas rempli')
    // Le texte reste en trois phrases, et ne contredit plus le titre
    expect(shadow().querySelector('h1 + p')?.textContent).toBe(
      'Leclerc a ralenti les demandes. Ce qui est déjà au panier y reste : il reste 6 articles à ajouter. Attends quelques minutes, recharge la page, puis reprends l’envoi depuis Repas.',
    )
    expect(shadow().textContent).not.toContain('en partie')
  })

  it.each([
    ['un article ajouté', { added: 1, chosen: 0 }],
    ['un article choisi sur Leclerc', { added: 0, chosen: 1 }],
  ])('%s : « Le panier est rempli en partie »', (_name, counts) => {
    const handle = open()
    void handle.show('end', { ...END, outcome: 'partial', failed: 1, ...counts })

    expect(shadow().querySelector('h1')?.textContent).toBe('Le panier est rempli en partie')
  })

  it.each(['aborted', 'error'] as const)(
    'un envoi « %s » garde son propre titre, même sans rien au panier',
    (outcome) => {
      const handle = open()
      void handle.show('end', { ...END, outcome, added: 0, chosen: 0, failed: 1 })

      expect(shadow().querySelector('h1')?.textContent).toBe(
        outcome === 'aborted' ? 'Tu as arrêté l’envoi' : 'L’envoi s’est arrêté',
      )
    },
  )

  it.each([
    [
      { outcome: 'partial', failed: 1 },
      'Le panier est rempli en partie',
      'L’envoi s’est arrêté avant la fin. Ce qui est déjà au panier y reste : il reste 1 article à ajouter. Retourne dans Repas pour reprendre l’envoi.',
    ],
    [
      { outcome: 'aborted' },
      'Tu as arrêté l’envoi',
      'Ce qui est déjà au panier y reste. Retourne dans Repas pour reprendre l’envoi.',
    ],
    [
      { outcome: 'aborted', error: 'CANCELLED' },
      'Tu as arrêté l’envoi',
      'Ce qui est déjà au panier y reste. Retourne dans Repas pour reprendre l’envoi.',
    ],
    [
      { outcome: 'error', error: 'NOT_LOGGED_IN' },
      'L’envoi s’est arrêté',
      'Tu n’es pas connecté à Leclerc. Ce qui est déjà au panier y reste. Connecte-toi à Leclerc, puis reprends l’envoi depuis Repas.',
    ],
    [
      { outcome: 'error', error: 'CONTRACT_CHANGED' },
      'L’envoi s’est arrêté',
      'Leclerc a changé son site, l’envoi automatique est arrêté. Ce qui est déjà au panier y reste. Cherche tes produits à la main sur Leclerc.',
    ],
    [
      { outcome: 'error' },
      'L’envoi s’est arrêté',
      'L’envoi n’a pas pu aller au bout. Ce qui est déjà au panier y reste. Retourne dans Repas pour reprendre l’envoi.',
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
      expect(labels()).toEqual(['Revenir à ma liste dans Repas'])
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
    press('Revenir à ma liste dans Repas')

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
    void handle.show('progress', {
      total: 1,
      done: 0,
      current: HOSTILE,
      log: [{ kind: 'added', name: HOSTILE }],
    })
    handle.update({ entry: { kind: 'note', text: HOSTILE }, current: HOSTILE })
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
