// La fenêtre au premier plan (DRV-757, A2) : sur le téléphone, la carte et le repère de l'agent ont disparu quand une enseigne a ouvert son panneau de choix du drive, sans que le
// faux site ni un essai dans Chrome le reproduisent ; la cause est INCONNUE. Ces sondes de FORME la rendent lisible dans le diagnostic : y a-t-il une boîte modale ou une fenêtre
// flottante ouverte (couche supérieure du navigateur : elle cache tout le reste, même un conteneur au z-index maximal), un plein écran, et quels sont les trois premiers éléments
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
  /** Les trois premiers éléments à ce point, du plus haut au plus bas. */
  stack: readonly { tag: string; id: string; className: string; zIndex: string }[]
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

export function foregroundFacts(win: Window): ForegroundFacts {
  const doc = win.document
  const point = { x: Math.round(win.innerWidth / 2), y: Math.round(win.innerHeight * 0.8) }
  const stack = (doc.elementsFromPoint?.(point.x, point.y) ?? []).slice(0, 3).map((element) => ({
    tag: safe(element.tagName.toLowerCase()),
    id: safe(element.id),
    className: safe(typeof element.className === 'string' ? element.className : ''),
    zIndex: safe(win.getComputedStyle(element).zIndex),
  }))
  return {
    modal: count(doc, ':modal'),
    popovers: count(doc, ':popover-open'),
    fullscreen: doc.fullscreenElement !== null && doc.fullscreenElement !== undefined,
    point,
    stack,
  }
}
