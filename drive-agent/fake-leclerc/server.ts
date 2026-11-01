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
  LOGIN_PATH,
  loginFormPage,
  MEMBER_COOKIE,
  CONSENT_COOKIE,
  STORE_CHOSEN_COOKIE,
  firstUsePage,
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
  type WelcomeForm,
  type Session,
} from './pages.ts'
import {
  accountPage,
  ACCOUNT_PATH,
  authenticationPage,
  creationPage,
  listingJson,
  mobileCartProblem,
  mobileAccueilPage,
  MOBILE_OTHER_COOKIE,
  MOBILE_OTHER_PAGE_PATH,
  MOBILE_ANSWERED_COOKIE,
  MOBILE_CART_PATH,
  MOBILE_CONSENT_COOKIE,
  MOBILE_MEMBER_COOKIE,
  MOBILE_PAGE_PATH,
  MOBILE_STORE_COOKIE,
  mobileBasketPage,
  mobileStorePage,
  searchJson,
  SERVER_PAGE_PATH,
  writeJson,
  type FooterForm,
  type MobileOrigins,
} from './mobile.ts'
import { PHOTO_HOST, photoReply } from './photos.ts'

/** Le faux magasin : son identifiant et son nom d'hôte (le plan de Repas et la page doivent s'accorder dessus). */
export const STORE = { id: '000001', host: 'courses-test.leclercdrive.fr' } as const
/**
 * L'accueil de l'enseigne (`NavigationPolicy.START_URL` de l'application Android) : le seul nom dont la racine est une page. Session ouverte, il
 * affiche l'accueil du magasin de l'utilisateur et son bouton « Commencer mes courses », qui mène aux pages du magasin sur SON hôte. Ce nom
 * n'est servi que sur demande (`hosts`, `FAKE_LECLERC_HOSTS`), comme tout nom autre que celui du faux magasin.
 */
export const HOME_HOST = 'www.leclercdrive.fr'
/**
 * Le site MOBILE de l'enseigne (DRV-741, constat du 2026-10-30 sur le téléphone de test, en mode ordinateur) : l'adresse d'un magasin sur ce nom est
 * REDIRIGÉE vers la même adresse sur l'hôte du magasin, avec `.aspx` en plus (le bon hôte `fd<N>` est celui de Leclerc, on ne le devine pas). Rien d'autre
 * n'y est servi. Comme tout nom autre que celui du faux magasin, il n'est servi que sur demande (`hosts`, `FAKE_LECLERC_HOSTS`).
 */
export const MOBILE_HOST = 'm-courses.leclercdrive.fr'
/**
 * Les hôtes de la VERSION MOBILE (DRV-754, `mobile.ts`) : `HOME_HOST` (l'accueil adapté au téléphone), `MOBILE_HOST` (`m-courses`, qui sert alors lui-même la page du
 * magasin), le SERVEUR du magasin (`fd<N>-courses`, parlé en AJAX depuis `m-courses`) et le compte (`fd<N>-espace-client`). Servis sur demande (`hosts`).
 */
