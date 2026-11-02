// La fenêtre au premier plan (DRV-757, A2) : sur le téléphone, la carte et le repère de l'agent ont disparu quand une enseigne a ouvert son panneau de choix du drive, sans que le
// faux site ni un essai dans Chrome le reproduisent ; la cause est INCONNUE. Ces sondes de FORME la rendent lisible dans le diagnostic : y a-t-il une boîte modale ou une fenêtre
// flottante ouverte (couche supérieure du navigateur : elle cache tout le reste, même un conteneur au z-index maximal), un plein écran, et quels sont les cinq premiers éléments (ceux de l'agent marqués)
// au point où se pose la carte. Lecture seule ; seulement des noms de balise, d'identifiant et de classe et un z-index, bornés et nettoyés : jamais un texte ni une valeur de la page.
import { AGENT_Z } from '../agent-container'

export interface ForegroundFacts {
  /** Le nombre d'éléments `:modal` (une `<dialog>` ouverte avec `showModal()`, un plein écran) ; `null` : le navigateur ne sait pas poser la question. */
  modal: number | null
  /** Le nombre d'éléments `:popover-open` ; `null` : idem. */
  popovers: number | null
  /** Un élément est en plein écran. */
  fullscreen: boolean
  /** Le point sondé, en pixels de la fenêtre : le milieu de l'endroit où la carte se pose. */
  point: { x: number; y: number }
  /** Les cinq premiers éléments à ce point, du plus haut au plus bas ; `agent` : un conteneur de l'agent lui-même (la carte, le repère), à écarter pour lire le vrai panneau. */
  stack: readonly {
    tag: string
    id: string
    className: string
    zIndex: string
    agent: boolean
  }[]
}

/**
 * La carte vue de l'application (DRV-760) : de quoi dire laquelle des hypothèses est la bonne quand « aucune carte » (un mur en couche supérieure, un écran effacé faute de place, un bloc
 * conteneur qui décale ce qui est `fixed`, un passage bloqué avant le premier écran). Des formes seulement.
 */
export interface CardFacts {
  /** Le dernier état dit à l'application (`card`) ; `null` : l'agent n'a encore rien dit. */
  shown: boolean | null
  /** Le nom de l'écran affiché ; `null` : aucun. */
  screen: string | null
  /** La boîte de l'écran (gauche, haut, largeur, hauteur, entiers, pixels de la fenêtre) ; `null` : aucun écran. */
  box: readonly [number, number, number, number] | null
  /** Le toucher au centre de l'écran : l'agent, autre chose, hors de la fenêtre, ou inconnu ; `null` : aucun écran. */
  touch: 'agent' | 'other' | 'outside' | 'unknown' | null
  /** Le conteneur de l'agent est le dernier enfant du document ; `null` : il n'est pas posé. */
  last: boolean | null
  /** Combien de fois il a été déplacé depuis l'ouverture. */
  moves: number
  /** La balise de l'élément actif du document (un nom, jamais un texte). */
  active: string
  /** Le dernier état du flux (`Step`) ; `null` : aucun. */
  step: string | null
}

/** Un nom de la page réduit à des caractères sûrs, 30 au plus : un nom de balise, d'identifiant ou de classe, jamais une phrase. */
export const safe = (value: string): string => value.replace(/[^\w-]+/g, '_').slice(0, 30)

/** Combien d'éléments répondent à ce sélecteur ; `null` quand le navigateur ne le connaît pas. */
function count(doc: Document, selector: string): number | null {
  try {
    return doc.querySelectorAll(selector).length
  } catch {
    return null
  }
}

/** Combien d'éléments le rapport montre : les conteneurs de l'agent en prennent les premiers, le vrai panneau vient après. */
const SHOWN = 5

export function foregroundFacts(win: Window): ForegroundFacts {
  const doc = win.document
  const point = { x: Math.round(win.innerWidth / 2), y: Math.round(win.innerHeight * 0.8) }
  const stack = (doc.elementsFromPoint?.(point.x, point.y) ?? []).slice(0, SHOWN).map((element) => {
    const zIndex = safe(win.getComputedStyle(element).zIndex)
    return {
      tag: safe(element.tagName.toLowerCase()),
      id: safe(element.id),
      className: safe(typeof element.className === 'string' ? element.className : ''),
      zIndex,
      // Les deux conteneurs de l'agent : posés à la racine du document, aux z-index les plus hauts (interface, repère)
      agent: element.parentElement === doc.documentElement && AGENT_Z.has(zIndex),
    }
  })
  return {
    modal: count(doc, ':modal'),
    popovers: count(doc, ':popover-open'),
    fullscreen: doc.fullscreenElement !== null && doc.fullscreenElement !== undefined,
    point,
    stack,
  }
}
