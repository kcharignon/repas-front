// La place de la carte du guide (DRV-757). Une carte pleine prend beaucoup de place et cache vite ce que la page vient d'afficher (la ville proposée sous le champ, la liste des
// magasins) : elle se RÉDUIT à une barre fine quand la page a besoin de la place (le clavier est ouvert, ou la carte couvrirait un contrôle à toucher), et revient d'elle-même
// ensuite ; la personne peut aussi la réduire ou la rouvrir d'un toucher. Où que la carte soit (pleine ou barre, en bas ou en haut) elle ne couvre JAMAIS le champ où l'on écrit, ni un
// contrôle que l'enseigne dit à toucher, ni un bouton d'un mur de cookies : sans place, la barre s'efface le temps qu'il faut (rien d'essentiel ne dépend d'elle : la touche Retour de
// l'application propose d'abandonner). Que des LECTURES de la page : la position des contrôles, l'élément actif ; aucun toucher, aucune saisie, aucune requête.
import type { GuideSub } from '../retailers/guide'
import { consentRects, pointedRects } from './keep-clear'

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

/** La boîte que la page montre à l'écran d'un contrôle, ou rien (caché, hors de la fenêtre). */
function seen(element: Element, win: Window, uncovered = true): DOMRect[] {
  const rect = element.getBoundingClientRect()
  const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < win.innerHeight
  if (!visible || rect.right <= 0 || rect.left >= win.innerWidth) return []
  // Un contrôle que la page recouvre elle-même (le champ sous un mur de cookies plein écran) n'est pas à protéger : la personne ne le voit pas (sans `elementFromPoint` : on protège)
  const hit = uncovered
    ? win.document.elementFromPoint?.(rect.left + rect.width / 2, rect.top + rect.height / 2)
    : null
  return hit && !element.contains(hit) && !hit.contains(element) ? [] : [rect]
}

/** La personne écrit-elle dans un champ de la page (le clavier est alors ouvert) ? */
export function typingIn(doc: Document): HTMLElement | null {
  const active = doc.activeElement
  if (active instanceof HTMLTextAreaElement) return active
  if (active instanceof HTMLInputElement && EDITABLE.test(active.type)) return active
  return active instanceof HTMLElement && active.isContentEditable ? active : null
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
      // La carte est ôtée le temps de lire la page : ce qu'elle recouvrirait elle-même ne doit pas faire croire que la page le recouvre
      card.hidden = true
      for (const element of needs?.keep ?? []) hard.push(...seen(element, win))
      for (const element of needs?.maybe ?? []) soft.push(...seen(element, win))
      if (typing !== null) hard.push(...seen(typing, win, false))
      // Sans lecture du guide de l'enseigne, le contrôle entouré se protège comme avant (avec la place de son repère)
      if (needs === null && options.consent) hard.push(...pointedRects(options.pointed()))
      const sub = needs?.sub ?? null
      // Devant un mur de cookies la carte reste une barre : un toucher sur la barre ne redonne PAS la grande carte par-dessus les réponses du mur
      if (sub === 'wall' && pref === 'full') pref = 'auto'
      if (sub !== lastSub) {
        lastSub = sub
        if (pref === 'full') pref = 'auto'
      }
      const rects = [...hard, ...soft]
      const measure = (spot: Spot): DOMRect => {
        apply(spot)
        return card.getBoundingClientRect()
      }
      const full = choose(measure, rects, hard, false)
      // La page a besoin de la place : le clavier est ouvert, ou la carte pleine couvrirait un contrôle
      const need = typing !== null || needs?.compact === true || full === null
      if (pref === 'full' && !need) pref = 'auto'
      // Rouverte par la personne, sans place libre : la carte pleine, en bas, c'est elle qui l'a demandée
      const spot =
        options.collapsible && (pref === 'min' || (pref === 'auto' && need))
          ? (choose(measure, rects, hard, true) ??
            (sub === 'wall' ? leastCovered(measure, hard) : null))
          : (full ?? { min: false, top: false })
      apply(spot)
      placed = true
      const target = needs?.target ?? null
      // Un autre contrôle à entourer : le repère le relit (la carte, elle, il la suit à chaque mesure)
      if (target !== lastTarget) {
        lastTarget = target
        if (started) options.changed()
      }
      started = true
    } catch {
      // La page ne se laisse pas lire : la carte reste où elle est.
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