export const SERVER_HOST = 'fd8-courses.leclercdrive.fr'
export const ACCOUNT_HOST = 'fd8-espace-client.leclercdrive.fr'
export const MOBILE_HOSTS: string[] = [HOME_HOST, MOBILE_HOST, SERVER_HOST, ACCOUNT_HOST]
/** Le magasin du plan de la version mobile : son identifiant, et l'hôte du SERVEUR (celui que l'agent lit dans les liens de `m-courses`). */
export const MOBILE_PLAN_STORE = { id: '000001', host: SERVER_HOST } as const

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
   * La fenêtre d'accueil du magasin sur sa page (« <magasin> vous propose le(s) service(s) » et « Commencer mes courses ») : `button` (le bouton la ferme),
   * `human` (idem, mais un clic de programme est ignoré : `event.isTrusted`) ou `inert` (le bouton ne fait rien). `null` ou absent : pas de fenêtre.
   */
  storeWelcome?: WelcomeForm | null
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
  /** DRV-647 (0.38.0) : les produits frais de marque de distributeur (`mdd` du catalogue) sont trouvés, et rangés dans `objContenuMDD`. */
  mddList?: boolean | null
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
  /**
   * La page de connexion SOUS le chemin du magasin (`<magasin>/connexion.aspx`, où mène le lien « Se connecter » des pages d'un visiteur) est un formulaire qu'une
   * PERSONNE valide (DRV-751) : il pose le cookie de connexion et la ramène à l'accueil du magasin, dont les pages montrent alors un client connecté.
   */
  loginForm?: boolean
  /** Les pages du magasin ne disent rien de la connexion : ni « Se déconnecter » ni « Se connecter » (DRV-754 : l'agent n'écrit alors rien dans le panier). */
  unknownSession?: boolean
  /** Le mur de cookies plein écran de l'accueil national de la forme `homeForm: 'first-use'` (DRV-753), tant que la personne n'a pas répondu. */
  cookieWall?: boolean | 'tall' | 'banner'
  /**
   * La VERSION MOBILE (DRV-754) : `www` et `m-courses` servent les pages mesurées le 2026-11-01 (`mobile.ts`) à la place de celles du site ordinateur. `null` ou absent : le
   * faux site d'avant (`m-courses` redirige alors vers l'hôte du magasin). Les hôtes du serveur et du compte (`SERVER_HOST`, `ACCOUNT_HOST`) répondent toujours.
   */
  mobile?: MobileBehavior | null
}

