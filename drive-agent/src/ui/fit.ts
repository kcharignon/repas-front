// La place de la carte du guide (DRV-757). Une carte pleine prend beaucoup de place et cache vite ce que la page vient d'afficher (la ville proposée sous le champ, la liste des
// magasins) : elle se RÉDUIT à une barre fine quand la page a besoin de la place (le clavier est ouvert, ou la carte couvrirait un contrôle à toucher), et revient d'elle-même
// ensuite ; la personne peut aussi la réduire ou la rouvrir d'un toucher. Où que la carte soit (pleine ou barre, en bas ou en haut) elle ne couvre JAMAIS le champ où l'on écrit, ni un
// contrôle que l'enseigne dit à toucher, ni un bouton d'un mur de cookies : sans place, la barre s'efface le temps qu'il faut (rien d'essentiel ne dépend d'elle : la touche Retour de
// l'application propose d'abandonner). Que des LECTURES de la page : la position des contrôles, l'élément actif ; aucun toucher, aucune saisie, aucune requête.
// DRV-768 : la carte n'est JAMAIS ôtée de la page pour la mesurer (un attribut `hidden` posé puis retiré deux fois par seconde la sortait de l'arbre d'accessibilité et l'y
// remettait : TalkBack perdait sa lecture) ; on l'ignore en lisant ce qui est sous le doigt (`elementsFromPoint`), et une passe où rien n'a changé ne touche pas à la carte.
import { isShown, type GuideSub } from '../retailers/guide'
import { answerWeight } from '../retailers/consent'
import { consentRects, formControls, pointedRects, topmost } from './keep-clear'

/** Le nom de la barre réduite, de la carte masquée faute de place, et du côté haut, dans la feuille de style de l'interface. */
export const MIN = 'min'
export const AWAY = 'away'
export const TOP = 'top'
/** La barre au MILIEU de l'écran, quand le haut et le bas portent tous deux ce qu'on ne couvre pas (un mur de cookies dense). */
export const MID = 'mid'

/** Ce que la personne a demandé : rien (la carte décide), réduire, ou rouvrir. */
export type Pref = 'auto' | 'min' | 'full'

/** Ce que la page a besoin de montrer, relu à chaque passe. */
export interface Needs {
  /** Les contrôles à ne jamais couvrir, et ceux qu'on évite de couvrir (les magasins qui suivent le premier). */
  keep: readonly HTMLElement[]
  maybe: readonly HTMLElement[]
  /** Un identifiant de la sous-étape : quand il change, une réouverture demandée ne vaut plus. */
  sub: GuideSub | null
  /** Le contrôle entouré : quand il change, le repère se remesure. */
  target: HTMLElement | null
  /** La page montre une liste à parcourir (la ville proposée, les magasins) : la carte se réduit, même s'il lui reste de la place. */
  compact: boolean
}

export interface FitOptions {
  /** Relit ce que la page a besoin de montrer (le plus souvent la lecture du guide de l'enseigne) ; `null` : rien de plus que le champ actif et le mur de cookies. */
  needs: (() => Needs) | null
  /** La carte se pose hors des boutons d'un mur de cookies. */
  consent: boolean
  /** Le contrôle entouré (sans lecture du guide de l'enseigne) : protégé comme avant, avec le repère. */
  pointed: () => HTMLElement | null
  /** Vrai : la carte peut se réduire en barre ; faux (la carte faite, le magasin ouvert) : seulement en bas ou en haut. */
  collapsible: boolean
  /** Appelé après chaque pose : la personne voit-elle la carte (vrai) ou non (faux : effacée faute de place, recouverte par un mur en couche supérieure, hors de la fenêtre) ? (DRV-760 : l'application pose un bandeau de repli quand aucune carte n'est montrée.) */
  visible?: (shown: boolean) => void
  /** Appelé quand la carte a changé de place ou de forme, ou que le contrôle à entourer a changé : le repère se remesure. */
  changed: () => void
}

export interface Fit {
  /** Ce que la personne demande : `min` réduit, `full` rouvre. */
  ask(pref: 'min' | 'full'): void
  stop(): void
}

type Box = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>
/** Un coin de la carte : réduite ou pleine, en haut ou en bas. */
interface Spot {
  min: boolean
  top: boolean
  mid?: boolean
}

/** Pleine d'abord, en bas puis en haut ; puis la barre, en bas, en haut, puis au milieu. */
const SPOTS: readonly Spot[] = [
  { min: false, top: false },
  { min: false, top: true },
  { min: true, top: false },
  { min: true, top: true },
  { min: true, top: false, mid: true },
]
/** La place qu'on laisse entre la carte et un contrôle, en pixels de la page. */
const AIR = 8
/** Le rythme de relecture : la page se dessine après l'arrivée de la carte. */
const FIT_MS = 500
/** Au plus une remesure par défilement toutes les 200 ms. */
const SCROLL_MS = 200
const EDITABLE = /^(?:|text|search|tel|email|url|number|password)$/

