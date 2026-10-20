// Le faux site Leclerc (DRV-309) : un serveur minimal, sans dépendance, qui imite la STRUCTURE du drive (recherche, panier, connexion) avec
// des données inventées, pour jouer l'agent de bout en bout sans jamais contacter l'enseigne. Voir README.md.
//
//   - Il n'écoute que sur 127.0.0.1 et refuse toute connexion qui ne vient pas de la boucle locale ou qui vise un autre nom d'hôte que
//     ceux de sa liste (`localhost`, `127.0.0.1`, et les noms de faux magasins) : il ne sort jamais du poste.
//   - La requête du panier est vérifiée à la lettre (en-tête `zcwb`, adresse SANS suffixe de ville, identifiant en texte, objet de contexte
//     à l'ajout seulement, point de livraison) : tout écart reçoit la page d'erreur générique 404, comme sur le vrai site.
//   - Il surveille la cadence (jamais deux requêtes en parallèle, 800 ms au moins entre deux) et la consigne dans `violations()`.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { DELIVERY_POINT, findProduct, searchCatalog } from './catalog.ts'
import {
  cartResponse,
  challengePage,
  changedSearchPage,
  accueilPage,
  basketPage,
  errorPage,
  homePage,
  loginPage,
  renamedProductsPage,
  repasReturnPage,
  facetAisleId,
  searchPage,
  type Availability,
  type CartAction,
  type EmptyForm,
  type HomeForm,
  type Session,
} from './pages.ts'
import { PHOTO_HOST, photoReply } from './photos.ts'

/** Le faux magasin : son identifiant et son nom d'hôte (le plan de Repas et la page doivent s'accorder dessus). */
export const STORE = { id: '000001', host: 'courses-test.leclercdrive.fr' } as const
/**
 * L'accueil de l'enseigne (`NavigationPolicy.START_URL` de l'application Android) : le seul nom dont la racine est une page. Session ouverte, il
 * affiche l'accueil du magasin de l'utilisateur et son bouton « Commencer mes courses », qui mène aux pages du magasin sur SON hôte. Ce nom
 * n'est servi que sur demande (`hosts`, `FAKE_LECLERC_HOSTS`), comme tout nom autre que celui du faux magasin.
 */
export const HOME_HOST = 'www.leclercdrive.fr'
/** Début des adresses des pages du magasin (avec le suffixe de ville, que portent les pages) et de celle du panier (sans). */
export const PAGE_PATH = `/magasin-${STORE.id}-${STORE.id}-Ville-Test`
export const CART_PATH = `/magasin-${STORE.id}-${STORE.id}`
/** Un autre magasin que celui du plan : l'accueil du magasin propose d'en changer, pour essayer le message « Ce n'est pas le bon magasin ». */
export const OTHER_STORE_PATH = `/magasin-000002-000002-Ville-Test`

/** Cadence minimale entre deux requêtes de l'agent (architecture.md § 8 du dépôt back) : écrite ici, pas lue dans l'agent. */
export const MIN_GAP_MS = 800
/** Marge de mesure : l'horloge du serveur et celle de la page ne se lisent pas au même instant. */
const TOLERANCE_MS = 5

export type FaultKind =
  | 'forbidden'
  | 'too-many-requests'
  | 'challenge'
  | 'contract-changed'
  | 'products-renamed'
  | 'not-found'
  | 'logged-out'
  /** Le site retient la requête : aucune réponse, jusqu'à ce que le client abandonne (le délai d'attente de l'agent, ticket K). */
  | 'hang'

/**
 * Un défaut simulé : `after` requêtes passent d'abord (0 : dès la première), `on` dit à quelles requêtes il s'applique, `times` combien de
 * requêtes il touche ensuite (absent : toutes celles qui suivent).
 */
export interface Fault {
  kind: FaultKind
  after?: number
  on?: 'search' | 'cart' | 'all'
  times?: number
}

