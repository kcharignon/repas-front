// L'état de reprise d'un passage, dans `sessionStorage` sous `repas:run:<runId>` : les issues des lignes déjà faites et la phase.
// Aucune donnée personnelle : des identifiants de lignes et de produits, rien d'autre. Une erreur du stockage (plein, interdit) ne gêne
// jamais le passage : on perd seulement la reprise.
import { LINE_OUTCOMES, type ResultLine } from '../../protocol'
import type { StorageLike } from './types'

export const RUN_PREFIX = 'repas:run:'

export interface RunState {
  v: 1
  runId: string
  /** L'heure de la dernière sauvegarde (pour garder le passage le plus récent). */
  updatedAt: number
  phase: 'PHASE_A' | 'PHASE_B'
  /** Les issues finales, par `ingredientSlug`. */
  done: Record<string, ResultLine>
  /** Les lignes qui attendent un choix (phase B) : les produits connus indisponibles. */
  waiting: Record<string, string[]>
}

export function emptyState(runId: string, now: number): RunState {
  return { v: 1, runId, updatedAt: now, phase: 'PHASE_A', done: {}, waiting: {} }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Un état lu du stockage n'est cru que s'il a la bonne forme : la page de l'enseigne partage ce stockage. */
function isState(value: unknown, runId: string): value is RunState {
  if (!isObject(value) || value.v !== 1 || value.runId !== runId) return false
  if (typeof value.updatedAt !== 'number') return false
  if (value.phase !== 'PHASE_A' && value.phase !== 'PHASE_B') return false
  const { done, waiting } = value
  if (!isObject(done) || !isObject(waiting)) return false
  const doneOk = Object.entries(done).every(
    ([slug, line]) =>
      isObject(line) &&
      line.ingredientSlug === slug &&
      LINE_OUTCOMES.includes(line.outcome as ResultLine['outcome']),
  )
  const waitingOk = Object.values(waiting).every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
  )
  return doneOk && waitingOk
}

export class RunStore {
  private readonly storage: StorageLike | null

  constructor(storage: StorageLike | null) {
    this.storage = storage
  }

  load(runId: string): RunState | null {
    try {
      const raw = this.storage?.getItem(RUN_PREFIX + runId)
      const state: unknown = raw ? JSON.parse(raw) : null
      return isState(state, runId) ? state : null
    } catch {
      return null
    }
  }

  save(state: RunState): void {
    try {
      this.storage?.setItem(RUN_PREFIX + state.runId, JSON.stringify(state))
    } catch {
      // Stockage plein ou interdit : le passage continue, sans reprise possible.
    }
  }

  remove(runId: string): void {
    try {
      this.storage?.removeItem(RUN_PREFIX + runId)
    } catch {
      // Sans importance.
    }
  }

  /** Un seul passage actif à la fois : l'état de tout autre passage est oublié. */
  removeOthers(runId: string): void {
    try {
      const storage = this.storage
      if (!storage) return
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      for (const key of keys) {
        if (key?.startsWith(RUN_PREFIX) && key !== RUN_PREFIX + runId) storage.removeItem(key)
      }
    } catch {
      // Sans importance.
    }
  }
}