const hits = (box: Box, rects: readonly Box[]): boolean =>
  rects.some(
    (rect) =>
      rect.left < box.right + AIR &&
      rect.right > box.left - AIR &&
      rect.top < box.bottom + AIR &&
      rect.bottom > box.top - AIR,
  )

/**
 * La boîte que la page montre à l'écran d'un contrôle, ou rien (caché, hors de la fenêtre). `form` (DRV-761, un champ de saisie, son étiquette, le bouton du formulaire) : un petit élément
 * posé à côté du champ, dans le même bloc (l'étiquette flottante qui le recouvre), ne le cache pas ; un grand bloc de la page, si ; un conteneur de plus de la moitié de la fenêtre n'est pas un contrôle.
 */
function seen(
  element: Element,
  win: Window,
  ignore: Element,
  uncovered = true,
  form = false,
): DOMRect[] {
  const rect = element.getBoundingClientRect()
  const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < win.innerHeight
  if (!visible || rect.right <= 0 || rect.left >= win.innerWidth) return []
  if (form && rect.height > win.innerHeight / 2) return []
  // Un champ que la personne ne voit ni ne touche (transparent, caché, `pointer-events: none`, souvent dans un calque) n'est pas à garder libre ; sans `checkVisibility`, on le garde
  if (form && (!isShown(element) || win.getComputedStyle(element).pointerEvents === 'none'))
    return []
  // Un contrôle que la page recouvre elle-même (le champ sous un mur de cookies plein écran) n'est pas à protéger : la personne ne le voit pas (sans `elementFromPoint` : on protège)
  const hit = uncovered
    ? topmost(win.document, rect.left + rect.width / 2, rect.top + rect.height / 2, ignore)
    : null
  if (!hit || element.contains(hit) || hit.contains(element)) return [rect]
  const near = hit.getBoundingClientRect()
  const overlay =
    form &&
    element.parentElement?.contains(hit) === true &&
    near.width * near.height <= 4 * rect.width * rect.height
  return overlay ? [rect] : []
}

/** L'élément de la page qui porte la carte : l'hôte du Shadow DOM fermé (ce que le toucher rencontre), ou la carte elle-même. */
export function ownerOf(card: HTMLElement): Element {
  const root = card.getRootNode()
  return 'host' in root ? (root.host as Element) : card
}

/** La personne écrit-elle dans un champ de la page (le clavier est alors ouvert) ? */
export function typingIn(doc: Document): HTMLElement | null {
  const active = doc.activeElement
  if (active instanceof HTMLTextAreaElement) return active
  if (active instanceof HTMLInputElement && EDITABLE.test(active.type)) return active
  return active instanceof HTMLElement && active.isContentEditable ? active : null
}

/**
 * La personne VOIT-elle la carte (DRV-760) ? Sa boîte est dans la fenêtre ET, au centre de ce qui en est visible, le toucher tombe sur l'interface de l'agent (`elementFromPoint` rend
 * l'hôte du Shadow DOM fermé), pas sur un mur de cookies en couche supérieure (un `<dialog>` ouvert par `showModal()` recouvre tout, quel que soit le z-index) ni sur rien (un bloc
 * conteneur, `transform` ou `filter` sur le document, qui décale ce qui est `fixed` hors de la fenêtre). Sans `elementFromPoint` (pas de navigateur), on ne peut pas juger : vrai.
 */
export function reachable(card: HTMLElement, win: Window & typeof globalThis): boolean {
  const verdict = touchVerdict(card, win)
  return verdict === 'agent' || verdict === 'unknown'
}

/** Ce que le toucher au centre de la carte rencontre : l'agent, autre chose (un mur), rien de la fenêtre (carte hors de la fenêtre ou toucher dans le vide), ou on ne peut pas juger. */
export type TouchVerdict = 'agent' | 'other' | 'outside' | 'unknown'

export function touchVerdict(card: HTMLElement, win: Window & typeof globalThis): TouchVerdict {
  const doc = win.document
  if (typeof doc.elementFromPoint !== 'function') return 'unknown'
  const rect = card.getBoundingClientRect()
  const left = Math.max(rect.left, 0)
  const right = Math.min(rect.right, win.innerWidth)
  const top = Math.max(rect.top, 0)
  const bottom = Math.min(rect.bottom, win.innerHeight)
  if (right <= left || bottom <= top) return 'outside'
  const hit = doc.elementFromPoint((left + right) / 2, (top + bottom) / 2)
  const owner = ownerOf(card)
  if (hit === null) return 'outside'
  return hit === owner || owner.contains(hit) ? 'agent' : 'other'
}

