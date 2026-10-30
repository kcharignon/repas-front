import {
  LIMITS,
  LINE_STATUSES,
  RETAILER_IDS,
  retailerOfHost,
  STORES,
  UNIT_SLUG,
} from '@drive-protocol'
import type {
  LineStatus,
  PlanMessage,
  ResultMessage,
  RetailerId,
  SetupResultMessage,
} from '@drive-protocol'

import { DEFAULT_RETAILER } from '../retailers'

/** La clé du brouillon de passage dans `localStorage`. */
export const DRAFT_KEY = 'repas.drive.run'

/** Un passage non terminé est oublié au bout de 24 h (comme côté application). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

/** Un passage lancé « dans le futur » (horloge déréglée) n'est pas cru au-delà de cette tolérance. */
const CLOCK_SKEW_MS = 5 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Un slug d'ingrédient, comme le protocole l'écrit ; l'identifiant d'un produit a la forme de SON enseigne (`STORES[retailer].productId`). */
const SLUG = /^[a-z0-9-]{1,100}$/

/** Le drive d'un brouillon écrit avant les drives multiples (DRV-710) : le seul qui existait. */
const LEGACY_RETAILER: RetailerId = DEFAULT_RETAILER.id

/**
 * Ce que le plan envoyé annonçait d'une ligne (DRV-614) : de quoi recouper le résultat de l'agent avec ce qu'on lui a demandé, même
 * après un rechargement de la page. `status` est celui du message envoyé (une ligne que l'utilisateur a remplacée y est `NEW`),
 * `products` les identifiants des produits acceptés, dans l'ordre de priorité.
 */
export interface SentLine {
  ingredientSlug: string
  status: LineStatus
  products: string[]
  /**
   * Le slug de l'unité de la ligne envoyée (`needed.unitSlug`, DRV-652), absent quand le plan n'en portait pas (agent ou back plus ancien). Une contenance
   * que le résultat rend pour cette ligne n'est retenue que dans cette unité (`restrictToPlan`) : la page de l'enseigne peut poster un faux résultat.
   */
  unitSlug?: string
}

/**
 * Le passage en cours : de quoi rattacher le résultat à la bonne liste, même après un rechargement de la page (nouvelle version
 * du service worker), et de quoi le recouper avec le plan envoyé. Ni magasin ni jeton : l'identifiant du passage et de la liste, la
 * date, et pour chaque ligne le slug de l'ingrédient, son statut et les identifiants de ses produits (le contenu de la liste de
 * courses, que la lecture hors ligne garde déjà dans ce navigateur tant que la liste est la liste en cours).
 */
export interface RunDraft {
  runId: string
  listId: string
  /**
   * Le drive du passage (DRV-710) : celui du plan envoyé. Le résultat n'est rattaché qu'à ce drive-là, et ses choix sont enregistrés pour lui. Un brouillon
   * écrit avant les drives multiples n'a pas la clé : c'est le seul drive d'alors (`DEFAULT_RETAILER`).
   */
  retailer: RetailerId
  /** Date ISO de l'envoi du plan. */
  startedAt: string
  /** Les lignes du plan envoyé ; absent d'un brouillon écrit par une version plus ancienne (l'écran du retour relit alors le plan). */
  lines?: SentLine[]
}

/** Les lignes d'un plan validé, telles que le brouillon les garde. */
export function sentLinesOf(plan: PlanMessage): SentLine[] {
  return plan.lines.map((line) => ({
    ingredientSlug: line.ingredientSlug,
    status: line.status,
    products: (line.products ?? []).map((product) => product.id),
    ...(line.needed?.unitSlug !== undefined && { unitSlug: line.needed.unitSlug }),
  }))
}

/** Un résultat de l'agent : le passage (`result`) ou la lecture du magasin (`setup-result`). */
export type DriveResult = ResultMessage | SetupResultMessage

/** Où garder le brouillon : `localStorage` si le navigateur le permet, sinon la mémoire de la page (il ne survit alors pas). */
export interface DraftStorage {
  get(): string | null
  set(value: string): void
  remove(): void
}

