// La fenêtre au premier plan (DRV-757, A2) : sur le téléphone, la carte et le repère de l'agent ont disparu quand une enseigne a ouvert son panneau de choix du drive, sans que le
// faux site ni un essai dans Chrome le reproduisent ; la cause est INCONNUE. Ces sondes de FORME la rendent lisible dans le diagnostic : y a-t-il une boîte modale ou une fenêtre
// flottante ouverte (couche supérieure du navigateur : elle cache tout le reste, même un conteneur au z-index maximal), un plein écran, et quels sont les cinq premiers éléments (ceux de l'agent marqués)
// au point où se pose la carte. Lecture seule ; seulement des noms de balise, d'identifiant et de classe et un z-index, bornés et nettoyés : jamais un texte ni une valeur de la page.
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

/** Un nom de la page réduit à des caractères sûrs, 30 au plus : un nom de balise, d'identifiant ou de classe, jamais une phrase. */
const safe = (value: string): string => value.replace(/[^\w-]+/g, '_').slice(0, 30)

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
/** Les z-index des conteneurs de l'agent (l'interface, puis le repère). */
const AGENT_Z: ReadonlySet<string> = new Set(['2147483647', '2147483646'])

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
