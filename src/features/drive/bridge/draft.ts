import type { ResultMessage, SetupResultMessage } from '@drive-protocol'

/** La clé du brouillon de passage dans `localStorage`. */
export const DRAFT_KEY = 'repas.drive.run'

/** Un passage non terminé est oublié au bout de 24 h (comme côté application). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

/** Un passage lancé « dans le futur » (horloge déréglée) n'est pas cru au-delà de cette tolérance. */
const CLOCK_SKEW_MS = 5 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Le passage en cours : de quoi rattacher le résultat à la bonne liste, même après un rechargement de la page (nouvelle version
 * du service worker). Aucune donnée personnelle : ni ingrédient, ni magasin, ni jeton.
 */
export interface RunDraft {
  runId: string
  listId: string
  /** Date ISO de l'envoi du plan. */
  startedAt: string
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

/** Lit un brouillon : une valeur qui n'a pas exactement la forme attendue est ignorée. */
function parse(raw: string): RunDraft | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const keys = Object.keys(value).sort()
  if (keys.join() !== 'listId,runId,startedAt') return null
  const { runId, listId, startedAt } = value as Record<string, unknown>
  if (typeof runId !== 'string' || !UUID.test(runId)) return null
  if (typeof listId !== 'string' || listId === '' || listId.length > 100) return null
  if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) return null

  return { runId, listId, startedAt }
}

export interface DraftStore {
  /** Le brouillon, s'il existe, a la bonne forme et a moins de 24 h ; sinon il est effacé. */
  load(): RunDraft | null
  save(draft: RunDraft): void
  clear(): void
  /** Le résultat est-il celui du passage en cours ? Sinon il est périmé : un autre appareil, un autre passage, un brouillon expiré. */
  matches(result: { runId: string }): boolean
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
    matches: (result) => load()?.runId === result.runId,
  }
}
