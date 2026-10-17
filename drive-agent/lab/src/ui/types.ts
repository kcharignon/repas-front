// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
import type { LabEnv } from '../env'
import type { AddEvent } from '../frame'
import type { Product } from '../parse'
import type { StoreInfo } from '../store'

/** Le cadre de l'essai 5, resté ouvert pour l'essai 6. */
export interface FrameSession {
  iframe: HTMLIFrameElement
  /** Ajouts repérés dans le cadre depuis son ouverture. */
  events: AddEvent[]
  /** Retire la surveillance du cadre (appelé à la fermeture et à chaque nouveau chargement). */
  disarm: (() => void) | null
  /** Appelé à chaque ajout repéré (écran de l'essai 6 ouvert). */
  onEvent: ((event: AddEvent) => void) | null
  /** Enregistre un ajout repéré et l'affiche dans la barre du cadre. */
  record(event: AddEvent): void
  show(): void
  hide(): void
  close(): void
  isOpen(): boolean
}

/** Ce que les essais se passent d'un écran à l'autre (en mémoire, rien n'est stocké). */
export interface LabState {
  lastQuery: string | null
  lastProducts: Product[]
  lastAdded: { productId: string; label: string | null } | null
  frame: FrameSession | null
}

export interface ScreenContext {
  env: LabEnv
  state: LabState
  /** Zone vide de l'écran de l'essai. */
  main: HTMLElement
  store(): StoreInfo | null
  /** Ouvre un cadre plein écran (essai 5) ; `onLoad` est appelé à chaque chargement du cadre. */
  openFrame(url: string, onLoad: (iframe: HTMLIFrameElement) => void): FrameSession
}

export interface Essai {
  id: number
  title: string
  /** Une phrase qui dit à quoi sert l'essai. */
  summary: string
  render(ctx: ScreenContext): void
}
