// L'échelle d'affichage de l'interface : ce qui la rend lisible sur un téléphone dont la WebView affiche le site en mode ordinateur.
//
// En mode ordinateur la fenêtre de la page fait environ 980 px CSS, affichée sur un écran de 411 dp (un Pixel 9) : un pixel CSS ne mesure plus que
// 0,42 dp, le texte de 16 px en fait 6,7 et un bouton de 44 px en fait 18. L'interface compense : elle se dessine dans un cadre dont la largeur est
// celle de ce que l'on voit réellement, en dp (comme sur un téléphone ordinaire), agrandi du facteur qui le ramène sur toute la zone visible. Sur
// un écran d'ordinateur, ou une page déjà adaptée au téléphone, ce facteur vaut 1 et rien ne change.
//
// Mesuré dans la WebView d'un Pixel 9 (émulateur 1080 x 2424, 420 dpi) : `innerWidth` 980, `screen.width` 412, `devicePixelRatio` 2,625 et
// `visualViewport.scale` 0,4207, soit les dp par pixel CSS, zoom initial de la fenêtre large compris ; en paysage, `innerWidth` 980, `screen.width`
// 924 mais `visualViewport.scale` 0,89 (la WebView n'occupe que ~872 dp : barres et encoche) : seule l'échelle de la page dit ce qui est réellement
// visible, la largeur de l'écran la surestime. On part donc de `visualViewport.scale`, et de la largeur de l'écran seulement à défaut.
//
// Aucun DOM ici : des mesures (nombres) vont dans une fonction pure, qui rend une mise en page (nombres) ; `ui.ts` la pose.

/** Le facteur ne descend jamais sous 1 (on n'amoindrit pas l'interface) ni ne monte au-delà de 3 (une fenêtre très large sur un écran étroit). */
export const MIN_SCALE = 1
export const MAX_SCALE = 3

/** Ce que la page sait de son affichage. Un nombre absent, nul ou faux (jsdom, navigateur ancien) est ignoré. */
export interface DisplayMeasures {
  /** `window.innerWidth` et `innerHeight` : la fenêtre de la page (fenêtre de disposition), en px CSS. */
  innerWidth: number
  innerHeight: number
  /** `screen.width` : la largeur de l'écran en pixels indépendants de la densité (dp). */
  screenWidth: number
  /**
   * `visualViewport` : la partie de la page réellement visible, en px CSS (sa taille et son décalage dans la fenêtre), et l'échelle de la page,
   * c'est-à-dire les dp par pixel CSS (zoom initial de la fenêtre large et zoom au pincement compris).
   */
  visible?:
    | { width: number; height: number; offsetLeft: number; offsetTop: number; scale: number }
    | undefined
}

/** La mise en page de l'interface : la zone visible (px CSS de la page) et le facteur d'agrandissement du cadre qu'elle contient. */
export interface DisplayLayout {
  scale: number
  left: number
  top: number
  width: number
  height: number
}

const positive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
const finite = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
const clamp = (factor: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, factor))

/**
 * Le facteur : combien de fois il faut agrandir un pixel CSS pour qu'il mesure un dp (l'inverse de l'échelle de la page), entre 1 et 3 ; 1 si
 * aucune mesure ne permet de le dire.
 */
export function displayScale(m: DisplayMeasures): number {
  if (positive(m.visible?.scale)) return clamp(1 / m.visible.scale)
  if (positive(m.innerWidth) && positive(m.screenWidth)) return clamp(m.innerWidth / m.screenWidth)
  return MIN_SCALE
}

/**
 * La zone que l'interface remplit, et son facteur. La zone est la partie visible de la page (`visualViewport`) : si l'utilisateur a agrandi la
 * page au pincement, l'interface se pose là où il regarde, à la taille d'un écran de téléphone, et non dans un coin de la fenêtre. À défaut,
 * c'est toute la fenêtre.
 */
export function displayLayout(m: DisplayMeasures): DisplayLayout {
  const seen = m.visible
  const useVisible = seen !== undefined && positive(seen.width) && positive(seen.height)
  return {
    scale: displayScale(m),
    left: useVisible ? finite(seen.offsetLeft) : 0,
    top: useVisible ? finite(seen.offsetTop) : 0,
    width: useVisible ? seen.width : finite(m.innerWidth),
    height: useVisible ? seen.height : finite(m.innerHeight),
  }
}

/** Les mesures de la fenêtre donnée (le `window` de la page, ou celui d'un test). */
export function measureDisplay(win: Window): DisplayMeasures {
  const seen = win.visualViewport
  return {
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    screenWidth: win.screen?.width ?? 0,
    visible: seen
      ? {
          width: seen.width,
          height: seen.height,
          offsetLeft: seen.offsetLeft,
          offsetTop: seen.offsetTop,
          scale: seen.scale,
        }
      : undefined,
  }
}