export function browserDraftStorage(win: { localStorage?: Storage }): DraftStorage {
  let memory: string | null = null
  const storage = (): Storage | null => {
    try {
      return win.localStorage ?? null
    } catch {
      return null
    }
  }

  return {
    get() {
      try {
        return storage()?.getItem(DRAFT_KEY) ?? memory
      } catch {
        return memory
      }
    },
    set(value) {
      try {
        storage()?.setItem(DRAFT_KEY, value)
        memory = storage() === null ? value : null
      } catch {
        // Stockage plein ou refusé : le brouillon reste en mémoire pour cette page
        memory = value
      }
    },
    remove() {
      memory = null
      try {
        storage()?.removeItem(DRAFT_KEY)
      } catch {
        // Rien à retirer
      }
    },
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Les lignes d'un brouillon : `null` si une seule n'a pas exactement la forme attendue. */
function parseLines(value: unknown, retailer: RetailerId): SentLine[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.lines) return null
  const lines: SentLine[] = []
  const slugs = new Set<string>()
  for (const item of value as unknown[]) {
    // `unitSlug` (DRV-652) est facultatif : un brouillon écrit par une version d'avant n'en a pas
    const shape = isRecord(item) ? Object.keys(item).sort().join() : ''
    if (
      !isRecord(item) ||
      (shape !== 'ingredientSlug,products,status' &&
        shape !== 'ingredientSlug,products,status,unitSlug')
    )
      return null
    const { ingredientSlug, status, products, unitSlug } = item
    if (unitSlug !== undefined && (typeof unitSlug !== 'string' || !UNIT_SLUG.test(unitSlug)))
      return null
    if (typeof ingredientSlug !== 'string' || !SLUG.test(ingredientSlug)) return null
    if (slugs.has(ingredientSlug)) return null
    if (!(LINE_STATUSES as readonly unknown[]).includes(status)) return null
    if (
      !Array.isArray(products) ||
      products.length > LIMITS.products ||
      !(products as unknown[]).every(
        (id) => typeof id === 'string' && STORES[retailer].productId.test(id),
      )
    )
      return null
    slugs.add(ingredientSlug)
    lines.push({
      ingredientSlug,
      status: status as LineStatus,
      products: products as string[],
      ...(typeof unitSlug === 'string' && { unitSlug }),
    })
  }

  return lines
}

/** Lit un brouillon : une valeur qui n'a pas exactement la forme attendue est ignorée. */
function parse(raw: string): RunDraft | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  // `lines` et `retailer` sont facultatifs : un brouillon d'une version plus ancienne n'a pas `lines` (DRV-614), ni `retailer` (DRV-710)
  const keys = Object.keys(value)
  const required = ['listId', 'runId', 'startedAt']
  if (
    !required.every((key) => keys.includes(key)) ||
    keys.some((key) => ![...required, 'lines', 'retailer'].includes(key))
  )
    return null
  const { runId, listId, startedAt } = value
  if (typeof runId !== 'string' || !UUID.test(runId)) return null
  if (typeof listId !== 'string' || listId === '' || listId.length > 100) return null
  if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) return null
  const retailer = 'retailer' in value ? value.retailer : LEGACY_RETAILER
  if (!(RETAILER_IDS as readonly unknown[]).includes(retailer)) return null
  const drive = retailer as RetailerId
  if (!('lines' in value)) return { runId, listId, retailer: drive, startedAt }
  const lines = parseLines(value.lines, drive)

  return lines === null ? null : { runId, listId, retailer: drive, startedAt, lines }
}

/**
 * Ce résultat est-il celui du passage du brouillon ? Il faut le même `runId` ET le même drive (DRV-710). Un `result` ne dit pas son enseigne, mais le
 * magasin qu'il porte a la forme de celui de SON enseigne (un numéro, un identifiant à tirets… : `STORES[…].id`) : un résultat
 * dont le magasin n'a pas la forme du drive du brouillon est celui d'un autre envoi, il est ignoré comme un autre `runId` (rien n'est enregistré). Un
 * résultat sans magasin (arrêt avant de le connaître) ne dit rien de plus : seul le `runId` compte.
 */
export function isFromDraft(result: DriveResult, draft: RunDraft): boolean {
  if (result.runId !== draft.runId) return false
  if (result.type === 'setup-result') return retailerOfHost(result.store.host) === draft.retailer

  return result.store === undefined || STORES[draft.retailer].id.test(result.store.id)
}

export interface DraftStore {
  /** Le brouillon, s'il existe, a la bonne forme et a moins de 24 h ; sinon il est effacé. */
  load(): RunDraft | null
  save(draft: RunDraft): void
  clear(): void
  /**
   * Le résultat est-il celui du passage en cours ? Sinon il est périmé : un autre appareil, un autre passage, un brouillon expiré, ou un résultat
   * d'un autre drive que celui du brouillon (`isFromDraft`).
   */
  matches(result: DriveResult): boolean
}

export function createDraftStore(storage: DraftStorage, now: () => Date): DraftStore {
  const load = (): RunDraft | null => {
    const raw = storage.get()
    if (raw === null) return null
    const draft = parse(raw)
    const age = draft === null ? 0 : now().getTime() - Date.parse(draft.startedAt)
    if (draft === null || age > DRAFT_TTL_MS || age < -CLOCK_SKEW_MS) {
      storage.remove()

      return null
    }

    return draft
  }

  return {
    load,
    save: (draft) => storage.set(JSON.stringify(draft)),
    clear: () => storage.remove(),
    matches: (result) => {
      const draft = load()

      return draft !== null && isFromDraft(result, draft)
    },
  }
}
