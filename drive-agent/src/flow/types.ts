// Ce que l'orchestrateur reçoit (ses dépendances, toutes injectées) et ce qu'il offre à la phase B (DRV-306).
import type {
  PlanLine,
  PlanProduct,
  ResultLine,
  ResultMessage,
  SetupMessage,
  SetupResultMessage,
} from '../../protocol'
import type { RetailerAdapter } from '../leclerc'
import type { Ui } from '../ui'

/** Le stockage de session de la page (`sessionStorage`) : l'état de reprise y vit le temps de l'onglet. */
export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Le verrou d'écran du navigateur (`navigator.wakeLock`). */
export interface WakeLockLike {
  request(type: 'screen'): Promise<{ release(): Promise<void> }>
}

/** Une ligne qui attend un choix de l'utilisateur : un produit nouveau, ou aucun produit connu n'est plus disponible. */
export interface PendingLine {
  line: PlanLine
  /** Les produits connus de la ligne qui ne sont plus disponibles, dans l'ordre de priorité (vide pour une ligne nouvelle). */
  unavailable: PlanProduct[]
}

/** Ce que la phase B reçoit pour guider l'utilisateur (DRV-306). */
export interface PhaseBContext {
  pending: readonly PendingLine[]
  adapter: RetailerAdapter
  ui: Ui
  /**
   * Enregistre l'issue d'une ligne en attente (`CHOSEN`, `HAVE_AT_HOME`, `SKIPPED`, `FAILED`…) : elle est sauvegardée pour la reprise
   * et la progression avance. Une ligne qu'on n'enregistre pas devient `UNAVAILABLE` au résultat.
   */
  record(line: ResultLine): void
  /** Vrai dès que l'utilisateur a touché « Arrêter » : finir la ligne en cours, puis rendre la main. */
  stopRequested(): boolean
  /** Remet l'écran de progression, après un écran de la phase B. */
  showProgress(): void
}

/**
 * La phase B : l'utilisateur choisit un produit pour chaque ligne en attente. Rend `cancelled` s'il annule le passage. Une erreur de
 * l'adaptateur (`LeclercError`) peut la traverser : l'orchestrateur la traite comme en phase A.
 */
export type PhaseB = (context: PhaseBContext) => Promise<'done' | 'cancelled'>

export interface FlowDeps {
  adapter: RetailerAdapter
  ui: Ui
  /** Renvoie le résultat (ou, en mode configuration, le magasin lu) à Repas (`Transport.send`). */
  send: (message: ResultMessage | SetupResultMessage) => void
  /** `sessionStorage`, ou `null` s'il est inaccessible : la reprise est alors impossible. */
  storage: StorageLike | null
  /** `navigator.wakeLock`, ou `null` s'il n'existe pas. */
  wakeLock: WakeLockLike | null
  now: () => number
  agentVersion: string
  /** Faux : le résultat ne saurait pas revenir à Repas (origine non écrite dans l'agent) : refus avant toute action. */
  canReturn: boolean
  phaseB?: PhaseB
  /** Un message `setup` (DRV-307) : l'orchestrateur le valide puis le passe ici. */
  onSetup?: (message: SetupMessage) => void | Promise<void>
}

/** Les états de la machine : `START → VALIDATED → CONFIRMED → PHASE_A → PHASE_B → DONE`, ou `ABORTED` / `ERROR`. */
export type Step =
  'START' | 'VALIDATED' | 'CONFIRMED' | 'PHASE_A' | 'PHASE_B' | 'DONE' | 'ABORTED' | 'ERROR'
