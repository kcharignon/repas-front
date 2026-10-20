// L'état de reprise d'un passage, dans `sessionStorage` sous `repas:run:<runId>` : les issues des lignes déjà faites et la phase.
// Aucune donnée personnelle : des identifiants de lignes et de produits, rien d'autre. Une erreur du stockage (plein, interdit) ne gêne
// jamais le passage : on perd seulement la reprise.
import { LIMITS, LINE_OUTCOMES, type ResultLine, type ResultStats } from '../../protocol'
import type { CartNote } from './keep-cart'
import type { UnreachedReason } from '../ui'
import type { ContentChange, UnavailableNote } from './phase-a'
import type { StorageLike } from './types'

export const RUN_PREFIX = 'repas:run:'
/** La clé de l'envoi dont l'agent a déjà suivi « Commencer mes courses » dans cet onglet (DRV-625) : un identifiant, rien d'autre. */
export const ENTRY_KEY = 'repas:entry'
/** Les raisons du dernier envoi (DRV-635), gardées pour le diagnostic : des mots fixes et des nombres, jamais un libellé ni un identifiant. */
export const LAST_REASONS_KEY = 'repas:last-reasons'
/** Ce que le panier a répondu au dernier produit choisi qu'il n'a pas pris (DRV-644), gardé pour le diagnostic : deux nombres et un mot fixe. */
export const LAST_REFUSALS_KEY = 'repas:last-refusals'

/** Une ligne dont le nombre de produits a été recalculé sur le contenu lu en direct (DRV-613), gardée pour l'écran de fin. */
export interface RecordedChange extends ContentChange {
  ingredientSlug: string
}

/** Une ligne dont la quantité déjà au panier est à dire à la fin (ticket M : conservée, ou illisible), gardée pour l'écran de fin. */
export type RecordedCart = CartNote & { ingredientSlug: string }

/** Un produit habituel mis de côté pour la phase B, avec sa raison (DRV-635), gardé pour le choix, le journal et l'écran de fin. */
export type RecordedReason = UnavailableNote & { ingredientSlug: string }

/**
 * Un produit choisi que le panier n'a pas pris (DRV-644), gardé pour l'écran de fin : son nom (nettoyé, de 1 à 255 caractères), pourquoi, et ce que la réponse du
 * panier disait de sa disponibilité (des nombres lus tels quels, `null` si elle n'en disait rien).
 */
export interface RecordedUnreached {
  ingredientSlug: string
  reason: UnreachedReason
  label: string
  stock: number | null
  availability: number | null
}

/** Ce que le diagnostic garde d'un refus du panier : jamais le nom ni l'identifiant du produit. */
export type LastRefusal = Pick<RecordedUnreached, 'reason' | 'stock' | 'availability'>

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
  /** Les produits habituels que la phase A n'a pas mis au panier, avec leur raison, dans l'ordre du passage (DRV-635). */
  reasons: RecordedReason[]
  /** Les produits choisis que le panier n'a pas pris, dans l'ordre du passage (DRV-644). */
  unreached: RecordedUnreached[]
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
    reasons: [],
    unreached: [],
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

const isReason = (value: unknown): value is RecordedReason =>
  isObject(value) &&
  typeof value.ingredientSlug === 'string' &&
  typeof value.id === 'string' &&
  (value.reason === 'OUT_OF_STOCK' ||
    value.reason === 'NOT_FOUND' ||
    value.reason === 'CART_REFUSED') &&
  Number.isInteger(value.tried) &&
  (value.tried as number) >= 1 &&
  (value.tried as number) <= 99

const isNullableCount = (value: unknown): value is number | null =>
  value === null ||
  (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000)

const isUnreached = (value: unknown): value is RecordedUnreached =>
  isObject(value) &&
  typeof value.ingredientSlug === 'string' &&
  (value.reason === 'OUT_OF_STOCK' ||
    value.reason === 'COMING_SOON' ||
    value.reason === 'CART_REFUSED') &&
  typeof value.label === 'string' &&
  value.label.length >= 1 &&
  value.label.length <= LIMITS.label &&
  isNullableCount(value.stock) &&
  isNullableCount(value.availability)

const isCounter = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= LIMITS.requests

const isStats = (value: unknown): value is ResultStats =>
  isObject(value) &&
  Object.keys(value).length === 3 &&
  isCounter(value.requests) &&
  isCounter(value.errors) &&
  isCounter(value.blocks)