export interface Behavior {
  /** Délai ajouté à chaque réponse de recherche ou de panier. */
  latencyMs: number
  fault: Fault | null
  /**
   * Le code HTTP (404, 500…) que l'accueil du magasin AVEC la ville (`/magasin-N-N-Ville`, la page que « Finaliser sur Leclerc » ouvre, DRV-631)
   * renvoie, avec la page d'erreur générique : pour essayer le repli sur l'accueil du drive. `null` retire le défaut.
   */
  storeHomeStatus?: number | null
  /**
   * `not-found` : l'accueil du magasin AVEC la ville répond 200 mais porte le titre « Page introuvable » (une page « introuvable » déguisée, DRV-631).
   * `null` retire le défaut.
   */
  storeHomeTitle?: 'not-found' | null
  /**
   * Le code HTTP (404, 403, 503…) que le faux site renvoie, avec sa page d'erreur générique, à la racine de l'enseigne (`HOME_HOST`) : la page où
   * l'application ouvre un plan (ticket E de l'audit du 2026-10-18), refusée par le site (page d'erreur, défi anti-robot servi en 403). Le reste
   * du site répond. `null` retire le défaut.
   */
  homeStatus?: number | null
  /** Le délai (ms) avant de répondre à la racine de l'enseigne : une page trop lente, que l'application doit savoir dire (ticket E). */
  homeDelayMs?: number | null
  /**
   * Là où mène le bouton « Commencer mes courses » de l'accueil de l'enseigne : un chemin de l'hôte du magasin (`/`, `/magasin-000001-000001/` :
   * des pages 404, comme sur le vrai site). Par défaut, l'accueil du magasin avec sa ville. Pour essayer le repli quand le chemin de l'utilisateur
   * tombe sur une page 404. Un chemin qui n'est pas fait de lettres, chiffres, `.`, `_`, `~`, `-` et `/` est ignoré. `null` retire le défaut.
   */
  startPath?: string | null
  /**
   * L'accueil de l'enseigne : avec le lien « Commencer mes courses » (`link`, par défaut), sans lui, comme la page d'un visiteur (`no-link`), ou avec
   * lui et un défi de l'anti-robot dans la page (`challenge`). Dans les deux derniers cas l'agent ne suit rien (DRV-625).
   */
  homeForm?: HomeForm
  /**
   * Le code HTTP (404, 403…) que la page du panier (`<chemin avec la ville>/detail-panier.aspx`, DRV-629) renvoie, avec la page d'erreur générique :
   * pour essayer le repli de « Finaliser sur Leclerc » sur l'accueil du drive. `null` retire le défaut. Sans ville dans le chemin, la page est
   * toujours une 404 (comme le vrai site pour les pages du magasin).
   */
  basketStatus?: number | null
  /**
   * La page de recherche sans produit : `list` (liste vide et message du site, par défaut), `no-list` (squelette seul) ou `encoded` (état en
   * entités HTML). Plusieurs formes plausibles d'une page que le vrai site n'a jamais été relevé servir (ticket C).
   */
  emptySearch?: EmptyForm
  /**
   * Le moteur de recherche strict : sensible aux accents, à la ligature « œ » et au pluriel (« œuf » ne trouve rien, « oeuf » trouve les
   * « Oeufs » ; « creme » ne trouve rien, « crème » trouve la crème fraîche). Absent ou faux : le moteur tolérant d'avant. Il sert à éprouver
   * le repli de l'agent (ticket D de l'audit du 2026-10-18, H3 et H7).
   */
  strictSearch?: boolean
  /**
   * Le moteur de recherche à APOSTROPHE STRICTE (DRV-635), relevé sur le vrai site le 2026-10-19 : « c'est » et « cest » retrouvent « C'est », « c est » (l'apostrophe
   * remplacée par une espace) ne trouve rien. Il sert à éprouver les formes de requête de l'agent (`productSearchForms`). Remplace le moteur tolérant.
   */
  strictApostrophe?: boolean
  /**
   * Le filtre par rayon du site (DRV-647, 0.36.0) : par défaut `Filtres=4-<iIdValeur>` ne garde que les produits de la valeur ; `ignored` : le paramètre est
   * ignoré (la recherche rend tout, comme une forme d'adresse qui ne filtre pas) ; `not-found` : une recherche à `Filtres` répond 404.
   */
  facetFilter?: 'ignored' | 'not-found' | 'none' | null
  /**
   * DRV-647 (0.37.0) : `other` donne aux valeurs de la facette un `sIdValeurUrl` en `9-<iIdValeur>` (que le filtre n'accepte pas : seule la forme (ii)
   * `4-<iIdValeur>` filtre) ; `facetDecoy` : une valeur de `Filtres` non acceptée rend MOINS de produits, mais d'autres rayons, et le même total (le
   * piège relevé sur le vrai site le 2026-10-20) ; sans lui, elle rend tout.
   */
  facetUrlId?: 'other' | null
  facetDecoy?: boolean | null
  /**
   * La disponibilité des produits à stock nul (DRV-635). Les deux modes ajoutent l'étiquette `eDisponibilite` (1 : disponible, 2 : bientôt disponible) et le texte
   * « Bientôt disponible » à ces produits : `misleading` (disponibilité trompeuse) : le panier les ACCEPTE, comme le site mobile de l'enseigne ; `real-out` (vraie
   * rupture) : le panier les REFUSE. Absent : l'ancien comportement (stock nul, panier qui refuse, aucune étiquette de plus).
   */
  availability?: Availability
  /**
   * Les produits (identifiants) que le panier REFUSE alors que la fiche les dit en stock (DRV-644) : le cas « disponible mais pas pris, sans raison donnée ». La réponse
   * du panier dit alors `iQteDisponible` avec le stock de la fiche, donc aucun signe de rupture.
   */
  refuseCart?: number[]
  /**
   * Le faux site sert la page d'un VISITEUR non connecté (en-tête « Se connecter » / « Créer un compte », pas de « Se déconnecter ») une fois
   * `visitorAfter` recherches et écritures du panier terminées (`0` : dès la première page ; absent ou `null` : jamais). Le catalogue reste
   * public et le panier accepte les écritures d'un visiteur : c'est le danger que l'agent doit détecter (ticket G).
   */
  visitorAfter?: number | null
}

