// La cadence de Leclerc (ticket L de l'audit du 2026-10-18) : la file de requêtes elle-même est neutre (`retailers/pacer.ts`, DRV-717) ; ce fichier
// n'y met que les chiffres MESURÉS de Leclerc et le texte de son délai d'attente. Le comportement de Leclerc est celui d'avant, à l'identique.
import {
  Pacer as RequestPacer,
  type FetchFn,
  type PacerDeps,
  type PacerTuning,
} from '../retailers/pacer'

export {
  isChallenge,
  MAX_BLOCKS,
  NETWORK_RETRY_MS,
  RECOVERY_STEP_MS,
  REFUSAL_STEP_MS,
  REQUEST_TIMEOUT_MS,
  SLOW_REPLY_MS,
  SLOWDOWN_STEP_MS,
  type FetchFn,
  type PacerDeps,
  type Reply,
  type RequestStats,
} from '../retailers/pacer'

/** Attente minimale entre deux requêtes (architecture.md § 8). */
export const PAUSE_MS = 800
/** Gigue aléatoire ajoutée à l'attente : de 0 à 700 ms. */
export const JITTER_MS = 700
/**
 * La cadence s'adapte à Leclerc (ticket L de l'audit du 2026-10-18, H12) : quand le site ralentit, la pause entre deux requêtes s'allonge, jamais
 * au-delà de `MAX_PAUSE_MS` (gigue comprise), puis revient à `PAUSE_MS` à mesure que les réponses redeviennent rapides.
 */
export const MAX_PAUSE_MS = 3000

/** Le message d'une erreur réseau par délai d'attente dépassé (ticket K) : Leclerc répond, mais trop lentement. */
const TIMEOUT_MESSAGE = 'Leclerc met trop de temps à répondre.'

const TUNING: PacerTuning = {
  pauseMs: PAUSE_MS,
  jitterMs: JITTER_MS,
  maxPauseMs: MAX_PAUSE_MS,
  timeoutMessage: TIMEOUT_MESSAGE,
}

/** Les requêtes vers le site de Leclerc : la file neutre, avec la cadence de Leclerc (800 ms + 0 à 700 ms, plafond 3 s). */
export class Pacer extends RequestPacer {
  constructor(fetchFn: FetchFn, deps: PacerDeps) {
    super(fetchFn, deps, TUNING)
  }
}
