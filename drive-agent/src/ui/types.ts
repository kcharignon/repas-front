// Les écrans de l'interface et ce que chacun reçoit (`props`) et rend (`answer`, la réponse de l'utilisateur).
import type { ErrorCode, LineStatus, Outcome } from '../../protocol'
import type { RetailerInfo } from '../retailers/names'
import type { GuideStep } from '../retailers/guide'

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

/**
 * Ce qui est arrivé à un article, sans phrase toute faite (DRV-744) : l'écran de progression en tire l'icône, l'état en petit et le nom accessible
 * (`entries.ts`). Les noms des sortes suivent les lignes du résultat ; aucune ne change ce que le résultat envoyé à Repas contient.
 */
export type EntryKind =
  | 'added'
  | 'addedBackup'
  | 'acceptedAnyway'
  | 'savedNotInCart'
  | 'haveAtHome'
  | 'skipped'
  | 'toChoose'
  | 'unavailable'
  | 'notFound'
  | 'cartRefused'
  | 'slow'
  | 'failed'

/** Une ligne du journal : un article et son état, ou une simple note (le test automatique de la variante de débogage n'a pas d'article). */
export type ProgressEntry =
  | { readonly kind: EntryKind; readonly name: string }
  | { readonly kind: 'note'; readonly text: string }

export interface ProgressProps {
  /** Le titre de l'écran, `S.progress.title` s'il manque (le test automatique en met un autre, DRV-318). */
  title?: string
  /** Une phrase sous le titre : ce qui part au panier (« 6 articles : … »), la même que sur l'écran d'envoi de Repas. Absente, rien. */
  lead?: string
  total: number
  done: number
  /** L'ingrédient en cours. */
  current: string
  /** Les actions déjà faites, la plus récente en dernier (l'écran en garde `LOG_SIZE`, la liste défile). */
  log: readonly ProgressEntry[]
}

/** Ce que `ui.update` change sur l'écran de progression ; `entry` ajoute une ligne au journal. */
export type ProgressPatch = Partial<Omit<ProgressProps, 'log'>> & { entry?: ProgressEntry }

/**
 * Le produit dont on vérifie la quantité, tel que la carte de l'écran de choix le montre : photo, nom complet, contenu net et prix. Tout vient de ce que
 * l'agent a déjà lu sur la page de recherche (aucune requête de plus) ; une partie absente ne laisse ni trou ni image cassée.
 */
export interface ProductCard {
  name: string
  /** La seconde ligne du libellé, s'il y en a une. */
  label2: string | null
  /** Contenu, prix, prix à l'unité de mesure, déjà formatés (« 400 g », « 2,58 € », « 6,45 € / kg »). */
  details: readonly string[]
  /** L'adresse de la photo, `null` s'il n'y en a pas ; revérifiée à l'affichage. */
  photo: string | null
}

export interface QuantityProps {
  ingredient: string
  productLabel: string
  /** Les `packs` du plan, `null` s'il n'y en a pas : le champ propose alors 1 (et le sélectionne en entier : on tape le nombre par-dessus). */
  packs: number | null
  /** La quantité que la liste demande, « 200 g » (comme sur l'écran de choix), quand l'étape la connaît (DRV-626). */
  need?: string | null
  /** Le produit, avec sa photo et ses détails (DRV-652) ; absent, l'écran ne montre que son libellé dans la question. */
  product?: ProductCard | undefined
}

/**
 * L'écran « Vérifie la quantité » quand le plan dit l'unité de la liste (DRV-652) : au lieu de « combien de produits ? », « combien de tranches y a-t-il dans
 * ce produit ? ». L'agent en tire le nombre de produits, et Repas retient la réponse pour ne plus poser la question.
 */