export type RequestKind = 'search' | 'cart' | 'page' | 'repas' | 'control' | 'image' | 'other'

export interface FakeRequest {
  kind: RequestKind
  method: string
  /** Le nom d'hôte demandé (`Host`, sans le port) : `courses-test…` (le faux magasin), `www…` (l'enseigne) ou `localhost` (le pilotage). */
  host: string
  path: string
  /** Début et fin de la réponse, en millisecondes depuis le démarrage du processus. */
  startedAt: number
  endedAt: number
  status: number
  /** Le défaut simulé appliqué à cette requête, s'il y en a un. */
  fault?: FaultKind
  /** Pourquoi une requête du panier a été refusée (404 générique) : en-tête manquant, adresse avec suffixe… */
  rejected?: string
  /** Le mot cherché (recherche) ou le champ `d` décodé (panier). */
  detail?: string
  /** La valeur du paramètre `Filtres` d'une recherche filtrée (DRV-647, 0.36.0). */
  filter?: string
}

export interface Violation {
  kind: 'parallel' | 'too-fast'
  /** Rang (à partir de 1) de la requête fautive parmi les recherches et écritures du panier. */
  request: number
  gapMs?: number
}

export interface FakeLeclerc {
  readonly port: number
  /** `http://courses-test.leclercdrive.fr:<port>` : l'origine des pages du faux magasin (le navigateur de test résout ce nom vers 127.0.0.1). */
  readonly leclerc: string
  /** `http://localhost:<port>` : l'origine du faux Repas, où l'agent renvoie son résultat. */
  readonly repas: string
  behavior(): Behavior
  setBehavior(patch: Partial<Behavior>): void
  /** Remet le faux site à neuf : panier vide, journal et violations effacés, cadence repartie de zéro, comportement par défaut. */
  reset(): void
  /** Remplace le contenu du panier : identifiant de produit vers quantité. */
  seedCart(lines: Record<number, number>): void
  cart(): Record<number, number>
  requests(): FakeRequest[]
  /** Les recherches et écritures du panier, dans l'ordre. */
  paced(): FakeRequest[]
  violations(): Violation[]
  close(): Promise<void>
}

