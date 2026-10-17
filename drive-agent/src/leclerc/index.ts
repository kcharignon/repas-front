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
export { LeclercError, type LeclercErrorCode } from './errors'
export { JITTER_MS, MAX_BLOCKS, NETWORK_RETRY_MS, Pacer, PAUSE_MS, type FetchFn } from './pacer'
export { type LocationLike, type StoreInfo } from './store'
