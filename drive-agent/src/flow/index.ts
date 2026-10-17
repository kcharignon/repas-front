// L'orchestrateur de l'agent (DRV-305) : la machine d'états du passage, la phase A et l'état de reprise.
export { Flow } from './orchestrator'
export { priceOf, settleKnownLine, type KnownLineDeps, type Verdict } from './phase-a'
export { buildResult, endingOf, endProps, resultLines, type Ending } from './result'
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