export interface FakeOptions {
  /** 0 (par défaut) : un port libre. */
  port?: number
  /** Noms d'hôte à accepter en plus de `courses-test.leclercdrive.fr` : d'autres faux magasins, et l'accueil de l'enseigne (`HOME_HOST`). */
  hosts?: string[]
  behavior?: Partial<Behavior>
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const STORE_PATTERN = /^\/magasin-(\d{1,12})-(\d{1,12})(-[^/?#]*)?(\/.*)?$/

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

/** Le port d'un en-tête `Host`, avec ses deux-points (`:8099`), ou rien : pour écrire un lien vers un autre nom sur le même port et le même schéma. */
function portSuffixOf(header: string | undefined): string {
  return /:(\d{1,5})$/.exec(header ?? '')?.[0] ?? ''
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
  headers: Record<string, string> = {},
): Promise<void> {
  return new Promise((resolve) => {
    res.writeHead(status, { 'Cache-Control': 'no-store', ...headers })
    res.end(body, () => resolve())
  })
}

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' }
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Frame-Options': 'DENY',
  'X-DataDome': 'protected',
}

/** Le champ `d` du panier, vérifié contre la forme relevée sur le vrai site (DRV-007). `null` si tout est conforme. */
export function cartRequestProblem(d: unknown): string | null {
  if (typeof d !== 'object' || d === null) return 'champ d illisible'
  const body = d as Record<string, unknown>
  if (typeof body.iIdProduit !== 'string' || !/^\d{1,12}$/.test(body.iIdProduit)) {
    return 'iIdProduit doit être un texte numérique'
  }
  if (body.sNoPointLivraison !== DELIVERY_POINT) return 'point de livraison inconnu'
  const quantity = body.iQuantite
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > 99
  ) {
    return 'iQuantite invalide'
  }
  if (body.eTypeAction === 2) {
    return quantity === 0 && body.objContexteProvenanceArticle === undefined
      ? null
      : 'un retrait a une quantité nulle et pas de contexte'
  }
  if (body.eTypeAction !== 1 || quantity < 1) return 'eTypeAction ou quantité invalide'
  const context = body.objContexteProvenanceArticle as Record<string, unknown> | undefined
  const valid =
    context !== undefined &&
    context.eOrigine === 4 &&
    context.eTypePage === 3 &&
    typeof context.sTexteRecherche === 'string' &&
    context.eVue === 0 &&
    context.sInformationsComplementaires === 'uni-2'
  return valid ? null : 'objContexteProvenanceArticle manquant ou incomplet'
}

export async function startFakeLeclerc(options: FakeOptions = {}): Promise<FakeLeclerc> {
  const hosts = new Set([STORE.host, PHOTO_HOST, ...(options.hosts ?? [])])
  let behavior: Behavior = { latencyMs: 0, fault: null, ...options.behavior }
  const cart = new Map<number, number>()
  const log: FakeRequest[] = []
  const violations: Violation[] = []
  let inFlight = 0
  let lastPacedEnd: number | null = null
  let pacedCount = 0

  function reset(): void {
    behavior = { latencyMs: 0, fault: null }
    cart.clear()
    log.length = 0
    violations.length = 0
    lastPacedEnd = null
    pacedCount = 0
  }

  /** Une requête de l'agent à cadencer (recherche ou écriture du panier) : contrôle de la cadence, latence, défaut simulé. */
  async function paced(
    entry: FakeRequest,
    scope: 'search' | 'cart',
    serve: () => Promise<void>,
    res: ServerResponse,
  ): Promise<void> {
    const rank = ++pacedCount
    const gap = lastPacedEnd === null ? null : entry.startedAt - lastPacedEnd
    if (inFlight > 0) violations.push({ kind: 'parallel', request: rank })
    else if (gap !== null && gap < MIN_GAP_MS - TOLERANCE_MS) {
      violations.push({ kind: 'too-fast', request: rank, gapMs: Math.round(gap) })
    }
    inFlight += 1
    try {
      if (behavior.latencyMs > 0) await sleep(behavior.latencyMs)
      const { fault } = behavior
      const first = (fault?.after ?? 0) + 1
      if (
        fault &&
        [scope, 'all'].includes(fault.on ?? 'all') &&
        rank >= first &&
        (fault.times === undefined || rank < first + fault.times)
      ) {
        entry.fault = fault.kind
        await serveFault(fault.kind, scope, entry, res)
      } else {
        await serve()
      }
    } finally {
      inFlight -= 1
      entry.endedAt = now()
      lastPacedEnd = entry.endedAt
    }
  }

  async function serveFault(
    kind: FaultKind,
    scope: 'search' | 'cart',
    entry: FakeRequest,
    res: ServerResponse,
  ): Promise<void> {
    entry.status = {
      forbidden: 403,
      'too-many-requests': 429,
      challenge: 200,
      'contract-changed': 200,
      'products-renamed': 200,
      'not-found': 404,
      'logged-out': 302,
      hang: 0,
    }[kind]
    if (kind === 'hang') {
      // Aucune réponse : la requête reste ouverte jusqu'à ce que le client la ferme (le délai d'attente de l'agent).
      return new Promise<void>((resolve) => {
        if (res.destroyed || res.writableEnded) return resolve()
        res.once('close', () => resolve())
      })
    }
    if (kind === 'logged-out') {
      return send(res, 302, '', { Location: `${PAGE_PATH}/connexion.aspx` })
    }
    if (kind === 'challenge') return send(res, 200, challengePage(), HTML)
    if (kind === 'products-renamed') {
      const query = entry.detail ?? ''
      return send(res, 200, renamedProductsPage(searchCatalog(query), cart), HTML)
    }
    if (kind === 'contract-changed') {
      return scope === 'search'
        ? send(res, 200, changedSearchPage(), HTML)
        : send(res, 200, JSON.stringify([{ eTypeEvenement: 7, sIdUnique: 'Autre' }]), JSON_HEADERS)
    }
    return send(res, entry.status, errorPage(), HTML)
  }

  /** La page d'un visiteur une fois `visitorAfter` requêtes terminées ; `finished` : combien l'ont été avant la page servie. */
  function sessionAfter(finished: number): Session {
    const after = behavior.visitorAfter
    return after !== undefined && after !== null && finished >= after ? 'visitor' : 'member'
  }

  async function search(entry: FakeRequest, url: URL, res: ServerResponse): Promise<void> {
    const query = url.searchParams.get('TexteRecherche') ?? ''
    entry.detail = query
    await paced(
      entry,
      'search',
      () => {
        entry.status = 200
        const session = sessionAfter(pacedCount - 1)
        // DRV-647 : `Filtres=4-<iIdValeur>` ne garde que le rayon (valeur 900000 + rayon) ou la famille (valeur = famille) de la facette.
        const filtres = url.searchParams.get('Filtres')
        if (filtres !== null) entry.filter = filtres
        if (filtres !== null && behavior.facetFilter === 'not-found') {
          entry.status = 404
          return send(res, 404, errorPage(), HTML)
        }
        const all = searchCatalog(
          query,
          behavior.strictSearch === true,
          behavior.strictApostrophe === true,
        )
        const accepted =
          behavior.facetFilter === 'ignored' || behavior.facetFilter === 'none'
            ? undefined
            : /^4-(\d+)$/.exec(filtres ?? '')?.[1]
        let shown = all
        if (filtres !== null && accepted !== undefined) {
          const id = Number(accepted)
          shown = all.filter(
            (product) => facetAisleId(product.aisle) === id || product.family === id,
          )
        } else if (filtres !== null && behavior.facetDecoy === true) {
          // La valeur visée : le plus grand nombre de `Filtres` (l'identifiant de valeur, quelle que soit la forme).
          const id = Math.max(0, ...(filtres.match(/\d+/g) ?? []).map(Number))
          shown = all
            .filter((product) => facetAisleId(product.aisle) !== id && product.family !== id)
            .slice(0, 3)
        }
        const page = searchPage(
          query,
          shown,
          cart,
          session,
          behavior.emptySearch ?? 'list',
          behavior.availability,
          {
            urlBloc: behavior.facetUrlId === 'other' ? 9 : 4,
            // Un filtre accepté annonce son propre total ; sinon (ignoré, leurre) le total de la recherche entière.
            total: filtres !== null && accepted !== undefined ? shown.length : all.length,
          },
        )
        return send(res, 200, page, HTML)
      },
      res,
    )
  }

  async function cartWrite(
    entry: FakeRequest,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    await paced(
      entry,
      'cart',
      async () => {
        const field = new URLSearchParams(await readBody(req)).get('d')
        if (field !== null) entry.detail = field
        const reject = async (why: string) => {
          entry.rejected = why
          entry.status = 404
          await send(res, 404, errorPage(), HTML)
        }
        // La requête du site : formulaire, en-têtes `X-Requested-With` et `zcwb`, adresse SANS suffixe de ville (recherche.md § 2).
        if (req.headers.zcwb !== 'ajax-manager') return reject('en-tête zcwb manquant')
        if (req.headers['x-requested-with'] !== 'XMLHttpRequest')
          return reject('X-Requested-With manquant')
        if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] ?? '')) {
          return reject('Content-Type attendu : formulaire')
        }
        let d: unknown
        try {
          d = JSON.parse(field ?? '')
        } catch {
          return reject('champ d absent ou illisible')
        }
        const problem = cartRequestProblem(d)
        if (problem) return reject(problem)
        const body = d as { eTypeAction: number; iIdProduit: string; iQuantite: number }
        const product = findProduct(Number(body.iIdProduit))
        const before = cart.get(Number(body.iIdProduit)) ?? 0
        let after = before
        if (body.eTypeAction === 2) after = 0
        else if (product && behavior.refuseCart?.includes(product.id)) after = before
        else if (product && product.stock > 0) after = Math.min(body.iQuantite, product.stock)
        // La disponibilité trompeuse (DRV-635) : la fiche dit stock nul, le panier prend le produit.
        else if (product && behavior.availability === 'misleading')
          after = Math.min(body.iQuantite, 99)
        if (after === 0) cart.delete(Number(body.iIdProduit))
        else cart.set(Number(body.iIdProduit), after)
        entry.status = 200
        if (!product) return send(res, 200, JSON.stringify([]), JSON_HEADERS)
        const action: CartAction = after === 0 ? 'remove' : before === 0 ? 'add' : 'change'
        await send(res, 200, JSON.stringify(cartResponse(cart, product, action)), JSON_HEADERS)
      },
      res,
    )
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
    // L'hôte des images (DRV-633) : seulement `image.ashx`, des images synthétiques ; ni cadence, ni défaut simulé (une image n'est pas une requête de l'agent).
    if (hostnameOf(req.headers.host) === PHOTO_HOST) {
      entry.kind = 'image'
      if (path !== '/image.ashx' || req.method !== 'GET') {
        entry.status = 404
        return send(res, 404, 'inconnu')
      }
      const photo = photoReply(url.search)
      entry.status = photo.status
      return send(res, photo.status, photo.body, { 'Content-Type': photo.type })
    }
    if (path === '/drive/retour') {
      entry.kind = 'repas'
      entry.status = 200
      return send(res, 200, repasReturnPage(), HTML)
    }
    // Recette réelle du 2026-10-18 (Pixel 9, application 0.1.3) : la RACINE de l'hôte du magasin (`https://<hôte>/`) et `/magasin-<id>-<id>/` (sans
    // ville) sont des pages 404 du vrai site. Seule la racine de l'ENSEIGNE (`https://www.leclercdrive.fr/`, `HOME_HOST`) est une page : session
    // ouverte, l'accueil du magasin de l'utilisateur, avec le bouton « Commencer mes courses » qui mène aux pages du magasin (avec la ville) sur
    // son hôte. Ce n'est pas une page de magasin pour l'agent (qui n'y agit pas) ; c'est là que l'application ouvre un plan
    // (`DrivePlan.startUrl` = `NavigationPolicy.START_URL`), et l'utilisateur y touche lui-même le bouton. Le faux ne cache plus ce défaut : s'il
    // retombait sur la racine de l'hôte du magasin, le scénario d'émulateur échouerait.
    const home = hostnameOf(req.headers.host) === HOME_HOST
    if (path === '/' && req.method === 'GET') {
      entry.kind = 'page'
      if (!home) {
        entry.status = 404
        return send(res, 404, errorPage(), HTML)
      }
      if (behavior.homeDelayMs != null && behavior.homeDelayMs > 0)
        await sleep(behavior.homeDelayMs)
      if (behavior.homeStatus != null) {
        entry.status = behavior.homeStatus
        return send(res, behavior.homeStatus, errorPage(), HTML)
      }
      entry.status = 200
      // Liens sans schéma, vers le nom du faux magasin sur le même port : ils suivent le schéma de la page (HTTP en test, HTTPS dans l'émulateur).
      const origin = `//${STORE.host}${portSuffixOf(req.headers.host)}`
      const start =
        behavior.startPath != null && /^\/[\w./~-]*$/.test(behavior.startPath)
          ? behavior.startPath
          : `${PAGE_PATH}/`
      return send(
        res,
        200,
        accueilPage(`${origin}${start}`, `${origin}${OTHER_STORE_PATH}/`, behavior.homeForm),
        HTML,
      )
    }
    if (home) {
      // L'enseigne n'a que son accueil ici : les pages d'un magasin sont sur l'hôte du magasin.
      entry.kind = 'page'
      entry.status = 404
      return send(res, 404, errorPage(), HTML)
    }
    const store = STORE_PATTERN.exec(path)
    const rest = store?.[4] ?? ''
    if (!store) {
      entry.status = 404
      return send(res, 404, errorPage(), HTML)
    }
    if (rest === '/recherche.aspx' && req.method === 'GET') {
      entry.kind = 'search'
      return search(entry, url, res)
    }
    if (rest === '/panier.aspx' && req.method === 'POST' && url.searchParams.get('op') === '1') {
      entry.kind = 'cart'
      // L'adresse du panier est SANS suffixe de ville : avec lui, le site répond par sa page d'erreur générique.
      if (store[3] !== undefined) {
        entry.rejected = 'adresse du panier avec suffixe de ville'
        entry.status = 404
        await readBody(req)
        return send(res, 404, errorPage(), HTML)
      }
      return cartWrite(entry, req, res)
    }
    entry.kind = 'page'
    if (rest === '/detail-panier.aspx' && req.method === 'GET') {
      // La page du panier n'existe qu'avec la ville dans le chemin (constat du 2026-10-19) ; `basketStatus` la fait refuser.
      const code = store[3] === undefined ? 404 : (behavior.basketStatus ?? 200)
      entry.status = code
      return code === 200
        ? send(res, 200, basketPage(cart, sessionAfter(pacedCount)), HTML)
        : send(res, code, errorPage(), HTML)
    }
    if (rest === '/connexion.aspx') {
      entry.status = 200
      return send(res, 200, loginPage(), HTML)
    }
    if (rest === '' || rest === '/' || rest === '/accueil.aspx') {
      // Sans suffixe de ville, l'accueil du magasin est une page 404 (comme sur le vrai site) : seules les adresses avec la ville sont des pages.
      if (store[3] === undefined) {
        entry.status = 404
        return send(res, 404, errorPage(), HTML)
      }
      if (behavior.storeHomeStatus != null) {
        entry.status = behavior.storeHomeStatus
        return send(res, behavior.storeHomeStatus, errorPage(), HTML)
      }
      entry.status = 200
      const home = homePage(cart, sessionAfter(pacedCount))
      return send(
        res,
        200,
        behavior.storeHomeTitle === 'not-found'
          ? home.replace(
              /<title>[^<]*<\/title>/,
              '<title>Page introuvable (faux site de test)</title>',
            )
          : home,
        HTML,
      )
    }
    entry.status = 404
    return send(res, 404, errorPage(), HTML)
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
          cart: Object.fromEntries(cart),
          behavior,
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
    if (req.method === 'POST' && path === '/__fake/reset') {
      reset()
      return send(res, 200, JSON.stringify(behavior), json)
    }
    if (req.method === 'POST' && path === '/__fake/cart') {
      cart.clear()
      for (const [id, quantity] of Object.entries(
        JSON.parse(await readBody(req)) as Record<string, number>,
      )) {
        if (quantity > 0) cart.set(Number(id), quantity)
      }
      return send(res, 200, JSON.stringify(Object.fromEntries(cart)), json)
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
    leclerc: `http://${STORE.host}:${port}`,
    repas: `http://localhost:${port}`,
    behavior: () => ({ ...behavior }),
    setBehavior(patch) {
      behavior = { ...behavior, ...patch }
    },
    reset,
    seedCart(lines) {
      cart.clear()
      for (const [id, quantity] of Object.entries(lines))
        if (quantity > 0) cart.set(Number(id), quantity)
    },
    cart: () => Object.fromEntries(cart),
    requests: () =>
      log.filter((request) => request.kind !== 'control').map((request) => ({ ...request })),
    paced: () =>
      log
        .filter((request) => request.kind === 'search' || request.kind === 'cart')
        .map((request) => ({ ...request })),
    violations: () => violations.map((violation) => ({ ...violation })),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