/** Ce que la version mobile du faux site montre ou fait, au choix d'un test. */
export interface MobileBehavior {
  /** La personne est déjà connectée (le cookie de connexion est posé d'avance) ; sinon elle l'est une fois la connexion faite sur `ACCOUNT_HOST`. */
  member?: boolean
  /** Le magasin est déjà choisi sur l'accueil (le bouton « Commencer mes courses » est là) ; sinon il se choisit par le code postal. */
  chosen?: boolean
  /** Le magasin qu'on choisit sur l'accueil (ou que « Commencer mes courses » ouvre) est le SECOND magasin (`MOBILE_OTHER_STORE`, DRV-755), pas celui du plan. */
  otherStore?: boolean
  /** Après la connexion, `m-courses` demande « compléter ton ancien panier ? » tant que la personne n'a pas répondu. */
  question?: boolean
  /** La connexion ajoute la fenêtre « code reçu par e-mail » avant d'ouvrir le compte. */
  loginCode?: boolean
  /** Le pied de page de `m-courses` : les liens vers le serveur (`normal`), aucun (`none`) ou deux hôtes différents (`two-hosts`). */
  footer?: FooterForm
  /** La réponse de recherche du serveur : `no-list` (un objet sans `lstProduits.lstElements`) ou `text` (du texte, pas du JSON). */
  searchShape?: 'no-list' | 'text' | null
  /** L'écriture du panier ignorée : le serveur répond 200 avec le panier tel qu'il est, sans rien ajouter (la question de l'ancien panier est posée). */
  ignoreWrites?: boolean
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
  /** Les origines de la version mobile (`http://<hôte>:<port>`) : l'accueil, `m-courses`, le serveur du magasin et le compte. */
  readonly mobileOrigins: MobileOrigins
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
  /** La personne s'est connectée sur le faux site (le cookie de connexion de la requête en cours, `loginForm`). */
  let cookieMember = false

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
      return send(
        res,
        200,
        renamedProductsPage(
          searchCatalog(query).filter(
            (product) => behavior.mddList === true || product.mdd !== true,
          ),
          cart,
        ),
        HTML,
      )
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
    if (behavior.unknownSession === true) return 'unknown'
    if (behavior.loginForm === true && cookieMember) return 'member'
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
        ).filter((product) => behavior.mddList === true || product.mdd !== true)
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
    /** Vrai : le site ordinateur (en-têtes `zcwb` et `X-Requested-With` exigés) ; faux : la version mobile (DRV-754, M11 : aucun en-tête propre au site, le marqueur est `ng-ajax=1`). */
    desktop = true,
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
        if (desktop && req.headers.zcwb !== 'ajax-manager') return reject('en-tête zcwb manquant')
        if (desktop && req.headers['x-requested-with'] !== 'XMLHttpRequest')
          return reject('X-Requested-With manquant')
        if (
          !desktop &&
          new URL(req.url ?? '/', 'http://fake.invalid').searchParams.get('ng-ajax') !== '1'
        )
          return reject('ng-ajax manquant')
        if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] ?? '')) {
          return reject('Content-Type attendu : formulaire')
        }
        let d: unknown
        try {
          d = JSON.parse(field ?? '')
        } catch {
          return reject('champ d absent ou illisible')
        }
        const problem = desktop ? cartRequestProblem(d) : mobileCartProblem(d)
        if (problem) return reject(problem)
        const body = d as { eTypeAction: number; iIdProduit: string | number; iQuantite: number }
        if (!desktop) return mobileWrite(entry, res, Number(body.iIdProduit), body.iQuantite)
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

  /**
   * L'écriture de la version mobile (M11 à M14) : la quantité est ABSOLUE (0 retire), la réponse a 4 évènements (produit 101, 103 ou 102, rayon, panier, paniers complets).
   * Un produit que le site ne prend pas (inconnu, stock nul, refusé) rend 102 PUIS 106 avec la quantité 0 et laisse le panier inchangé. `ignoreWrites` : le panier reste tel
   * qu'il est (la question de l'ancien panier est posée).
   */
  async function mobileWrite(
    entry: FakeRequest,
    res: ServerResponse,
    id: number,
    requested: number,
  ): Promise<void> {
    const product = findProduct(id)
    const before = cart.get(id) ?? 0
    let after = before
    if (requested === 0) after = 0
    else if (product && behavior.refuseCart?.includes(product.id)) after = before
    else if (product && product.stock > 0) after = Math.min(requested, product.stock)
    // La disponibilité trompeuse (DRV-635) : la fiche dit stock nul, le panier prend le produit.
    else if (product && behavior.availability === 'misleading') after = Math.min(requested, 99)
    if (behavior.mobile?.ignoreWrites === true) after = before
    else if (after === 0) cart.delete(id)
    else cart.set(id, after)
    entry.status = 200
    const kind =
      requested > 0 && after === 0
        ? 'refused'
        : after === 0
          ? 'remove'
          : before === 0
            ? 'add'
            : 'change'
    await send(res, 200, writeJson(cart, id, kind), JSON_HEADERS)
  }

  /**
   * La recherche de la version mobile (M1) : un POST sans corps, un JSON. Même cadence, mêmes défauts simulés et mêmes moteurs de recherche que la page du site ordinateur.
   * `searchShape` fait rendre une réponse qui n'est pas celle qu'on lit (défaut de forme).
   */
  async function searchAjax(entry: FakeRequest, url: URL, res: ServerResponse): Promise<void> {
    const query = url.searchParams.get('TexteRecherche') ?? ''
    entry.detail = query
    await paced(
      entry,
      'search',
      () => {
        entry.status = 200
        const shape = behavior.mobile?.searchShape
        if (shape === 'text')
          return send(res, 200, 'ce n’est pas du JSON', { 'Content-Type': 'text/plain' })
        if (shape === 'no-list') {
          return send(res, 200, JSON.stringify({ iNbTotalProduits: 2, liste: [] }), JSON_HEADERS)
        }
        const all = searchCatalog(
          query,
          behavior.strictSearch === true,
          behavior.strictApostrophe === true,
        ).filter((product) => behavior.mddList === true || product.mdd !== true)
        return send(
          res,
          200,
          searchJson(query, all, cart, behavior.availability !== undefined),
          JSON_HEADERS,
        )
      },
      res,
    )
  }

  /**
   * Les hôtes de la VERSION MOBILE (DRV-754). Le serveur du magasin parle à `m-courses` depuis un AUTRE hôte : il répond comme le vrai (CORS : l'origine de `m-courses`,
   * les cookies permis, rien d'autre que `Content-Type` en en-tête de requête : une requête qui en porte un autre est refusée avant d'arriver).
   */
  async function routeMobile(
    entry: FakeRequest,
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const host = hostnameOf(req.headers.host)
    const port = portSuffixOf(req.headers.host)
    const origins: MobileOrigins = {
      www: `http://${HOME_HOST}${port}`,
      courses: `http://${MOBILE_HOST}${port}`,
      server: `http://${SERVER_HOST}${port}`,
      account: `http://${ACCOUNT_HOST}${port}`,
      repas: `http://localhost${port}`,
    }
    const mobile = behavior.mobile ?? {}
    const cookie = req.headers.cookie ?? ''
    const has = (name: string) => new RegExp(`(?:^|;\\s*)${name}=1(?:;|$)`).test(cookie)
    const member = mobile.member === true || has(MOBILE_MEMBER_COOKIE)
    const path = url.pathname
    entry.kind = 'page'
    if (host === HOME_HOST) {
      if (path === '/' && req.method === 'GET') {
        entry.status = 200
        return send(
          res,
          200,
          mobileAccueilPage(origins, {
            chosen: mobile.chosen === true || has(MOBILE_STORE_COOKIE),
            consent: has(MOBILE_CONSENT_COOKIE),
            wall: behavior.cookieWall ?? false,
            other: mobile.otherStore === true || has(MOBILE_OTHER_COOKIE),
          }),
          HTML,
        )
      }
      entry.status = 404
      return send(res, 404, errorPage(), HTML)
    }
    if (host === MOBILE_HOST) {
      // Le second magasin (DRV-755) : sa page seule, aucun passage
      if (req.method === 'GET' && new RegExp(`^${MOBILE_OTHER_PAGE_PATH}/?$`, 'i').test(path)) {
        entry.status = 200
        return send(
          res,
          200,
          mobileStorePage(origins, cart, {
            member,
            question: false,
            footer: mobile.footer ?? 'normal',
            other: true,
          }),
          HTML,
        )
      }
      if (req.method === 'GET' && new RegExp(`^${MOBILE_PAGE_PATH}/?$`, 'i').test(path)) {
        entry.status = 200
        return send(
          res,
          200,
          mobileStorePage(origins, cart, {
            member,
            question: mobile.question === true && !has(MOBILE_ANSWERED_COOKIE),
            footer: mobile.footer ?? 'normal',
          }),
          HTML,
        )
      }
      entry.status = 404
      return send(res, 404, errorPage(), HTML)
    }
    if (host === ACCOUNT_HOST) {
      const page = new RegExp(`^${ACCOUNT_PATH}/([a-z-]+\\.aspx)$`, 'i').exec(path)?.[1]
      const html =
        page === 'creation-compte-ccc.aspx'
          ? creationPage(origins)
          : page === 'authentification.aspx' || page === 'identification-unique.aspx'
            ? authenticationPage(origins, mobile.loginCode === true)
            : page === 'home-espace-client-ccc.aspx'
              ? accountPage(origins)
              : null
      entry.status = html === null ? 404 : 200
      return send(res, entry.status, html ?? errorPage(), HTML)
    }
    // Le serveur du magasin (`fd<N>-courses`) : l'AJAX de `m-courses` et la page HTML du panier
    const allowed = req.headers.origin === origins.courses
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origins.courses)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      entry.status = allowed ? 204 : 403
      return send(res, entry.status, '', {
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'content-type',
      })
    }
    if (
      req.method === 'GET' &&
      new RegExp(`^${SERVER_PAGE_PATH}/mobile-detail-panier.aspx$`, 'i').test(path)
    ) {
      entry.status = 200
      return send(res, 200, mobileBasketPage(cart), HTML)
    }
    if (req.method === 'POST' && url.searchParams.get('ng-ajax') === '1') {
      if (path === `${MOBILE_CART_PATH}/recherche-ajax.aspx`) {
        entry.kind = 'search'
        return searchAjax(entry, url, res)
      }
      if (path === `${MOBILE_CART_PATH}/panier.aspx`) {
        const op = url.searchParams.get('op')
        if (op === '1') {
          entry.kind = 'cart'
          return cartWrite(entry, req, res, false)
        }
        if (op === '12') {
          // La lecture du panier : cadencée comme les autres requêtes de l'agent, mais ce n'est pas une écriture
          entry.kind = 'other'
          entry.detail = 'op=12'
          return paced(
            entry,
            'cart',
            async () => {
              await readBody(req)
              entry.status = 200
              await send(res, 200, listingJson(cart), JSON_HEADERS)
            },
            res,
          )
        }
      }
    }
    entry.status = 404
    return send(res, 404, errorPage(), HTML)
  }

  async function route(
    entry: FakeRequest,
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    loopbackHost: boolean,
  ): Promise<void> {
    const path = url.pathname
    cookieMember = new RegExp(`(?:^|;\\s*)${MEMBER_COOKIE}=1(?:;|$)`).test(req.headers.cookie ?? '')
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
    const requested = hostnameOf(req.headers.host)
    // La version mobile : le serveur et le compte répondent toujours ; `www` et `m-courses` seulement quand `behavior.mobile` est posé (sinon, le faux site d'avant)
    if (
      requested === SERVER_HOST ||
      requested === ACCOUNT_HOST ||
      (behavior.mobile != null && (requested === HOME_HOST || requested === MOBILE_HOST))
    ) {
      return routeMobile(entry, req, res, url)
    }
    if (hostnameOf(req.headers.host) === MOBILE_HOST) {
      entry.kind = 'page'
      const mobile = STORE_PATTERN.exec(path)
      // Une adresse de magasin (avec ou sans `.aspx`, avec sa ville) mène à la page du magasin sur son hôte, sur le même port et le même schéma
      if (req.method === 'GET' && mobile?.[3] !== undefined && mobile[4] === undefined) {
        entry.status = 302
        const target = `//${STORE.host}${portSuffixOf(req.headers.host)}${path}${path.endsWith('.aspx') ? '' : '.aspx'}`
        return send(res, 302, '', { Location: target })
      }
      entry.status = 404
      return send(res, 404, errorPage(), HTML)
    }
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
      const hasCookie = (name: string) =>
        new RegExp(`(?:^|;\\s*)${name}=1(?:;|$)`).test(req.headers.cookie ?? '')
      if (behavior.homeForm === 'first-use') {
        const origin = `//${STORE.host}${portSuffixOf(req.headers.host)}`
        return send(
          res,
          200,
          firstUsePage(`${origin}${PAGE_PATH}/`, {
            member: cookieMember,
            chosen: hasCookie(STORE_CHOSEN_COOKIE),
            consent: hasCookie(CONSENT_COOKIE),
            wall: behavior.cookieWall ?? false,
          }),
          HTML,
        )
      }
      // Liens sans schéma, vers le nom du faux magasin sur le même port : ils suivent le schéma de la page (HTTP en test, HTTPS dans l'émulateur).
      const origin = `//${STORE.host}${portSuffixOf(req.headers.host)}`
      const start =
        behavior.startPath != null && /^\/[\w./~-]*$/.test(behavior.startPath)
          ? behavior.startPath
          : `${PAGE_PATH}/`
      return send(
        res,
        200,
        accueilPage(
          `${origin}${start}`,
          `${origin}${OTHER_STORE_PATH}/`,
          behavior.homeForm,
          new RegExp(`(?:^|;\\s*)${MEMBER_COOKIE}=1(?:;|$)`).test(req.headers.cookie ?? ''),
        ),
        HTML,
      )
    }
    if (
      home &&
      path === LOGIN_PATH &&
      req.method === 'GET' &&
      (behavior.homeForm === 'login-first' || behavior.homeForm === 'first-use')
    ) {
      // La connexion de l'accueil de l'enseigne, seulement pour la forme `login-first` (DRV-748) : un bouton que la personne touche.
      entry.kind = 'page'
      entry.status = 200
      return send(res, 200, loginFormPage(), HTML)
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
      return send(
        res,
        200,
        behavior.loginForm === true ? loginFormPage(`${PAGE_PATH}/`) : loginPage(),
        HTML,
      )
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
      const home = homePage(cart, sessionAfter(pacedCount), behavior.storeWelcome ?? null)
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
    mobileOrigins: {
      www: `http://${HOME_HOST}:${port}`,
      courses: `http://${MOBILE_HOST}:${port}`,
      server: `http://${SERVER_HOST}:${port}`,
      account: `http://${ACCOUNT_HOST}:${port}`,
      repas: `http://localhost:${port}`,
    },
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
