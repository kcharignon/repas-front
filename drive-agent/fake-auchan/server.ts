// Le faux site d'Auchan (DRV-717) : un serveur minimal, sans dépendance, qui imite la STRUCTURE du site mesurée le 2026-10-30 (rapports DRV-712 à 714) avec des
// données inventées, pour jouer l'agent de bout en bout sans jamais contacter l'enseigne. Voir README.md.
//
//   - Il n'écoute que sur 127.0.0.1 et refuse toute connexion qui ne vient pas de la boucle locale ou qui vise un autre nom d'hôte que ceux de sa liste
//     (`localhost`, `127.0.0.1`, `www.auchan.fr`) : il ne sort jamais du poste.
//   - `GET /journey` n'est servi qu'à une requête XHR (`X-Requested-With: XMLHttpRequest`) : tout écart reçoit un `400` consigné dans `rejected`.
//   - Le panier (`GET /cart`, `POST /cart/update`, DRV-725) est dans `cart.ts` : forme mesurée (JSON, `X-Requested-With`, aucun jeton d'en-tête, `cartId`,
//     quantité absolue) et pannes pilotables.
//   - Il surveille la cadence (jamais deux requêtes de l'agent en parallèle, `MIN_GAP_MS` au moins entre deux) et la consigne dans `violations()`.
//   - Une adresse inconnue est un VRAI `404` (B-6, mesuré), avec la page « Erreur 404 ».
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { createFakeCart, type CartBehavior } from './cart.ts'
import {
  cartPage,
  challengePage,
  CONSENT_ID,
  coursesPage,
  journeyBody,
  notFoundPage,
  STORE,
  VISITOR_CART_ID,
  type Bar,
  type EntryForm,
  type PageOptions,
  type SessionKind,
} from './pages.ts'

import { landingPage, searchReply } from './search.ts'

export { STORE } from './pages.ts'

/** L'hôte du faux site : celui de l'enseigne (`www`, jamais `compte.`, où aucun code de Repas n'est injecté). */
export const SITE_HOST = STORE.host

/**
 * La cadence minimale entre deux requêtes de l'agent (la pause de départ d'Auchan, NON MESURÉE au-delà de 2 s : DRV-715 § 2 point 7) : écrite ici, pas lue
 * dans l'agent, pour que le faux site juge l'agent et non l'inverse.
 */
export const MIN_GAP_MS = 2000
/** Marge de mesure : l'horloge du serveur et celle de la page ne se lisent pas au même instant. */
const TOLERANCE_MS = 5

/** Ce que `GET /journey` répond : la forme mesurée, ou une des formes changées que l'adaptateur doit savoir dire. */
export type JourneyForm =
  | 'ok'
  | 'not-json'
  | 'no-contexts'
  | 'no-seller'
  | 'bad-id'
  | 'not-found'
  | 'server-error'
  | 'forbidden'
  | 'challenge'
  | 'login-redirect'
  /** Le site retient la requête : aucune réponse, jusqu'à ce que le client abandonne. */
  | 'hang'

export interface Behavior {
  /** Délai ajouté à chaque réponse de l'API (le parcours, la recherche, le panier). */
  latencyMs: number
  /** Le magasin du parcours : un drive choisi, aucun contexte de courses, ou un contexte de courses nul (A-5 : après une déconnexion). */
  store: 'chosen' | 'none' | 'null-context'
  /** L'identifiant que le parcours donne pour le drive (par défaut `STORE.id`) : pour essayer un autre magasin que celui du plan. */
  storeId: string | null
  /** Ce que la barre du magasin dit à l'écran ; `null` : elle suit `store`. Pour essayer une page qui n'est pas d'accord avec le parcours. */
  bar: Bar | null
  /** La connexion que les pages annoncent (`sessionStorage.tracking_authenticated`). */
  session: SessionKind
  /** « Commencer mes achats » sur la page du panier vide. */
  entry: EntryForm
  /** Le cookie `datadome` est posé, lisible par la page (D-1 : le vrai est `Secure`, lisible ou non n'est pas relevé). */
  datadome: boolean
  /** La réponse de `GET /journey`. */
  journey: JourneyForm
}

export const DEFAULT_BEHAVIOR: Behavior = {
  latencyMs: 0,
  store: 'chosen',
  storeId: null,
  bar: null,
  session: 'member',
  entry: 'button',
  datadome: true,
  journey: 'ok',
}

export type RequestKind = 'journey' | 'search' | 'cart' | 'page' | 'control' | 'other'

