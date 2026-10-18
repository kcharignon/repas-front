// Les écrans de l'interface et ce que chacun reçoit (`props`) et rend (`answer`, la réponse de l'utilisateur).
import type { ErrorCode, LineStatus, Outcome, Placement } from '../../protocol'

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
  /** Le titre de l'écran, `S.progress.title` s'il manque (le test automatique en met un autre, DRV-318). */
  title?: string
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

/** « Que fais-tu de ce produit ? » : le rôle du produit choisi quand l'ingrédient en avait déjà (phase B, DRV-306). */
export interface PlacementProps {
  ingredient: string
  productLabel: string
}

/** Une ligne du diagnostic : le contrôle, son résultat en texte (le résultat n'est jamais dit par la seule couleur) et son détail. */
export interface DiagnosticRow {
  label: string
  /** « OK », « KO BLOCKED », « NON TESTÉ », ou « … » tant que le contrôle n'est pas fait. */
  badge: string
  detail: string | null
  tone: 'wait' | 'ok' | 'ko' | 'skip'
}

/** Ce que le diagnostic fait de l'écran une fois affiché : mettre les lignes à jour, puis donner le rapport. */
export interface DiagnosticView {
  update: (rows: readonly DiagnosticRow[]) => void
  /** Les contrôles sont finis : montre le résumé et le rapport copiable. */
  finish: (summary: string, report: string) => void
}

export interface DiagnosticProps {
  /** Appelé une fois l'écran dans la page ; lance les contrôles. */
  start: (view: DiagnosticView) => void
  /** Copie le rapport dans le presse-papiers ; `false` si le navigateur refuse. */
  copy: (text: string) => Promise<boolean>
}

/** Le magasin lu dans la page, avant de le donner à Repas (mode configuration, DRV-307). */
export interface StoreProps {
  id: string
  /** Le libellé lu dans la page, `null` s'il n'y en a pas : l'écran montre alors le numéro. */
  label: string | null
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
  store: { props: StoreProps; answer: 'save' | 'cancel' }
  diagnostic: { props: DiagnosticProps; answer: 'close' }
  /** Le rôle choisi, ou `null` pour revenir à la liste de produits. */
  placement: { props: PlacementProps; answer: Placement | null }
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