/** Un état tel qu'il est stocké : `changes` (DRV-613), `carts` (ticket M), `reasons` (DRV-635) et `stats` (ticket L) sont facultatifs, un état plus ancien n'en a pas. */
type StoredState = Omit<RunState, 'changes' | 'carts' | 'reasons' | 'unreached' | 'stats'> & {
  changes?: RecordedChange[]
  carts?: RecordedCart[]
  reasons?: RecordedReason[]
  unreached?: RecordedUnreached[]
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
  const reasonsOk =
    value.reasons === undefined ||
    (Array.isArray(value.reasons) && value.reasons.every((reason) => isReason(reason)))
  const unreachedOk =
    value.unreached === undefined ||
    (Array.isArray(value.unreached) && value.unreached.every((item) => isUnreached(item)))
  const statsOk = value.stats === undefined || isStats(value.stats)
  return doneOk && waitingOk && changesOk && cartsOk && reasonsOk && unreachedOk && statsOk
}

/** La raison d'un produit habituel du dernier envoi, sans libellé ni identifiant (DRV-635) : de quoi la dire dans le diagnostic. */
export type LastReason = Pick<UnavailableNote, 'reason' | 'tried'>

/** Les refus du panier du dernier envoi, tels que `RunStore.keepRefusals` les a gardés ; vide si le stockage est muet ou si rien n'a été gardé. */
export function readLastRefusals(storage: StorageLike | null): LastRefusal[] {
  try {
    const raw = storage?.getItem(LAST_REFUSALS_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list)
      ? list.filter((item): item is LastRefusal =>
          isUnreached({ ingredientSlug: '', label: '-', ...(item as object) }),
        )
      : []
  } catch {
    return []
  }
}

/** Les raisons du dernier envoi, telles que `RunStore.keepReasons` les a gardées ; vide si le stockage est muet ou si rien n'a été gardé. */
export function readLastReasons(storage: StorageLike | null): LastReason[] {
  try {
    const raw = storage?.getItem(LAST_REASONS_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list)
      ? list.filter((item): item is LastReason =>
          isReason({ ingredientSlug: '', id: '', ...(item as object) }),
        )
      : []
  } catch {
    return []
  }
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
            reasons: state.reasons ?? [],
            unreached: state.unreached ?? [],
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

  /**
   * Note que l'agent a suivi « Commencer mes courses » pour cet envoi, et dit si c'est la première fois dans cet onglet (DRV-625). Garde contre
   * toute boucle : une page qui nous ramène ici, un rechargement, une application qui renvoie le plan une seconde fois. Sans stockage, on ne
   * suit rien (jamais de boucle possible).
   */
  markEntered(runId: string): boolean {
    try {
      const storage = this.storage
      if (!storage || storage.getItem(ENTRY_KEY) === runId) return false
      storage.setItem(ENTRY_KEY, runId)
      return true
    } catch {
      return false
    }
  }

  /**
   * L'agent a-t-il déjà suivi « Commencer mes courses » pour cet envoi dans cet onglet (ou ne peut-il pas le noter, sans stockage) ? Une lecture,
   * qui ne note rien : `markEntered` reste le seul geste qui autorise un clic.
   */
  hasEntered(runId: string): boolean {
    try {
      const storage = this.storage
      return !storage || storage.getItem(ENTRY_KEY) === runId
    } catch {
      return true
    }
  }

  /** Garde les raisons de cet envoi pour le diagnostic, à la place de celles du précédent. */
  keepReasons(reasons: readonly LastReason[]): void {
    try {
      if (reasons.length === 0) {
        this.storage?.removeItem(LAST_REASONS_KEY)
        return
      }
      const kept = reasons.slice(0, 100).map(({ reason, tried }) => ({ reason, tried }))
      this.storage?.setItem(LAST_REASONS_KEY, JSON.stringify(kept))
    } catch {
      // Stockage plein ou interdit : le diagnostic n'aura pas ces lignes.
    }
  }

  /** Garde les refus du panier de cet envoi pour le diagnostic, à la place de ceux du précédent (DRV-644). */
  keepRefusals(unreached: readonly LastRefusal[]): void {
    try {
      if (unreached.length === 0) {
        this.storage?.removeItem(LAST_REFUSALS_KEY)
        return
      }
      const kept = unreached
        .slice(0, 100)
        .map(({ reason, stock, availability }) => ({ reason, stock, availability }))
      this.storage?.setItem(LAST_REFUSALS_KEY, JSON.stringify(kept))
    } catch {
      // Stockage plein ou interdit : le diagnostic n'aura pas ces lignes.
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