export interface FakeRequest {
  kind: RequestKind
  method: string
  /** Le nom d'hôte demandé (`Host`, sans le port) : `www.auchan.fr` (le faux site) ou `localhost` (le pilotage). */
  host: string
  path: string
  /** Début et fin de la réponse, en millisecondes depuis le démarrage du processus. */
  startedAt: number
  endedAt: number
  status: number
  /** Pourquoi une requête de l'API a été refusée : en-tête manquant, `cartId` inconnu… */
  rejected?: string
  /** Le mot cherché (recherche) ou le corps décodé (écriture du panier). */
  detail?: string
}

export interface Violation {
  kind: 'parallel' | 'too-fast'
  /** Rang (à partir de 1) de la requête fautive parmi les requêtes de l'agent. */
  request: number
  gapMs?: number
}

export interface FakeAuchan {
  readonly port: number
  /** `http://www.auchan.fr:<port>` : l'origine des pages du faux site (le navigateur de test résout ce nom vers 127.0.0.1). */
  readonly site: string
  /** `http://localhost:<port>` : l'origine du pilotage. */
  readonly control: string
  behavior(): Behavior
  setBehavior(patch: Partial<Behavior>): void
  /** Remet le faux site à neuf : panier vide, journal et violations effacés, cadence repartie de zéro, comportement par défaut. */
  reset(): void
  /** Le panier : identifiant de produit vers quantité. */
  cart(): Record<string, number>
  /** Ce que le panier fait (DRV-725, `cart.ts`) : écriture ignorée, quantité fausse, défi, panne… */
  cartBehavior(): CartBehavior
  setCartBehavior(patch: Partial<CartBehavior>): void
  /** Pose une ligne dans le panier avant le passage (un panier qui n'est pas vide au départ). */
  seedCart(productId: string, quantity: number): void
  requests(): FakeRequest[]
  /** Les requêtes de l'agent (le parcours, la recherche, le panier), dans l'ordre. */
  paced(): FakeRequest[]
  /** Les écritures du panier (`POST /cart/update`) : l'agent n'en fait AUCUNE tant que le magasin n'est pas lu. */
  writes(): FakeRequest[]
  violations(): Violation[]
  close(): Promise<void>
}

export interface FakeOptions {
  /** 0 (par défaut) : un port libre. */
  port?: number
  /** Noms d'hôte à accepter en plus de `www.auchan.fr`. */
  hosts?: string[]
  behavior?: Partial<Behavior>
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Vrai pour une connexion venue de la boucle locale. */
export function isLoopback(address: string | undefined): boolean {
  return (
    address === '::1' ||
    address === '127.0.0.1' ||
    /^(?:::ffff:)?127\.\d+\.\d+\.\d+$/.test(address ?? '')
  )
}

/** Le nom d'hôte d'un en-tête `Host` (sans port) ; `[::1]` garde ses crochets. */
export function hostnameOf(header: string | undefined): string {
  const host = (header ?? '').toLowerCase()
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : (host.split(':')[0] ?? '')
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const now = (): number => performance.now()

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('corps trop gros')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Écrit la réponse et attend qu'elle soit partie (c'est là que la cadence se compte). */
function send(
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string | string[]> = {},
): Promise<void> {
  return new Promise((resolve) => {
    res.writeHead(status, { 'Cache-Control': 'no-store', ...headers })
    res.end(body, () => resolve())
  })
}

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'X-DataDome': 'protected' }
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-DataDome': 'protected',
}

