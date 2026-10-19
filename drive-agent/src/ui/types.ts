// Les écrans de l'interface et ce que chacun reçoit (`props`) et rend (`answer`, la réponse de l'utilisateur).
import type { ErrorCode, LineStatus, Outcome, Placement } from '../../protocol'

/**
 * Pourquoi un produit habituel n'a pas été mis au panier (DRV-635). `OUT_OF_STOCK` : le site le dit en rupture (stock nul ou « Bientôt disponible ») ET le
 * panier en a refusé un ; `NOT_FOUND` : aucune recherche ne l'a retrouvé (ce qui ne prouve rien sur sa disponibilité) ; `CART_REFUSED` : le site le disait
 * disponible et le panier n'en a rien pris. Seul `OUT_OF_STOCK` se dit « n'est plus disponible ». Un état de l'agent et de son écran, pas du protocole.
 */
export type UnavailableReason = 'OUT_OF_STOCK' | 'NOT_FOUND' | 'CART_REFUSED'

/**
 * Pourquoi un produit CHOISI n'est pas au panier (DRV-644) : `COMING_SOON` (la fiche porte « Bientôt disponible », comme l'application officielle de l'enseigne),
 * `OUT_OF_STOCK` (la fiche ou la réponse du panier dit un stock nul) ou `CART_REFUSED` (la fiche le disait disponible, le panier n'en a rien pris). Un état de l'agent et de son écran, pas du protocole.
 */
export type UnreachedReason = 'OUT_OF_STOCK' | 'COMING_SOON' | 'CART_REFUSED'

export interface SummaryLine {
  name: string
  status: LineStatus
  /** Le produit habituel d'une ligne connue. */
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
  /** Les `packs` du plan, `null` s'il n'y en a pas : le champ propose alors 1 (et le sélectionne en entier : on tape le nombre par-dessus). */
  packs: number | null
  /** La quantité que la liste demande, « 200 g » (comme sur l'écran de choix), quand l'étape la connaît (DRV-626). */
  need?: string | null
}

/** Ce que l'utilisateur peut faire pendant le choix d'un produit (phase B, DRV-306). */
export type ChooserAnswer =
  | { kind: 'skip' }
  | { kind: 'have' }
  /** « Passer ces n articles » (DRV-624, DRV-626) : « Pas cette fois » pour cet article et tous ceux qui restent à choisir, sans rien retenir. */
  | { kind: 'rest' }
  | { kind: 'cancel' }
  /** Le contenu de la zone a conclu (un produit choisi…) : `value` est défini par DRV-306. */
  | { kind: 'content'; value: unknown }

export interface ChooserProps {
  ingredient: string
  /** Rang de l'ingrédient parmi ceux à choisir, de 1 à `total`. */
  position: number
  total: number
  /**
   * Vrai : un des articles que « Passer ces n articles » passerait (celui-ci compris) n'a encore aucun produit retenu. L'écran demande alors une
   * confirmation d'une ligne avant de répondre `rest` (DRV-624) : un écran à deux boutons, sans la liste de produits ni la recherche (DRV-626).
   * Le bouton lui-même est visible dès qu'il reste plus d'un article à choisir.
   */
  confirmRest?: boolean
  /**
   * Remplit la zone de contenu (cadre natif, liste de candidats…) quand l'écran est affiché. `answer` conclut l'écran avec la valeur
   * donnée. Rend, si besoin, la fonction qui nettoie quand l'écran est remplacé.
   */
  mount: (zone: HTMLElement, answer: (value: unknown) => void) => (() => void) | void
}

/** « Toujours prendre ce produit ? » : le produit choisi n'est pas celui que Repas retenait pour l'article (phase B, DRV-306, DRV-624). */
export interface PlacementProps {
  ingredient: string
  productLabel: string
  /** L'adresse de la photo du produit choisi (DRV-633), `null` s'il n'y en a pas ; revérifiée à l'affichage. */
  photo?: string | null | undefined
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

/** La demande de vérification de l'anti-robot (ticket K) : elle n'a pas de donnée, l'écran dit toujours la même chose. */
export type ChallengeProps = Record<string, never>

/**
 * L'entrée dans le magasin (DRV-625), un bandeau : `opening` pendant que l'agent suit lui-même « Commencer mes courses », `manual` quand il ne
 * le peut pas (lien absent, page inattendue, défi de l'anti-robot) et que l'utilisateur touche le bouton du site. Aucune réponse : la page change.
 */
export interface EntryProps {
  stage: 'opening' | 'manual'
}

export interface ErrorProps {
  code: ErrorCode
  /**
   * Quelle vérification a échoué (`LeclercError.cause`, ticket A) : une cause qui a son propre texte (le site mobile, ticket J) remplace le titre et
   * le conseil du code d'erreur ; les autres sont ignorées.
   */
  cause?: string
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
  /**
   * Les lignes dont le nombre de produits a été recalculé sur le contenu lu en direct, différent de celui que Repas avait mémorisé
   * (DRV-613). Absent (jamais vide) quand aucune ne l'a été.
   */
  changes?: readonly { name: string; planned: number; live: number }[]
  /**
   * Les lignes dont le panier avait déjà plus que la quantité du plan (ticket M) : Repas n'y a rien réduit, `inCart` est conservé. Absent
   * (jamais vide) quand aucune.
   */
  kept?: readonly { name: string; wanted: number; inCart: number }[]
  /**
   * Les lignes dont la recherche ne donnait pas la quantité déjà au panier (ticket M) ; `atLeast` est ce que la dernière réponse du panier en
   * disait, `null` si elle n'en disait rien. Absent (jamais vide) quand aucune.
   */
  unreadable?: readonly { name: string; atLeast: number | null }[]
  /**
   * Leclerc a mis trop de temps à répondre pour au moins une requête (ticket K : une ligne en échec `NETWORK` par délai d'attente dépassé).
   * Absent quand ce n'est pas arrivé.
   */
  slow?: true
  /**
   * Les articles restés sans produit dont la phase A sait pourquoi leur produit habituel n'a pas été mis au panier (DRV-635) : la raison et le nombre de
   * recherches faites, dans un bloc « Détails » replié. Absent (jamais vide) quand aucun.
   */
  reasons?: readonly { name: string; reason: UnavailableReason; tried: number }[]
  /**
   * Les produits que l'utilisateur a choisis et que le panier n'a pas pris (DRV-644) : le choix est enregistré, le produit n'est pas au panier. Le nom du
   * produit et pourquoi. Absent (jamais vide) quand aucun.
   */
  unreached?: readonly { label: string; reason: UnreachedReason }[]
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
  /**
   * `PRIMARY` (« Toujours prendre celui-ci ») ou `ONCE` (« Cette fois seulement »), ou `null` pour revenir à la liste de produits. L'écran ne
   * rend plus `FALLBACK` (DRV-624) : le protocole l'accepte toujours, l'agent ne l'émet plus.
   */
  placement: { props: PlacementProps; answer: Exclude<Placement, 'FALLBACK'> | null }
  /**
   * Le site demande une vérification (page de défi de l'anti-robot, ticket K) : un bandeau, la page reste visible et touchable derrière. `resume` :
   * l'utilisateur l'a faite, le passage reprend ; `stop` : il arrête.
   */
  challenge: { props: ChallengeProps; answer: 'resume' | 'stop' }
  /** Un bandeau sans bouton (DRV-625) : sa promesse ne se résout jamais, la page de l'enseigne change ou l'utilisateur touche son bouton. */
  entry: { props: EntryProps; answer: never }
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