/**
 * Où poser la carte : la première place qui ne couvre rien (`rects` : tout ce qu'on évite). La carte pleine, en bas puis en haut ; la barre de même, et à défaut une place qui
 * ne couvre que ce qu'on évite sans y tenir (`hard` : ce qu'on ne couvre jamais). `null` : aucune place ne convient. Une fonction pure, hors du DOM : `measure` pose la carte à
 * une place et rend sa boîte.
 */
export function choose(
  measure: (spot: Spot) => Box,
  rects: readonly Box[],
  hard: readonly Box[],
  bar: boolean,
): Spot | null {
  const first = (avoid: readonly Box[]): Spot | null =>
    SPOTS.find((spot) => spot.min === bar && !hits(measure(spot), avoid)) ?? null
  return first(rects) ?? (bar ? first(hard) : null)
}

/**
 * La barre là où elle coûte le MOINS à couvrir, jamais nulle part : devant un mur de cookies la carte ne s'efface pas (DRV-759). Couvrir une réponse du mur coûte cher (sa surface
 * × 1000 × son poids, `answerWeight` : jamais « Continuer sans accepter » tant qu'une autre place existe), tout autre contrôle sa surface seule : sans réponse à couvrir, la barre
 * se pose sur le texte du mur. À égalité, la première place (en bas, en haut, au milieu).
 */
export function leastCovered(
  measure: (spot: Spot) => Box,
  hard: readonly (Box & { w?: number })[],
): Spot {
  const cost = (box: Box): number =>
    hard.reduce((sum, rect) => {
      const width = Math.min(box.right, rect.right) - Math.max(box.left, rect.left)
      const height = Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top)
      return (
        sum +
        (width > 0 && height > 0 ? width * height * (rect.w === undefined ? 1 : rect.w * 1000) : 0)
      )
    }, 0)
  const spots = SPOTS.filter((spot) => spot.min)
  const costs = spots.map((spot) => cost(measure(spot)))
  return spots[costs.indexOf(Math.min(...costs))] ?? { min: true, top: false }
}

