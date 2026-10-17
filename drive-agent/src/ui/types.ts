// Les écrans de l'interface et ce que chacun reçoit (`props`) et rend (`answer`, la réponse de l'utilisateur).
import type { ErrorCode, LineStatus, Outcome } from '../../protocol'

export interface SummaryLine {
  name: string
  status: LineStatus
  /** Le produit préféré d'une ligne connue. */
  detail?: string
}

/** Le plan avant d'agir : les quatre nombres et la liste repliable. */
export interface SummaryProps {
  known: number
  new: number
  haveAtHome: number
  skipped: number
  lines: readonly SummaryLine[]
}

export interface ResumeProps {
  done: number
  total: number
}

export interface ProgressProps {
  total: number
  done: number
  /** L'ingrédient en cours. */
  current: string
  /** Les dernières actions, la plus récente en dernier (l'écran en garde cinq). */
  log: readonly string[]
}

/** Ce que `ui.update` change sur l'écran de progression ; `entry` ajoute une ligne au journal. */
export type ProgressPatch = Partial<Omit<ProgressProps, 'log'>> & { entry?: string }

export interface QuantityProps {
  ingredient: string
  productLabel: string
  /** Les `packs` du plan, `null` s'il n'y en a pas : le champ propose alors 1. */
  packs: number | null
}

/** Ce que l'utilisateur peut faire pendant le choix d'un produit (phase B, DRV-306). */
export type ChooserAnswer =
  | { kind: 'skip' }
  | { kind: 'have' }
  | { kind: 'cancel' }
  /** Le contenu de la zone a conclu (un produit choisi…) : `value` est défini par DRV-306. */
  | { kind: 'content'; value: unknown }

export interface ChooserProps {
  ingredient: string
  /** Rang de l'ingrédient parmi ceux à choisir, de 1 à `total`. */
  position: number
  total: number
  /**
   * Remplit la zone de contenu (cadre natif, liste de candidats…) quand l'écran est affiché. `answer` conclut l'écran avec la valeur
   * donnée. Rend, si besoin, la fonction qui nettoie quand l'écran est remplacé.
   */
  mount: (zone: HTMLElement, answer: (value: unknown) => void) => (() => void) | void
}

export interface ErrorProps {
  code: ErrorCode
  /** Vrai : un résultat peut repartir vers Repas (bouton « Retourner dans Repas »), sinon l'écran se ferme seulement. */
  canReturn: boolean
}

export interface EndProps {
  outcome: Outcome
  /** Le code qui a interrompu l'envoi, s'il y en a un. */
  error?: ErrorCode
  added: number
  chosen: number
  haveAtHome: number
  skipped: number
  unavailable: number
  failed: number
}

/** Les écrans : ce que `ui.show(nom, props)` affiche et ce que sa promesse rend. */
export interface ScreenMap {
  welcome: { props: Record<string, never>; answer: 'diagnostic' | 'close' }
  summary: { props: SummaryProps; answer: 'start' | 'cancel' }
  resume: { props: ResumeProps; answer: 'resume' | 'restart' | 'cancel' }
  progress: { props: ProgressProps; answer: 'stop' }
  /** Le nombre choisi, ou `null` pour « Passer ». */
  quantity: { props: QuantityProps; answer: number | null }
  chooser: { props: ChooserProps; answer: ChooserAnswer }
  error: { props: ErrorProps; answer: 'return' | 'close' }
  end: { props: EndProps; answer: 'return' }
}

export type ScreenName = keyof ScreenMap
export type ScreenProps<K extends ScreenName> = ScreenMap[K]['props']
export type ScreenAnswer<K extends ScreenName> = ScreenMap[K]['answer']

/** L'interface vue de l'orchestrateur : de quoi afficher un écran et attendre l'utilisateur, sans aucun DOM réel dans les tests. */
export interface Ui {
  /**
   * Affiche l'écran, à la place du précédent, et rend la réponse de l'utilisateur. La promesse d'un écran remplacé par un autre ne se
   * résout jamais (une réponse tardive est ignorée) ; celle de `progress` reste donc en attente tant que « Arrêter » n'est pas touché.
   */
  show<K extends ScreenName>(screen: K, props: ScreenProps<K>): Promise<ScreenAnswer<K>>
  /** Met à jour l'écran de progression s'il est affiché ; sans effet sinon. */
  update(patch: ProgressPatch): void
  /** Retire l'interface de la page. */
  close(): void
}
