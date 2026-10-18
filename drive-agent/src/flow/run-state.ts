// L'état de reprise d'un passage, dans `sessionStorage` sous `repas:run:<runId>` : les issues des lignes déjà faites et la phase.
// Aucune donnée personnelle : des identifiants de lignes et de produits, rien d'autre. Une erreur du stockage (plein, interdit) ne gêne
// jamais le passage : on perd seulement la reprise.
import { LIMITS, LINE_OUTCOMES, type ResultLine, type ResultStats } from '../../protocol'
import type { CartNote } from './keep-cart'
import type { ContentChange } from './phase-a'
import type { StorageLike } from './types'

export const RUN_PREFIX = 'repas:run:'

/** Une ligne dont le nombre de produits a été recalculé sur le contenu lu en direct (DRV-613), gardée pour l'écran de fin. */
export interface RecordedChange extends ContentChange {
  ingredientSlug: string
}

/** Une ligne dont la quantité déjà au panier est à dire à la fin (ticket M : conservée, ou illisible), gardée pour l'écran de fin. */
export type RecordedCart = CartNote & { ingredientSlug: string }

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
  /** Les lignes ajoutées avec un nombre recalculé en direct, dans l'ordre du passage. */
  changes: RecordedChange[]
  /** Les lignes dont la quantité déjà au panier est à signaler (conservée ou illisible), dans l'ordre du passage. */
  carts: RecordedCart[]
  /** Les compteurs de requêtes du passage entier (ticket L), toutes les pages qu'il a connues : un nombre de plus à chaque ligne faite. */
  stats: ResultStats
}

export function emptyState(runId: string, now: number): RunState {
  return {
    v: 1,
    runId,
    updatedAt: now,
    phase: 'PHASE_A',
    done: {},
    waiting: {},
    changes: [],
    carts: [],
    stats: { requests: 0, errors: 0, blocks: 0 },
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPacks = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= LIMITS.packsMax

const isChange = (value: unknown): value is RecordedChange =>
  isObject(value) &&
  typeof value.ingredientSlug === 'string' &&
  isPacks(value.planned) &&
  isPacks(value.live)

/** La quantité au panier d'une mention : un entier de 1 à 99 999 (le site n'en laisse pas plus de 1 000). */
const isInCart = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 99999

const isCart = (value: unknown): value is RecordedCart => {
  if (!isObject(value) || typeof value.ingredientSlug !== 'string' || !isPacks(value.wanted)) {
    return false
  }
  if (value.kind === 'KEPT') return isInCart(value.inCart)
  return value.kind === 'UNREADABLE' && (value.inCart === null || isInCart(value.inCart))
}

const isCounter = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= LIMITS.requests

const isStats = (value: unknown): value is ResultStats =>
  isObject(value) &&
  Object.keys(value).length === 3 &&
  isCounter(value.requests) &&
  isCounter(value.errors) &&
  isCounter(value.blocks)

/** Un état tel qu'il est stocké : `changes` (DRV-613), `carts` (ticket M) et `stats` (ticket L) sont facultatifs, un état plus ancien n'en a pas. */
type StoredState = Omit<RunState, 'changes' | 'carts' | 'stats'> & {
  changes?: RecordedChange[]
  carts?: RecordedCart[]
  stats?: ResultStats
}

/** Un état lu du stockage n'est cru que s'il a la bonne forme : la page de l'enseigne partage ce stockage. */
function isState(value: unknown, runId: string): value is StoredState {
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
  const changesOk =
    value.changes === undefined ||
    (Array.isArray(value.changes) && value.changes.every((change) => isChange(change)))
  const cartsOk =
    value.carts === undefined ||
    (Array.isArray(value.carts) && value.carts.every((cart) => isCart(cart)))
  const statsOk = value.stats === undefined || isStats(value.stats)
  return doneOk && waitingOk && changesOk && cartsOk && statsOk
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
      return isState(state, runId)
        ? {
            ...state,
            changes: state.changes ?? [],
            carts: state.carts ?? [],
            stats: state.stats ?? { requests: 0, errors: 0, blocks: 0 },
          }
        : null
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