/** Pose la carte et la garde à sa place : relue toutes les 500 ms et à chaque changement de la fenêtre ou du champ actif. */
export function fitGuide(
  win: Window & typeof globalThis,
  card: HTMLElement,
  options: FitOptions,
): Fit {
  const doc = win.document
  let pref: Pref = 'auto'
  let lastSub: GuideSub | null = null
  let lastTarget: HTMLElement | null = null
  let started = false
  /** Ce que la dernière lecture complète du guide a rendu : un défilement ne le relit pas (il n'a changé de place que les boîtes), seule la place de la carte est refaite. */
  let latest: Needs | null = null
  /** Ce dont dépendait la place à la dernière mesure réussie : identique à la passe suivante, la carte n'est pas touchée. */
  let settled: string | null = null

  const apply = (spot: Spot | null): void => {
    card.hidden = spot === null
    card.classList.toggle(MIN, spot?.min === true)
    card.classList.toggle(TOP, spot?.top === true)
    card.classList.toggle(MID, spot?.mid === true)
    card.classList.toggle(AWAY, spot === null)
  }

  const check = (read = true): void => {
    // L'état de la dernière mesure réussie : une lecture qui lève le remet en entier (cachée, réduite, en haut, effacée), pas seulement `hidden`
    const was = {
      hidden: card.hidden,
      min: card.classList.contains(MIN),
      top: card.classList.contains(TOP),
      mid: card.classList.contains(MID),
      away: card.classList.contains(AWAY),
    }
    let placed = false
    try {
      if (read) latest = options.needs?.() ?? null
      const needs = latest
      const typing = typingIn(doc)
      const wall = options.consent ? consentRects(doc, win.innerWidth, win.innerHeight) : []
      const hard: Box[] = [...wall]
      const soft: Box[] = []
      // La carte reste dans la page pendant toute la lecture (DRV-768) : ce qu'elle recouvrirait elle-même ne doit pas faire croire que la page le recouvre, donc `seen` l'ignore
      // dans la pile sous le doigt, sans la cacher
      const owner = ownerOf(card)
      // Devant un mur, chaque contrôle de sa zone est pesé par son libellé (un refus que la lecture ne reconnaît pas ne se couvre pas en premier)
      for (const element of needs?.keep ?? []) {
        const weight = needs?.sub === 'wall' ? answerWeight(element) : undefined
        hard.push(...seen(element, win, owner).map((box) => Object.assign(box, { w: weight })))
      }
      for (const element of needs?.maybe ?? []) soft.push(...seen(element, win, owner))
      if (typing !== null) hard.push(...seen(typing, win, owner, false))
      // Quelle que soit l'enseigne, jamais sur ce où l'on écrit ni sur le bouton qui valide (DRV-761) ; devant un mur de cookies ses réponses seules comptent
      if (needs?.sub !== 'wall')
        for (const element of formControls(doc)) hard.push(...seen(element, win, owner, true, true))
      // Sans lecture du guide de l'enseigne, le contrôle entouré se protège comme avant (avec la place de son repère)
      if (needs === null && options.consent) hard.push(...pointedRects(options.pointed(), owner))
      const sub = needs?.sub ?? null
      // Devant un mur de cookies la carte reste une barre : un toucher sur la barre ne redonne PAS la grande carte par-dessus les réponses du mur
      if (sub === 'wall' && pref === 'full') pref = 'auto'
      if (sub !== lastSub) {
        lastSub = sub
        if (pref === 'full') pref = 'auto'
      }
      const rects = [...hard, ...soft]
      // Ce dont dépend la place : la page (les boîtes à éviter, la saisie, la fenêtre), ce que la personne a demandé, et la carte elle-même (sa forme, son texte, sa boîte)
      const keyOf = (): string => {
        const { top, bottom, left, right } = card.getBoundingClientRect()
        const boxes = rects
          .map((one) =>
            [one.top, one.bottom, one.left, one.right, (one as { w?: number }).w].join(','),
          )
          .join(';')
        return [
          pref,
          sub,
          typing !== null,
          needs?.compact === true,
          win.innerWidth,
          win.innerHeight,
          boxes,
          card.hidden,
          card.className,
          card.textContent,
          [top, bottom, left, right].join(','),
        ].join('\u0001')
      }
      // Rien n'a changé depuis la dernière passe : la place est la même, la carte n'est pas touchée (une mesure pose la carte à chaque place candidate, et ces allers-retours
      // d'attributs et de classes se verraient dans l'arbre d'accessibilité, deux fois par seconde)
      const measure = (spot: Spot): DOMRect => {
        apply(spot)
        return card.getBoundingClientRect()
      }
      /** Mesure les places candidates, pose la carte à la bonne : vrai si elle est montrée. */
      const place = (): boolean => {
        const full = choose(measure, rects, hard, false)
        // La page a besoin de la place : le clavier est ouvert, ou la carte pleine couvrirait un contrôle
        const need = typing !== null || needs?.compact === true || full === null
        if (pref === 'full' && !need) pref = 'auto'
        // Rouverte par la personne, sans place libre : la carte pleine, en bas, c'est elle qui l'a demandée
        const spot =
          options.collapsible && (pref === 'min' || (pref === 'auto' && need))
            ? (choose(measure, rects, hard, true) ??
              (sub === 'wall' || sub === 'shop' ? leastCovered(measure, hard) : null))
            : (full ?? { min: false, top: false })
        apply(spot)
        return spot !== null
      }
      const unchanged = settled !== null && keyOf() === settled
      const shown = unchanged ? !card.hidden : place()
      placed = true
      options.visible?.(shown && reachable(card, win))
      if (!unchanged) settled = keyOf()
      const target = needs?.target ?? null
      // Un autre contrôle à entourer : le repère le relit (la carte, elle, il la suit à chaque mesure)
      if (target !== lastTarget) {
        lastTarget = target
        if (started) options.changed()
      }
      started = true
    } catch {
      // La page ne se laisse pas lire : la carte reste où elle est, et la passe suivante mesure de nouveau.
      settled = null
    } finally {
      // Une lecture qui a levé après avoir ôté la carte la remet : la carte, avec « Arrêter pour l'instant », ne reste jamais cachée par une panne de lecture
      if (!placed) {
        card.hidden = was.hidden
        card.classList.toggle(MIN, was.min)
        card.classList.toggle(TOP, was.top)
        card.classList.toggle(MID, was.mid)
        card.classList.toggle(AWAY, was.away)
      }
    }
  }

  /** Un défilement ne relit pas le guide (des requêtes sur le document) : il refait la place de la carte, au plus une fois par 200 ms. */
  let scrolledAt = 0
  const onScroll = (): void => {
    const at = Date.now()
    if (at - scrolledAt < SCROLL_MS) return
    scrolledAt = at
    check(false)
  }
  const onChange = (): void => check()

  check()
  const timer = win.setInterval(onChange, FIT_MS)
  const events = ['resize', 'focusin', 'focusout'] as const
  for (const name of events) win.addEventListener(name, onChange, true)
  win.visualViewport?.addEventListener('resize', onChange)
  win.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return {
    ask(next) {
      pref = next
      check()
    },
    stop() {
      win.clearInterval(timer)
      for (const name of events) win.removeEventListener(name, onChange, true)
      win.visualViewport?.removeEventListener('resize', onChange)
      win.removeEventListener('scroll', onScroll, { capture: true })
    },
  }
}
