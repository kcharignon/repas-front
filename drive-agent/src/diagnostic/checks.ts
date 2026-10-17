// Les contrôles du diagnostic (DRV-308) : tous en lecture seule, un seul appel au site (une recherche, à la cadence de l'adaptateur).
// Chaque contrôle rend `OK`, `KO` (avec le code d'erreur quand il y en a un) ou `NOT_TESTED`. Un détail ne contient que des nombres et
// des phrases fixes : jamais un cookie, un identifiant, une adresse ni un morceau de page.
import { LeclercError, type LeclercErrorCode, type RetailerAdapter } from '../leclerc'
import { S } from '../ui'
import type { StorageLike, WakeLockLike } from '../flow'

export const CHECK_IDS = [
  'agent',
  'page',
  'origin',
  'session',
  'wakeLock',
  'search',
  'content',
  'frame',
] as const
export type CheckId = (typeof CHECK_IDS)[number]

export interface CheckResult {
  id: CheckId
  status: 'OK' | 'KO' | 'NOT_TESTED'
  /** Le code d'erreur d'un contrôle en échec, quand le site ou la page en est la cause. */
  code?: LeclercErrorCode
  detail?: string
}

/** Le mot d'essai : courant, présent dans tous les rayons. */
export const TEST_TERM = 'sel'

export interface ChecksDeps {
  adapter: RetailerAdapter
  agentVersion: string
  storage: StorageLike | null
  wakeLock: WakeLockLike | null
  /** Vrai : l'origine de Repas est écrite dans l'agent ; faux : le marqueur n'est pas remplacé ; `null` : le pont n'en a pas besoin. */
  originReplaced: boolean | null
}

/** Ce que le rapport montre de la page : jamais le numéro de magasin entier ni un hôte qui ne soit pas de la forme connue. */
export interface PageFacts {
  host: string
  store: string
}

const HOST = /^(fd\d{1,3})-courses\.leclercdrive\.fr$/

/** `fd9` pour `fd9-courses.leclercdrive.fr`, un texte fixe pour tout autre hôte. */
export function hostFamily(host: string): string {
  return HOST.exec(host.toLowerCase())?.[1] ?? S.diagnostic.detail.hostOther
}

/** Les trois derniers chiffres au plus : un numéro court est caché en entier. */
export function storeTail(id: string): string {
  return id.length > 3 ? `…${id.slice(-3)}` : '…'
}

const ok = (id: CheckId, detail?: string): CheckResult => ({
  id,
  status: 'OK',
  ...(detail !== undefined && { detail }),
})
const ko = (id: CheckId, detail?: string, code?: LeclercErrorCode): CheckResult => ({
  id,
  status: 'KO',
  ...(code && { code }),
  ...(detail !== undefined && { detail }),
})
const skipped = (id: CheckId, detail: string): CheckResult => ({ id, status: 'NOT_TESTED', detail })

/** Une erreur de l'adaptateur a son code ; tout autre incident est un site qui ne répond plus comme prévu. */
const codeOf = (error: unknown): LeclercErrorCode =>
  error instanceof LeclercError ? error.code : 'CONTRACT_CHANGED'

/** Lit, écrit puis efface une clé d'essai : le stockage de session est-il utilisable ? */
function sessionWorks(storage: StorageLike | null): boolean {
  if (!storage) return false
  try {
    storage.setItem('repas:diag', '1')
    const read = storage.getItem('repas:diag') === '1'
    storage.removeItem('repas:diag')
    return read
  } catch {
    return false
  }
}

/** Le produit a-t-il tous les champs que l'agent attend ? */
const complete = (candidate: Awaited<ReturnType<RetailerAdapter['searchProducts']>>[number]) =>
  /^[0-9]{1,12}$/.test(candidate.id) &&
  candidate.label.trim() !== '' &&
  candidate.price !== null &&
  candidate.stock !== null

const D = S.diagnostic.detail

/**
 * Joue les contrôles dans l'ordre et rend chaque résultat dès qu'il est connu (`onResult`), pour que l'écran avance. Aucune exception
 * n'en sort. Le site n'est interrogé qu'une fois ; après un blocage ou une page non prise en charge, il ne l'est pas du tout.
 */
export async function runChecks(
  deps: ChecksDeps,
  onResult: (result: CheckResult) => void,
): Promise<{ results: CheckResult[]; page: PageFacts | null }> {
  const results: CheckResult[] = []
  const push = async (result: CheckResult) => {
    results.push(result)
    onResult(result)
    // Laisse l'écran se peindre avant le contrôle suivant.
    await Promise.resolve()
  }

  await push(ok('agent', D.version(deps.agentVersion)))

  let page: PageFacts | null = null
  try {
    const store = deps.adapter.readStore()
    page = { host: hostFamily(store.host), store: storeTail(store.id) }
    await push(ok('page', D.page(page.host, page.store)))
  } catch (error) {
    await push(ko('page', undefined, codeOf(error)))
  }

  await push(
    deps.originReplaced === null
      ? skipped('origin', D.originBridge)
      : deps.originReplaced
        ? ok('origin', D.originOk)
        : ko('origin', D.originMissing, 'UNSUPPORTED_PAGE'),
  )
  await push(sessionWorks(deps.storage) ? ok('session', D.sessionOk) : ko('session', D.sessionKo))
  await push(deps.wakeLock ? ok('wakeLock', D.wakeLockOk) : ko('wakeLock', D.wakeLockKo))

  if (page === null) {
    await push(skipped('search', D.pageSkipped))
    await push(skipped('content', D.searchFailed))
  } else {
    let found: Awaited<ReturnType<RetailerAdapter['searchProducts']>> | null = null
    try {
      found = await deps.adapter.searchProducts(TEST_TERM)
    } catch (error) {
      await push(ko('search', undefined, codeOf(error)))
    }
    if (found === null) {
      await push(skipped('content', D.searchFailed))
    } else {
      const read = found.length
      const whole = found.filter(complete).length
      await push(
        read === 0
          ? ko('search', D.searchEmpty(TEST_TERM), 'CONTRACT_CHANGED')
          : whole * 2 >= read
            ? ok('search', D.searchOk(TEST_TERM, read, whole))
            : ko('search', D.searchIncomplete(TEST_TERM, read, whole), 'CONTRACT_CHANGED'),
      )
      const known = found.filter((candidate) => candidate.content !== null).length
      await push(
        read === 0
          ? skipped('content', D.searchFailed)
          : known * 2 >= read
            ? ok('content', D.contentOk(known, read))
            : ko('content', D.contentKo(known, read), 'CONTRACT_CHANGED'),
      )
    }
  }

  await push(skipped('frame', D.frameSkipped))
  return { results, page }
}
