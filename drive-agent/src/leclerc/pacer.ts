import { LeclercError } from './errors'

/** Attente minimale entre deux requêtes (architecture.md § 8). */
export const PAUSE_MS = 800
/** Gigue aléatoire ajoutée à l'attente : de 0 à 700 ms. */
export const JITTER_MS = 700
/** Délai avant l'unique reprise après une erreur réseau. */
export const NETWORK_RETRY_MS = 2000
/** Nombre de réponses 403 ou 429 de suite qui arrête tout. */
export const MAX_BLOCKS = 2
/**
 * Le délai d'attente de chaque requête (ticket K de l'audit du 2026-10-18, H15) : réponse et corps compris. Au-delà, la requête est interrompue et
 * traitée comme une erreur réseau (une reprise après 2 s, puis `NETWORK` de cause `REQUEST_TIMEOUT`) : sans lui, une requête que le site retient
 * laisserait l'écran de progression figé, sans message, jusqu'à l'abandon. Les réponses mesurées durent de 0,1 à 1,9 s.
 */
export const REQUEST_TIMEOUT_MS = 20_000

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

/** Ce que l'adaptateur retient d'une réponse : jamais la valeur d'un en-tête, jamais un cookie. */
export interface Reply {
  status: number
  text: string
  /** L'adresse finale (après redirection) et si la réponse en vient d'une. */
  url: string
  redirected: boolean
  /** Les NOMS des en-têtes de la réponse (jamais leurs valeurs : les cookies y sont), pour le diagnostic. */
  headers: string[]
  /** La valeur de `Content-Type`, dont le diagnostic ne garde que le type de média. */
  contentType: string | null
}

/** Les noms des en-têtes d'une réponse (vide si elle n'en dit rien : un faux `fetch` de test). */
function headerNamesOf(headers: Headers | undefined): string[] {
  const names: string[] = []
  try {
    headers?.forEach((_value, name) => names.push(name))
  } catch {
    return []
  }
  return names
}

export interface PacerDeps {
  sleep: (ms: number) => Promise<void>
  random: () => number
  now: () => number
  /**
   * Un délai d'attente : appelle `fire` après `ms` millisecondes, et rend de quoi l'annuler. L'agent le fournit toujours (`browserDeps`) ; sans lui
   * (certains tests) aucune requête n'expire et aucun signal d'interruption n'est posé.
   */
  timer?: (ms: number, fire: () => void) => () => void
}

/**
 * Page ou réponse de défi de l'anti-robot : elle renvoie vers `captcha-delivery.com`. Le simple mot « datadome » ne suffit pas, il
 * figure aussi dans la page d'erreur 404 de Leclerc.
 */
export function isChallenge(text: string): boolean {
  return /captcha-delivery\.com/i.test(text)
}

/**
 * Une adresse de l'hôte courant : un chemin qui commence par un seul `/`, jamais `//hôte` ni `https://…`. Un navigateur lit « \ » comme
 * « / » et ignore les tabulations et retours à la ligne d'une adresse : `/\hôte` et `/<tabulation>/hôte` sont donc refusés aussi.
 */
function assertSameHost(url: string): void {
  const seen = url.replace(/[\t\n\r]/g, '')
  if (!url.startsWith('/') || !/^\/(?![/\\])/.test(seen)) {
    throw new Error('Une requête ne part que vers l’hôte de la page.')
  }
}

/**
 * Les requêtes vers le site, une à la fois et à la cadence du chantier :
 *  - jamais deux en parallèle (file d'attente : les écritures parallèles déclenchent DataDome) ;
 *  - au moins 800 ms entre la fin d'une requête et le début de la suivante, plus une gigue de 0 à 700 ms ;
 *  - une réponse 403 ou 429 (ou une page de défi) est retentée une fois après la pause ; une seconde de suite arrête tout : l'erreur
 *    `BLOCKED` est levée et plus aucune requête ne part ;
 *  - une page de défi de l'anti-robot lève `BLOCKED` (cause `CHALLENGE`) dès la première réponse, sans reprise, et n'arrête pas le Pacer : c'est
 *    à l'utilisateur de faire la vérification, puis à l'appelant de recommencer (ticket K) ;
 *  - une erreur réseau est retentée une fois, après 2 s ; la seconde lève `NETWORK` ;
 *  - une requête qui ne répond pas en `REQUEST_TIMEOUT_MS` est interrompue et traitée de même (`NETWORK`, cause `REQUEST_TIMEOUT`).
 * Seul l'hôte de la page est joint (chemins relatifs), avec les cookies de la session que le navigateur envoie lui-même.
 */
export class Pacer {
  private readonly fetchFn: FetchFn
  private readonly deps: PacerDeps
  private queue: Promise<unknown> = Promise.resolve()
  private lastEnd: number | null = null
  private blocks = 0
  private stopped = false

  constructor(fetchFn: FetchFn, deps: PacerDeps) {
    this.fetchFn = fetchFn
    this.deps = deps
  }

  /** Vrai après deux blocages de suite : l'agent n'insiste pas. */
  get isStopped(): boolean {
    return this.stopped
  }

  /** Envoie une requête à son tour. Rend toute réponse qui n'est pas un blocage (404, 500… compris : à l'appelant de juger). */
  request(url: string, init: RequestInit): Promise<Reply> {
    const turn = this.queue.then(() => this.send(url, init))
    this.queue = turn.catch(() => undefined)
    return turn
  }

  private async pause(): Promise<void> {
    if (this.lastEnd === null) return
    const gap = PAUSE_MS + Math.floor(this.deps.random() * (JITTER_MS + 1))
    const wait = gap - (this.deps.now() - this.lastEnd)
    if (wait > 0) await this.deps.sleep(wait)
  }

  private async send(url: string, init: RequestInit): Promise<Reply> {
    assertSameHost(url)
    let networkRetried = false
    for (;;) {
      if (this.stopped) throw new LeclercError('BLOCKED')
      await this.pause()
      let reply: Reply
      // Le délai d'attente de cette tentative : il interrompt le `fetch` (et la lecture du corps) et se désarme dès que la réponse est là.
      let timedOut = false
      const controller = this.deps.timer ? new AbortController() : null
      const disarm = this.deps.timer?.(REQUEST_TIMEOUT_MS, () => {
        timedOut = true
        controller?.abort()
      })
      try {
        const response = await this.fetchFn(url, {
          credentials: 'same-origin',
          ...init,
          ...(controller && { signal: controller.signal }),
        })
        reply = {
          status: response.status,
          text: await response.text(),
          url: response.url,
          redirected: response.redirected,
          headers: headerNamesOf(response.headers),
          contentType: response.headers?.get?.('content-type') ?? null,
        }
      } catch {
        this.lastEnd = this.deps.now()
        if (networkRetried) {
          throw new LeclercError('NETWORK', null, timedOut ? 'REQUEST_TIMEOUT' : null)
        }
        networkRetried = true
        await this.deps.sleep(NETWORK_RETRY_MS)
        continue
      } finally {
        disarm?.()
      }
      this.lastEnd = this.deps.now()
      // Une page de défi : l'utilisateur doit la passer lui-même, la retenter n'y changerait rien et ne ferait qu'insister.
      if (isChallenge(reply.text)) throw new LeclercError('BLOCKED', reply.status, 'CHALLENGE')
      if (reply.status !== 403 && reply.status !== 429) {
        this.blocks = 0
        return reply
      }
      this.blocks += 1
      if (this.blocks >= MAX_BLOCKS) {
        this.stopped = true
        throw new LeclercError('BLOCKED', reply.status)
      }
    }
  }
}
