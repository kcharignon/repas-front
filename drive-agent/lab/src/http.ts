// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Requêtes vers l'hôte courant, toujours en série, avec la cadence du chantier ; arrêt à la première réponse 403 ou 429.
import { CADENCE_BASE_MS, CADENCE_JITTER_MS } from './config'

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface Reply {
  /** Code HTTP ; 0 si la requête n'a pas abouti (réseau coupé, requête refusée par le navigateur). */
  status: number
  text: string
  ms: number
  contentType: string | null
  error: string | null
  /** 403 ou 429 : l'anti-bot nous arrête, on ne réessaie pas. */
  blocked: boolean
}

export function isBlockStatus(status: number): boolean {
  return status === 403 || status === 429
}

/**
 * Page ou réponse de défi de l'anti-robot : elle renvoie vers `captcha-delivery.com`. Le simple mot « datadome » ne suffit pas,
 * il figure aussi dans la page d'erreur 404 de Leclerc.
 */
export function isChallengeText(text: string): boolean {
  return /captcha-delivery\.com/i.test(text)
}

/** Délai avant la requête suivante : 800 ms plus une gigue de 0 à 700 ms. */
export function pauseBetweenRequests(random: () => number): number {
  return CADENCE_BASE_MS + Math.floor(random() * (CADENCE_JITTER_MS + 1))
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function send(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  now: () => number,
): Promise<Reply> {
  const started = now()
  try {
    const response = await fetchFn(url, { credentials: 'same-origin', ...init })
    const text = await response.text()
    return {
      status: response.status,
      text,
      ms: now() - started,
      contentType: response.headers.get('content-type'),
      error: null,
      blocked: isBlockStatus(response.status) || isChallengeText(text),
    }
  } catch (error) {
    return {
      status: 0,
      text: '',
      ms: now() - started,
      contentType: null,
      error: describeError(error),
      blocked: false,
    }
  }
}

/** Lecture d'une page de l'hôte courant, avec les cookies de la session (envoyés par le navigateur, jamais lus ici). */
export function getPage(fetchFn: FetchFn, url: string, now: () => number): Promise<Reply> {
  return send(
    fetchFn,
    url,
    { method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } },
    now,
  )
}

/** En-têtes de l'ajout au panier : ceux que le site envoie lui-même (relevé DRV-008). Le navigateur ajoute les siens. */
export const FORM_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Accept: '*/*',
  'X-Requested-With': 'XMLHttpRequest',
}

/** Envoi d'un formulaire à l'hôte courant (panier). */
export function postForm(
  fetchFn: FetchFn,
  url: string,
  body: string,
  now: () => number,
): Promise<Reply> {
  return send(fetchFn, url, { method: 'POST', headers: FORM_HEADERS, body }, now)
}

export interface SeriesStep<R> {
  result: R
  /** Vrai : réponse 403 ou 429, la série s'arrête. */
  blocked: boolean
  /** Vrai : la requête n'a pas abouti, la série s'arrête. */
  failed?: boolean
}

export type StoppedBy = 'fin' | 'blocage' | 'erreur réseau' | 'annulation'

export interface SeriesOutcome<R> {
  results: R[]
  stoppedBy: StoppedBy
}

export interface SeriesDeps<R> {
  sleep: (ms: number) => Promise<void>
  random: () => number
  cancelled: () => boolean
  onResult?: (result: R, index: number) => void
}

/** Une requête à la fois, pause de cadence entre deux, arrêt au premier blocage, à la première erreur ou à l'annulation. */
export async function runSeries<T, R>(
  items: readonly T[],
  step: (item: T, index: number) => Promise<SeriesStep<R>>,
  deps: SeriesDeps<R>,
): Promise<SeriesOutcome<R>> {
  const results: R[] = []
  for (const [index, item] of items.entries()) {
    if (deps.cancelled()) return { results, stoppedBy: 'annulation' }
    const done = await step(item, index)
    results.push(done.result)
    deps.onResult?.(done.result, index)
    if (done.blocked) return { results, stoppedBy: 'blocage' }
    if (done.failed) return { results, stoppedBy: 'erreur réseau' }
    if (index < items.length - 1) await deps.sleep(pauseBetweenRequests(deps.random))
  }
  return { results, stoppedBy: 'fin' }
}
