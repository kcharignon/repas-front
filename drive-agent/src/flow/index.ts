// L'orchestrateur de l'agent (DRV-305) : la machine d'états du passage, la phase A et l'état de reprise.
export { Flow } from './orchestrator'
export { putInCart, type CartNote, type Settled } from './keep-cart'
export { packsFor, type Packs } from './packs'
export {
  priceOf,
  settleKnownLine,
  type ContentChange,
  type KnownLineDeps,
  type Verdict,
} from './phase-a'
export { guidedChoice, labelOf, MAX_CANDIDATES } from './phase-b'
export { findKnownProduct, searchByName, type NameSearch } from './search-by-name'
export { MAX_FALLBACKS, searchForms } from './search-forms'
export {
  buildResult,
  cartsOf,
  changesOf,
  endingOf,
  endProps,
  hasSomethingToRead,
  resultLines,
  type Ending,
} from './result'
export { setupHandler, type SetupDeps } from './setup'
export {
  emptyState,
  RUN_PREFIX,
  RunStore,
  type RecordedCart,
  type RecordedChange,
  type RunState,
} from './run-state'
export type {
  FlowDeps,
  LineNotes,
  PendingLine,
  PhaseB,
  PhaseBContext,
  Step,
  StorageLike,
  WakeLockLike,
} from './types'
export { keepAwake } from './wake-lock'