export async function startFakeAuchan(options: FakeOptions = {}): Promise<FakeAuchan> {
  const hosts = new Set([SITE_HOST, ...(options.hosts ?? [])])
  let behavior: Behavior = { ...DEFAULT_BEHAVIOR, ...options.behavior }
  const log: FakeRequest[] = []
  const violations: Violation[] = []
  let inFlight = 0
  let lastPacedEnd: number | null = null
  let pacedCount = 0

  // Le panier (DRV-725) : son état et ses pannes sont dans `cart.ts` ; le serveur lui prête sa cadence et ses réponses.
  const cartSim = createFakeCart({
    paced: (entry, serve) => paced(entry, serve),
    send: (res, status, body, headers) => send(res, status, body, headers),
    readBody: (req) => readBody(req),
    session: () => behavior.session,
  })

  function reset(): void {
    behavior = { ...DEFAULT_BEHAVIOR }
    cartSim.reset()
    log.length = 0
    violations.length = 0
    lastPacedEnd = null
    pacedCount = 0
  }

  /** Les options des pages : la barre suit le magasin du parcours, sauf si le test dit autrement. */
  function pageOptions(): PageOptions {
    const bar: Bar = behavior.bar ?? (behavior.store === 'chosen' ? 'withdrawal' : 'choose')
    return { bar, session: behavior.session, entry: behavior.entry }
  }

  /** Les cookies que le site pose : ceux de la session (`HttpOnly`), `lark-cart` pour un visiteur seulement, `lark-consentId`, `datadome` (D-1, C-3). */
  function sessionCookies(): string[] {
    const cookies = [
      'connect.sid=test-session; Path=/; HttpOnly',
      `lark-consentId=${CONSENT_ID}; Path=/`,
    ]
    if (behavior.session === 'member') cookies.push('lark-cart=; Path=/; Max-Age=0')
    else cookies.push(`lark-cart=${VISITOR_CART_ID}; Path=/`)
    if (behavior.datadome) cookies.push('datadome=fake-datadome-value; Path=/')
    return cookies
  }

  /** Une requête de l'agent à cadencer : contrôle de la cadence, latence. */
  async function paced(entry: FakeRequest, serve: () => Promise<void>): Promise<void> {
    const rank = ++pacedCount
    const gap = lastPacedEnd === null ? null : entry.startedAt - lastPacedEnd
    if (inFlight > 0) violations.push({ kind: 'parallel', request: rank })
    else if (gap !== null && gap < MIN_GAP_MS - TOLERANCE_MS) {
      violations.push({ kind: 'too-fast', request: rank, gapMs: Math.round(gap) })
    }
    inFlight += 1
    try {
      if (behavior.latencyMs > 0) await sleep(behavior.latencyMs)
      await serve()
    } finally {
      inFlight -= 1
      entry.endedAt = now()
      lastPacedEnd = entry.endedAt
    }
  }

  function reject(entry: FakeRequest, res: ServerResponse, why: string): Promise<void> {
    entry.rejected = why
    entry.status = 400
    return send(res, 400, JSON.stringify({ error: 'requête inattendue' }), JSON_HEADERS)
  }

  async function journey(
    entry: FakeRequest,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    await paced(entry, async () => {
      if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
        return reject(entry, res, 'X-Requested-With manquant')
      }
      entry.status = 200
      switch (behavior.journey) {
        case 'not-json':
          return send(res, 200, '<html><body>Pas du JSON</body></html>', HTML)
        case 'no-contexts':
          return send(res, 200, JSON.stringify({ id: 'x', metadata: {} }), JSON_HEADERS)
        case 'no-seller':
          return send(
            res,
            200,
            JSON.stringify({
              activeContexts: [{ type: 'GROCERY', context: { channels: ['PICK_UP'] } }],
            }),
            JSON_HEADERS,
          )
        case 'bad-id':
          return send(res, 200, JSON.stringify(journeyBody('chosen', 'pas-un-uuid')), JSON_HEADERS)
        case 'not-found':
          entry.status = 404
          return send(res, 404, notFoundPage(), HTML)
        case 'server-error':
          entry.status = 503
          return send(res, 503, 'Service indisponible', { 'Content-Type': 'text/plain' })
        case 'forbidden':
          entry.status = 403
          return send(res, 403, 'Accès refusé', { 'Content-Type': 'text/plain' })
        case 'challenge':
          return send(res, 200, challengePage(), HTML)
        case 'login-redirect':
          entry.status = 302
          return send(res, 302, '', { Location: '/auth/realms/test/protocol/openid-connect/auth' })
        case 'hang':
          entry.status = 0
          return new Promise<void>((resolve) => {
            if (res.destroyed || res.writableEnded) return resolve()
            res.once('close', () => resolve())
          })
        default:
          return send(
            res,
            200,
            JSON.stringify(journeyBody(behavior.store, behavior.storeId ?? STORE.id)),
            JSON_HEADERS,
          )
      }
    })
  }

  async function search(entry: FakeRequest, url: URL, res: ServerResponse): Promise<void> {
    const text = url.searchParams.get('text') ?? ''
    entry.detail = text
    await paced(entry, () => {
      // La page (ou la redirection) vient de `search.ts` (DRV-724) : des pages de résultats synthétiques, pilotées par le mot cherché.
      const found = searchReply(text, pageOptions())
      entry.status = found.status
      return send(res, found.status, found.body, {
        ...HTML,
        ...(found.location !== undefined && { Location: found.location }),
        'Set-Cookie': sessionCookies(),
      })
    })
  }

  async function route(
    entry: FakeRequest,
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    loopbackHost: boolean,
  ): Promise<void> {
    const path = url.pathname
    if (path.startsWith('/__fake/')) {
      entry.kind = 'control'
      if (loopbackHost) return control(entry, req, res, path)
      entry.status = 404
      return send(res, 404, 'inconnu')
    }
    const get = req.method === 'GET'
    if (path === '/journey' && get) {
      entry.kind = 'journey'
      return journey(entry, req, res)
    }
    if (cartSim.handles(req.method ?? 'GET', path)) return cartSim.handle(entry, req, res, url)
    if (path === '/recherche' && get) {
      entry.kind = 'search'
      return search(entry, url, res)
    }
    entry.kind = 'page'
    if (path === '/auth/realms/test/protocol/openid-connect/auth') {
      entry.status = 200
      return send(
        res,
        200,
        '<!doctype html><title>Connexion (faux site de test)</title><p>Connexion</p>',
        HTML,
      )
    }
    if ((path === '/courses' || path === '/') && get) {
      entry.status = 200
      return send(res, 200, coursesPage(pageOptions()), { ...HTML, 'Set-Cookie': sessionCookies() })
    }
    if (path === '/checkout/cart' && get) {
      entry.status = 200
      return send(res, 200, cartPage(pageOptions()), { ...HTML, 'Set-Cookie': sessionCookies() })
    }
    // Les pages où mènent les termes redirigés de la recherche (une fiche de produit, un rayon).
    const landing = get ? landingPage(path, pageOptions()) : null
    if (landing !== null) {
      entry.status = 200
      return send(res, 200, landing, { ...HTML, 'Set-Cookie': sessionCookies() })
    }
    // Un VRAI 404 (B-6) : une adresse inventée n'est pas une page trompeuse en 200.
    entry.status = 404
    return send(res, 404, notFoundPage(), HTML)
  }

  /** Le pilotage par HTTP (hôtes de la boucle locale seulement) : pour un navigateur ou un émulateur qui n'est pas dans ce processus. */
  async function control(
    entry: FakeRequest,
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ): Promise<void> {
    const json = { 'Content-Type': 'application/json; charset=utf-8' }
    entry.status = 200
    if (path === '/__fake/state') {
      return send(
        res,
        200,
        JSON.stringify({
          cart: cartSim.contents(),
          behavior,
          cartBehavior: cartSim.behavior(),
          requests: log.filter((r) => r.kind !== 'control'),
          violations,
        }),
        json,
      )
    }
    if (req.method === 'POST' && path === '/__fake/behavior') {
      behavior = { ...behavior, ...(JSON.parse(await readBody(req)) as Partial<Behavior>) }
      return send(res, 200, JSON.stringify(behavior), json)
    }
    if (req.method === 'POST' && path === '/__fake/cart-behavior') {
      cartSim.setBehavior(JSON.parse(await readBody(req)) as Partial<CartBehavior>)
      return send(res, 200, JSON.stringify(cartSim.behavior()), json)
    }
    if (req.method === 'POST' && path === '/__fake/reset') {
      reset()
      return send(res, 200, JSON.stringify(behavior), json)
    }
    entry.status = 404
    return send(res, 404, 'inconnu')
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake.invalid')
    const hostname = hostnameOf(req.headers.host)
    const loopbackHost = LOOPBACK_HOSTS.has(hostname)
    // Seule la boucle locale entre, et seulement sous un nom connu : rien d'autre ne passe, même si le port était ouvert par erreur.
    if (!isLoopback(req.socket.remoteAddress) || !(loopbackHost || hosts.has(hostname))) {
      void send(res, 403, 'Faux site de test : accès local seulement.', {
        'Content-Type': 'text/plain; charset=utf-8',
      })
      return
    }
    const entry: FakeRequest = {
      kind: 'other',
      method: req.method ?? 'GET',
      host: hostname,
      path: url.pathname,
      startedAt: now(),
      endedAt: 0,
      status: 0,
    }
    log.push(entry)
    route(entry, req, res, url, loopbackHost)
      .catch(() => {
        entry.status = 500
        if (!res.headersSent) void send(res, 500, 'erreur du faux site')
      })
      .finally(() => {
        if (entry.endedAt === 0) entry.endedAt = now()
      })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port

  return {
    port,
    site: `http://${SITE_HOST}:${port}`,
    control: `http://localhost:${port}`,
    behavior: () => ({ ...behavior }),
    setBehavior(patch) {
      behavior = { ...behavior, ...patch }
    },
    reset,
    cart: () => cartSim.contents(),
    cartBehavior: () => cartSim.behavior(),
    setCartBehavior: (patch) => cartSim.setBehavior(patch),
    seedCart: (productId, quantity) => cartSim.seed(productId, quantity),
    requests: () =>
      log.filter((request) => request.kind !== 'control').map((request) => ({ ...request })),
    paced: () =>
      log
        .filter(
          (request) =>
            request.kind === 'journey' || request.kind === 'search' || request.kind === 'cart',
        )
        .map((request) => ({ ...request })),
    writes: () =>
      log
        .filter((request) => request.kind === 'cart' && request.method === 'POST')
        .map((request) => ({ ...request })),
    violations: () => violations.map((violation) => ({ ...violation })),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
