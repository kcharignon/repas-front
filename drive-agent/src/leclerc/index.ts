// L'adaptateur E.Leclerc Drive (DRV-303) : tout ce qui est propre à l'enseigne vit dans ce dossier, derrière `RetailerAdapter`.
export {
  browserDeps,
  ENTRY_WAIT_MS,
  LeclercAdapter,
  type CartResult,
  type LeclercDeps,
  type RetailerAdapter,
} from './adapter'
export { type Candidate, type PricePerMeasure } from './candidate'
export { contentFromLabel, parseContent, type Content, type ContentSource } from './content'
export { causeLabel, causeText, type LeclercCause } from './causes'
export { LeclercError, type LeclercErrorCode } from './errors'
export {
  entryFacts,
  readEntry,
  type EntryFacts,
  type EntryReading,
  type LinkFacts,
  type LinkWhere,
  type PageRef,
} from './entry'
export {
  JITTER_MS,
  MAX_BLOCKS,
  MAX_PAUSE_MS,
  NETWORK_RETRY_MS,
  Pacer,
  PAUSE_MS,
  RECOVERY_STEP_MS,
  REFUSAL_STEP_MS,
  REQUEST_TIMEOUT_MS,
  SLOW_REPLY_MS,
  SLOWDOWN_STEP_MS,
  type FetchFn,
  type RequestStats,
} from './pacer'
export {
  describeSession,
  readSession,
  type SessionReading,
  type SessionSign,
  type SessionState,
} from './session'
export { isMobileHost, type LocationLike, type StoreInfo } from './store'
export {
  addressShape,
  headerNames,
  mimeOf,
  stateKeys,
  type ArrivalFacts,
  type AttemptFacts,
  type DeliveryFacts,
  type NavigationFacts,
  type SearchFacts,
  type StateKeys,
} from './probe'
export { buildSearch, FALLBACK_ORDER, SEARCH_VARIANTS, type SearchVariant } from './search-request'
