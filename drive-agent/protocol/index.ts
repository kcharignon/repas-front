// Protocole v1 entre Repas et l'agent du drive (architecture.md § 8 du dépôt back) : types, codec, validateurs écrits à la main.
// Partagé par l'agent (`drive-agent/src`, import relatif) et par le front (`@drive-protocol`). Aucune dépendance d'exécution.
export { decodeMessage, encodeMessage } from './codec'
export { HOST as STORE_HOST } from './check'
export { ProtocolError } from './error'
export { validatePlan } from './plan'
export { validateResult } from './result'
export * from './types'
