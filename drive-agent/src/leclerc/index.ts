// L'adaptateur E.Leclerc Drive (DRV-303) : tout ce qui est propre à l'enseigne vit dans ce dossier, derrière `RetailerAdapter`.
export {
  browserDeps,
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
  JITTER_MS,
  MAX_BLOCKS,
  NETWORK_RETRY_MS,
  Pacer,
  PAUSE_MS,
  REQUEST_TIMEOUT_MS,
  type FetchFn,
} from './pacer'
export {
  describeSession,
  readSession,
  type SessionReading,
  type SessionSign,
  type SessionState,
} from './session'
export { type LocationLike, type StoreInfo } from './store'
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
