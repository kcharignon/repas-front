// L'orchestrateur de l'agent (DRV-305) : la machine d'états du passage, la phase A et l'état de reprise.
export { Flow } from './orchestrator'
export { packsFor, type Packs } from './packs'
export { priceOf, settleKnownLine, type KnownLineDeps, type Verdict } from './phase-a'
export { guidedChoice, labelOf, MAX_CANDIDATES } from './phase-b'
export { buildResult, endingOf, endProps, resultLines, type Ending } from './result'
export { setupHandler, type SetupDeps } from './setup'
export { emptyState, RUN_PREFIX, RunStore, type RunState } from './run-state'
export type {
  FlowDeps,
  PendingLine,
  PhaseB,
  PhaseBContext,
  Step,
  StorageLike,
  WakeLockLike,
} from './types'
export { keepAwake } from './wake-lock'
