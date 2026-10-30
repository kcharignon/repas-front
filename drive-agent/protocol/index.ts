// Protocole v1 entre Repas et l'agent du drive (architecture.md § 8 du dépôt back) : types, codec, validateurs écrits à la main, nettoyage des textes.
// Partagé par l'agent (`drive-agent/src`, import relatif) et par le front (`@drive-protocol`). Aucune dépendance d'exécution.
export { decodeMessage, encodeMessage } from './codec'
import { STORES } from './check'
export { retailerOfHost, STORES } from './check'
/** L'hôte d'un magasin Leclerc. Gardé pour le site (`storeAddress.ts`, DRV-708) ; le reste lit `STORES[retailer].host`. */
export const STORE_HOST = STORES.leclerc.host
export { cleanSearchQuery, cleanText } from './clean-text'
export { ProtocolError } from './error'
export {
  isPackValue,
  ofUnits,
  packsFromSize,
  parsePackValue,
  pluralOf,
  toPackSize,
  unitFor,
  UNIT_SLUG,
} from './pack-size'
export { validateCommand } from './command'
export { validatePlan } from './plan'
export { validateResult } from './result'
export { validateSelftestResult } from './selftest'
export * from './types'
