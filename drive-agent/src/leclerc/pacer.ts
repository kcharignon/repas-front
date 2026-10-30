import { RetailerError } from '../retailers/errors'

/** Le message d'une erreur réseau par délai d'attente dépassé (ticket K) : Leclerc répond, mais trop lentement. */
const TIMEOUT_MESSAGE = 'Leclerc met trop de temps à répondre.'

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
/**
 * La cadence s'adapte à Leclerc (ticket L de l'audit du 2026-10-18, H12) : quand le site ralentit, la pause entre deux requêtes s'allonge, jamais
 * au-delà de `MAX_PAUSE_MS` (gigue comprise), puis revient à `PAUSE_MS` à mesure que les réponses redeviennent rapides. Jamais plus vite que la
 * cadence normale, jamais deux requêtes à la fois.
 */
export const MAX_PAUSE_MS = 3000
/** Une réponse (corps compris) plus lente que cela dit que Leclerc ralentit. */
export const SLOW_REPLY_MS = 3000
/** Ce qu'une réponse lente ajoute à la pause. */
export const SLOWDOWN_STEP_MS = 400
/** Ce que le refus de l'anti-robot (403, 429, page de défi) ou un délai d'attente dépassé ajoute à la pause. */
export const REFUSAL_STEP_MS = 800
/** Ce que chaque réponse rapide, sans refus, retire de la pause ajoutée. */
export const RECOVERY_STEP_MS = 200

/**
 * Les compteurs de la cadence : des NOMBRES, jamais une adresse, un en-tête ni un contenu. `requests` : les requêtes envoyées, reprises comprises ;
 * `errors` : sans réponse (réseau, délai d'attente) ou à réponse 4xx ou 5xx hors refus ; `blocks` : les refus 403, 429 et pages de défi ;
 * `timeouts` : les délais d'attente dépassés (déjà dans `errors`) ; `slow` : les réponses plus lentes que `SLOW_REPLY_MS` ; `peakPauseMs` : la plus
 * longue pause demandée entre deux requêtes.
 */
export interface RequestStats {
  requests: number
  errors: number
  blocks: number
  timeouts: number
  slow: number
  peakPauseMs: number
}

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
  /** Les refus de suite (403, 429) : deux arrêtent tout. */
  private blocks = 0
  private stopped = false
  /** Ce que la cadence ajoute à la pause normale parce que Leclerc ralentit (0 à `MAX_PAUSE_MS - PAUSE_MS`). */
  private extraMs = 0
  private readonly counters: RequestStats = {
    requests: 0,
    errors: 0,
    blocks: 0,
    timeouts: 0,
    slow: 0,
    peakPauseMs: 0,
  }

  constructor(fetchFn: FetchFn, deps: PacerDeps) {
    this.fetchFn = fetchFn
    this.deps = deps
  }

  /** Vrai après deux blocages de suite : l'agent n'insiste pas. */
  get isStopped(): boolean {
    return this.stopped
  }

  /** Les compteurs depuis la création du Pacer (une copie : des nombres seulement). */
  stats(): RequestStats {
    return { ...this.counters }
  }

  /** Leclerc ralentit : la pause s'allonge de `by`, sans dépasser `MAX_PAUSE_MS`. */
  private slowDown(by: number): void {
    this.extraMs = Math.min(MAX_PAUSE_MS - PAUSE_MS, this.extraMs + by)
  }

  /** Une réponse rapide : la pause allongée se raccourcit, jusqu'à la pause normale. */
  private recover(): void {
    this.extraMs = Math.max(0, this.extraMs - RECOVERY_STEP_MS)
  }

  /** Envoie une requête à son tour. Rend toute réponse qui n'est pas un blocage (404, 500… compris : à l'appelant de juger). */
  request(url: string, init: RequestInit): Promise<Reply> {
    const turn = this.queue.then(() => this.send(url, init))
    this.queue = turn.catch(() => undefined)
    return turn
  }

  /**
   * Une action de la page qui n'est pas une requête (suivre un lien, DRV-625), à son tour dans la file et à la même cadence : jamais en
   * même temps qu'une requête, jamais plus vite qu'elles. Elle attend toujours une pause entière, même la première de la page (`settle`),
   * pour que l'utilisateur lise ce qui se passe avant que la page change. Refusée une fois le site bloqué.
   */
  act<T>(task: () => T): Promise<T> {
    const turn = this.queue.then(async () => {
      if (this.stopped) throw new RetailerError('BLOCKED')
      await this.pause(true)
      try {
        return task()
      } finally {
        this.lastEnd = this.deps.now()
      }
    })
    this.queue = turn.catch(() => undefined)
    return turn
  }

  private async pause(settle = false): Promise<void> {
    if (this.lastEnd === null && !settle) return
    const gap = Math.min(
      MAX_PAUSE_MS,
      PAUSE_MS + this.extraMs + Math.floor(this.deps.random() * (JITTER_MS + 1)),
    )
    this.counters.peakPauseMs = Math.max(this.counters.peakPauseMs, gap)
    const wait = this.lastEnd === null ? gap : gap - (this.deps.now() - this.lastEnd)
    if (wait > 0) await this.deps.sleep(wait)
  }

  private async send(url: string, init: RequestInit): Promise<Reply> {
    assertSameHost(url)
    let networkRetried = false
    for (;;) {
      if (this.stopped) throw new RetailerError('BLOCKED')
      await this.pause()
      let reply: Reply
      this.counters.requests += 1
      const startedAt = this.deps.now()
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
        this.counters.errors += 1
        if (timedOut) {
          this.counters.timeouts += 1
          this.slowDown(REFUSAL_STEP_MS)
        }
        if (networkRetried) {
          throw new RetailerError(
            'NETWORK',
            null,
            timedOut ? 'REQUEST_TIMEOUT' : null,
            timedOut ? TIMEOUT_MESSAGE : undefined,
          )
        }
        networkRetried = true
        await this.deps.sleep(NETWORK_RETRY_MS)
        continue
      } finally {
        disarm?.()
      }
      this.lastEnd = this.deps.now()
      const challenge = isChallenge(reply.text)
      const refused = challenge || reply.status === 403 || reply.status === 429
      const slow = this.lastEnd - startedAt > SLOW_REPLY_MS
      if (slow) this.counters.slow += 1
      if (refused) {
        this.counters.blocks += 1
        this.slowDown(REFUSAL_STEP_MS)
      } else {
        if (reply.status >= 400) this.counters.errors += 1
        if (slow) this.slowDown(SLOWDOWN_STEP_MS)
        else this.recover()
      }
      // Une page de défi : l'utilisateur doit la passer lui-même, la retenter n'y changerait rien et ne ferait qu'insister.
      if (challenge) throw new RetailerError('BLOCKED', reply.status, 'CHALLENGE')
      if (!refused) {
        this.blocks = 0
        return reply
      }
      this.blocks += 1
      if (this.blocks >= MAX_BLOCKS) {
        this.stopped = true
        throw new RetailerError('BLOCKED', reply.status)
      }
    }
  }
}
