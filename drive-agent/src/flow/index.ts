// L'orchestrateur de l'agent (DRV-305) : la machine d'états du passage, la phase A et l'état de reprise.
export { Flow } from './orchestrator'
export { putInCart, type CartNote, type Settled } from './keep-cart'
export { packsFor, type Packs } from './packs'
export {
  priceOf,
  settleKnownLine,
  type ContentChange,
  type KnownLineDeps,
  type UnavailableNote,
  type UnavailableReason,
  type Verdict,
} from './phase-a'
export { guidedChoice, labelOf, MAX_CANDIDATES } from './phase-b'
export {
  findKnownProduct,
  lookUpKnownProduct,
  searchByName,
  searchInOrder,
  type KnownSearch,
  type NameSearch,
  type SearchStep,
} from './search-by-name'
export { fallbackSteps, rememberedSearch } from './search-memory'
export { MAX_FALLBACKS, MAX_PRODUCT_FORMS, productSearchForms, searchForms } from './search-forms'
export {
  buildResult,
  cartsOf,
  changesOf,
  endingOf,
  endProps,
  hasSomethingToRead,
  reasonsOf,
  unreachedOf,
  resultLines,
  type Ending,
} from './result'
export { setupHandler, type SetupDeps } from './setup'
export {
  emptyState,
  LAST_REASONS_KEY,
  LAST_REFUSALS_KEY,
  readLastReasons,
  readLastRefusals,
  RUN_PREFIX,
  RunStore,
  type LastReason,
  type LastRefusal,
  type RecordedCart,
  type RecordedChange,
  type RecordedReason,
  type RecordedUnreached,
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