export interface PackSizeProps {
  ingredient: string
  productLabel: string
  /** La quantité que la liste demande, dans l'unité de la ligne (15 pour « 15 tranches »). */
  quantity: number
  /** Le nom de l'unité de la ligne au singulier (« tranche »), tel que le plan le donne. */
  unitName: string
  /** Le nombre que le libellé du produit annonce (« 20 Tranches » donne 20), ou `null` : le champ est alors vide. */
  prefill: number | null
  /** Le produit, avec sa photo et ses détails ; absent, l'écran ne montre que son libellé dans la question. */
  product?: ProductCard | undefined
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

/**
 * Le guide d'une étape de première utilisation (DRV-751, qui reprend le bandeau d'attente du magasin de DRV-740) : choisir son magasin, puis se connecter, sur la
 * page de l'enseigne. Une carte posée en bas : la page reste visible et touchable, le contrôle à toucher est entouré dans la page.
 * - `waiting` : l'étape est à faire, l'agent attend et continue tout seul ; `late` : l'attente s'est allongée, la carte propose d'attendre encore ;
 * - `done` : l'étape est faite, l'agent reprend la main (« Je remplis ton panier »).
 */
export interface GuideProps {
  step: GuideStep
  stage: 'waiting' | 'late' | 'done'
  /** Le rang de l'étape (à partir de 1) et leur nombre ; `0` : aucun repère d'étape (la lecture du magasin n'a qu'une étape, et pas de « 2 sur 2 »). */
  index: number
  total: number
  /** Le libellé du contrôle à toucher, tel que la page l'écrit ; `null` : le message ne cite aucun libellé. */
  label: string | null
  /** La personne est déjà sur la page de connexion de l'enseigne : la phrase dit de remplir le formulaire, et rien n'est entouré. */
  form?: boolean
  /** La lecture du magasin depuis les réglages : la carte dit que rien n'est enregistré si l'on arrête, au lieu de « ta liste est gardée ». */
  setup?: boolean
  /**
   * Le magasin se choisit sur l'ACCUEIL de l'enseigne, par son code postal (DRV-753 : le premier usage de Leclerc, avant tout magasin) : la phrase dit d'écrire le code
   * postal, pas de toucher une barre. Seulement pour l'étape `store`.
   */
  byPostalCode?: boolean
  /**
   * La carte se pose hors des boutons d'un mur de cookies que la page montre (`ui/keep-clear.ts`), sans jamais cacher le contrôle entouré ni son repère. Seulement là où
   * l'étape le demande (DRV-753 : le choix du magasin sur l'accueil national) ; les autres cartes du guide restent où elles sont.
   */
  clearOfConsent?: boolean
  /** Le contrôle à entourer dans la page, relu à chaque mesure (la page peut se redessiner) ; `null` : rien à entourer. */
  target?: () => HTMLElement | null
}

export interface ErrorProps {
  code: ErrorCode
  /**
   * Quelle vérification a échoué (`RetailerError.cause`, ticket A) : une cause qui a son propre texte (le site mobile, ticket J) remplace le titre et
   * le conseil du code d'erreur ; les autres sont ignorées.
   */
  cause?: string
  /** Vrai : un résultat peut repartir vers Repas (bouton « Revenir à ma liste dans Repas »), sinon l'écran se ferme seulement. */
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
  /** La contenance du produit dans l'unité de la liste (DRV-652), ou `null` pour « Pas cette fois ». */
  packSize: { props: PackSizeProps; answer: number | null }
  chooser: { props: ChooserProps; answer: ChooserAnswer }
  store: { props: StoreProps; answer: 'save' | 'cancel' }
  diagnostic: { props: DiagnosticProps; answer: 'close' }
  /**
   * Le site demande une vérification (page de défi de l'anti-robot, ticket K) : un bandeau, la page reste visible et touchable derrière. `resume` :
   * l'utilisateur l'a faite, le passage reprend ; `stop` : il arrête.
   */
  challenge: { props: ChallengeProps; answer: 'resume' | 'stop' }
  /** Un bandeau sans bouton (DRV-625) : sa promesse ne se résout jamais, la page de l'enseigne change ou l'utilisateur touche son bouton. */
  entry: { props: EntryProps; answer: never }
  /**
   * Le guide d'une étape (DRV-751) : une carte en bas, la page reste visible et touchable. `stop` : « Arrêter pour l'instant » (l'envoi, ou la lecture du magasin,
   * s'arrête, rien n'est perdu) ; `wait` : « Attendre encore » (seulement au stade `late`).
   */
  guide: { props: GuideProps; answer: 'stop' | 'wait' }
  error: { props: ErrorProps; answer: 'return' | 'close' }
  end: { props: EndProps; answer: 'return' }
}

export type ScreenName = keyof ScreenMap
export type ScreenProps<K extends ScreenName> = ScreenMap[K]['props']
export type ScreenAnswer<K extends ScreenName> = ScreenMap[K]['answer']

/** L'interface vue de l'orchestrateur : de quoi afficher un écran et attendre l'utilisateur, sans aucun DOM réel dans les tests. */
export interface Ui {
  /** L'enseigne de la page : son nom (et son nom avec « de ») vont dans les textes qui la nomment. */
  readonly retailer: RetailerInfo
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
