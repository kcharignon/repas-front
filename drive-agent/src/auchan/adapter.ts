import { STORES } from '../../protocol'
import { takeWindowPrimitives, type WindowPrimitives } from '../primitives'
import { httpCause } from '../retailers/causes'
import {
  headerNames,
  mimeOf,
  type ArrivalFacts,
  type AttemptFacts,
  type Candidate,
  type CartResult,
  type CookieFacts,
  type EntryReading,
  type LocationLike,
  type NavigationFacts,
  type RetailerAdapter,
  type SearchFacts,
  type SessionReading,
  type StoreInfo,
} from '../retailers/contract'
import { RetailerError } from '../retailers/errors'
import {
  Pacer,
  type FetchFn,
  type PacerDeps,
  type Reply,
  type RequestStats,
} from '../retailers/pacer'
import type { CartProbeFacts, CartReplyFacts } from '../retailers/cart-facts'
import type { StoreReadFacts } from '../retailers/store-facts'
import { CART_FAILURE_KEY, parseCartFailure, stringifyCartFailure } from './cart-failure'
import { AuchanCart } from './cart-writer'
import { isAuchanChallenge } from './challenge'
import { readEntry } from './entry'
import { readJourney } from './journey'
import {
  addressShape,
  chooseBarTarget,
  cookieFacts,
  isNotFoundPage,
  LOGIN_HINTS,
  LOGIN_LABELS,
  storeBar,
} from './page'
import { findControl, type GuideLook, type GuideStep, type GuideTarget } from '../retailers/guide'
import { readAuchanLook } from './guide-look'
import type { AuchanOffer } from './offers'
import { PACING } from './pacing'
import { readSession } from './session'
import { describeReply, interpretSearch, SEARCH_INIT, searchPath } from './search'
import { offerOf, toCandidate } from './search-product'

/**
 * L'adaptateur d'Auchan : le magasin, la connexion, l'entrée, le diagnostic (DRV-717) et le panier (DRV-725 : `auchan/cart-writer.ts`). Il parle au site depuis
 * la page de la personne (chemins relatifs, mêmes cookies), à la cadence d'Auchan (`pacing.ts`, NON MESURÉE). La recherche (DRV-724) n'est pas écrite :
 * ces méthodes lèvent `CONTRACT_CHANGED` de cause `ADAPTER_NOT_WRITTEN`, sans une requête, comme avant.
 */

/** Ce dont l'adaptateur a besoin pour vivre dans une page : la page elle-même, son `fetch`, l'horloge, et quelques lectures de la page qu'un test remplace. */
export interface AuchanDeps extends PacerDeps {
  /** `window.fetch` : l'adaptateur n'envoie des requêtes qu'à l'hôte de la page (chemins relatifs). */
  fetch: FetchFn
  location: LocationLike
  /** Le document de la page : la barre du magasin, la page « introuvable » et « Commencer mes achats » s'y lisent. Lu seulement. */
  document: Document
  /** `sessionStorage.tracking_authenticated` (`"false"`, `"true"`) ; `null` quand la page ne le dit pas. */
  authenticated: () => string | null
  /** Ce que le navigateur sait de la navigation qui a amené sur la page (code HTTP, redirections) ; `null` s'il ne le dit pas. */
  navigation?: () => NavigationFacts | null
  /** `document.cookie`, lu une fois en mémoire pour deux faits du diagnostic (un nombre et un oui/non) ; jamais gardé ni rapporté tel quel. */
  cookies?: () => string
  /** Ouvre une adresse dans la page (`location.assign`) : suivre un lien d'entrée. Absente, `followEntry` ne suit pas de lien. */
  navigate?: (url: string) => void
  /**
   * Le `sessionStorage` de l'onglet (DRV-752) : la FORME de la dernière réponse du panier en échec s'y garde (un nombre, des noms, des mots d'une liste
   * fermée) pour que le diagnostic la montre après un rechargement. Absent : elle ne vit qu'en mémoire.
   */
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void }
  /** Lit un texte HTML en document inerte (le `DOMParser` pris au démarrage, DRV-724) : la page de résultats se lit par des sélecteurs. */
  parseHtml: (html: string) => Document
}

/** Le temps laissé à une navigation pour quitter la page avant de la dire sans effet (le clic ou le lien d'entrée). */
export const ENTRY_WAIT_MS = 3_000

/** Le texte fixe de l'erreur d'un délai d'attente dépassé. */
const TIMEOUT_MESSAGE = 'Auchan met trop de temps à répondre.'

/** Une redirection vers une page de connexion (le serveur d'identité du site, ou une adresse de connexion). */
const LOGIN_PATH = /connexion|identif|login|authent|\/auth\//i

/** La lecture du parcours : une requête XHR, comme le site la fait (DRV-712, A-2). */
const JOURNEY_INIT: RequestInit = {
  method: 'GET',
  headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
}

function notWritten(): never {
  throw new RetailerError('CONTRACT_CHANGED', null, 'ADAPTER_NOT_WRITTEN')
}

function notWrittenLater(): Promise<never> {
  return Promise.resolve().then(notWritten)
}

export class AuchanAdapter implements RetailerAdapter {
  private readonly deps: AuchanDeps
  private readonly pacer: Pacer
  /** Ce que la dernière lecture du magasin a laissé voir (formes seulement), pour le diagnostic. */
  private storeFacts: StoreReadFacts | null = null
  /** L'adresse que `readEntry` a vérifiée en dernier, `null` sans lien sûr : la seule que `followEntry` suive. */
  private entryUrl: string | null = null
  /** Le bouton que `readEntry` a trouvé en dernier : le seul que `followEntry` touche. */
  private entryButton: { click(): void } | null = null
  /** Ce que la dernière recherche a laissé voir de la réponse du site (formes et nombres seulement), pour le diagnostic. */
  private searchFacts: SearchFacts | null = null
  /** Le panier (DRV-725) : lire d'abord, écrire une quantité absolue, relire. Il parle par le même `Pacer` : jamais deux requêtes à la fois. */
  private readonly cart: AuchanCart

  constructor(deps: AuchanDeps) {
    this.deps = deps
    this.pacer = new Pacer(deps.fetch, deps, {
      ...PACING,
      timeoutMessage: TIMEOUT_MESSAGE,
      challenge: isAuchanChallenge,
    })
    this.cart = new AuchanCart({
      request: (url, init) => this.pacer.request(url, init),
      ...(deps.cookies !== undefined && { cookies: deps.cookies }),
      member: () => {
        const { state } = this.readSession()
        return state === 'UNKNOWN' ? null : state === 'MEMBER'
      },
      ...(deps.storage !== undefined && {
        keepFailure: (facts: CartReplyFacts) =>
          deps.storage?.setItem(CART_FAILURE_KEY, stringifyCartFailure(facts)),
        recallFailure: () => parseCartFailure(deps.storage?.getItem(CART_FAILURE_KEY) ?? null),
      }),
    })
  }

  /** Retient l'offre d'un produit lu par la recherche (DRV-724 l'appelle pour chaque produit lu) : l'écriture du panier n'a que `productId`. */
  rememberOffer(productId: string, offer: AuchanOffer): boolean {
    return this.cart.rememberOffer(productId, offer)
  }

  /**
   * Le magasin choisi. Il n'est PAS dans l'adresse (DRV-712, A-1) : le site le dit par son parcours, `GET /journey` (une requête, à la cadence). Aucun magasin
   * choisi (pas de contexte de courses, ou la barre « Choisir vos courses » à l'écran) : `UNSUPPORTED_PAGE`, cause `STORE_NOT_CHOSEN`, sans requête
   * pour la barre ; jamais une valeur devinée dans l'adresse.
   */
  async readStore(): Promise<StoreInfo> {
    const { location, document } = this.deps
    const host = location.hostname.toLowerCase()
    if (!STORES.auchan.host.test(host))
      throw new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_HOST')
    if (isNotFoundPage(document, this.navigationStatus())) {
      throw new RetailerError('UNSUPPORTED_PAGE', 404, 'PAGE_NOT_FOUND')
    }
    // La barre dit « Choisir vos courses » : la personne n'a pas de magasin (après une déconnexion, par exemple). Inutile de demander au site.
    if (storeBar(document) === 'CHOOSE') {
      this.storeFacts = null
      throw new RetailerError('UNSUPPORTED_PAGE', null, 'STORE_NOT_CHOSEN')
    }
    const reply = await this.pacer.request('/journey', JOURNEY_INIT)
    this.assertUsable(reply)
    const reading = readJourney(reply.text, reply.status)
    this.storeFacts = reading.facts
    if (reading.store === null)
      throw new RetailerError('UNSUPPORTED_PAGE', null, 'STORE_NOT_CHOSEN')
    return {
      id: reading.store.id,
      host,
      baseUrl: `https://${host}/`,
      label: reading.store.label,
    }
  }

  /**
   * Le magasin se choisit SUR LA PAGE d'Auchan (DRV-740) : la barre du magasin dit « Retrait : … » une fois choisi (A-4b). Une lecture du DOM seule, aucune requête.
   * Une page sans barre lisible (ou qui dit « Choisir vos courses ») n'a pas de magasin choisi.
   */
  storeChosenOnPage(): boolean {
    try {
      return storeBar(this.deps.document) === 'WITHDRAWAL'
    } catch {
      return false
    }
  }

  /**
   * Le contrôle que la personne doit toucher pour une étape guidée (DRV-751) : la barre du magasin (`store`), ou le contrôle de connexion de la page (`login`,
   * libellés non mesurés : `null` si rien ne ressemble à une connexion). Une lecture de la page seule, jamais un toucher.
   */
  /** La carte se pose hors des boutons du mur de cookies d'Auchan, qui apparaît avant tout (DRV-757, parcours du 2026-11-01). */
  readonly keepClearOfConsent = true

  /**
   * La sous-étape que la page montre (DRV-757) : le mur de cookies, la barre, le panneau de choix (champ, ville proposée, magasins, « Utiliser ce magasin ») ; sans elle, le
   * contrôle de `guideTarget` seul. Le libellé cité est celui de l'élément entouré, lu à l'instant. Une lecture de la page seule.
   */
  guideLook(step: GuideStep): GuideLook {
    try {
      const look = readAuchanLook(this.deps.document, step)
      if (look !== null) return look
    } catch {
      // La page ne se laisse pas lire : le contrôle seul, ou rien.
    }
    const target = this.guideTarget(step)
    return { sub: null, target, keep: target === null ? [] : [target.element], maybe: [] }
  }

  guideTarget(step: GuideStep): GuideTarget | null {
    try {
      const { document } = this.deps
      return step === 'store'
        ? chooseBarTarget(document)
        : findControl(document, LOGIN_LABELS, LOGIN_HINTS)
    } catch {
      return null
    }
  }

  /** Le code HTTP du document de la page, `null` si le navigateur ne le dit pas. */
  private navigationStatus(): number | null {
    try {
      return this.deps.navigation?.()?.status ?? null
    } catch {
      return null
    }
  }

  /**
   * Écarte les réponses qui ne sont pas une réponse du site à notre requête. Un 404 n'est pas un blocage (une route disparue : le site a changé) ; seuls
   * 403, 429 et la page de défi, traités par le `Pacer`, sont `BLOCKED`.
   */
  private assertUsable(reply: Reply): void {
    if (reply.status === 401) throw new RetailerError('NOT_LOGGED_IN', reply.status, 'HTTP_401')
    if (reply.redirected && LOGIN_PATH.test(safePath(reply.url))) {
      throw new RetailerError('NOT_LOGGED_IN', reply.status, 'LOGIN_REDIRECT')
    }
    if (reply.status >= 500) {
      throw new RetailerError('NETWORK', reply.status, httpCause(reply.status))
    }
    if (reply.status < 200 || reply.status >= 300) {
      throw new RetailerError('CONTRACT_CHANGED', reply.status, httpCause(reply.status))
    }
  }

  readSession(): SessionReading {
    let flag: string | null = null
    try {
      flag = this.deps.authenticated()
    } catch {
      // Le stockage de la page ne se laisse pas lire : état inconnu.
    }
    return readSession(flag)
  }

  readArrival(): ArrivalFacts {
    let navigation: NavigationFacts | null = null
    try {
      navigation = this.deps.navigation?.() ?? null
    } catch {
      // Le navigateur ne le dit pas.
    }
    let cookies: CookieFacts | null = null
    try {
      const raw = this.deps.cookies?.()
      cookies = raw === undefined ? null : cookieFacts(raw)
    } catch {
      // La page ne les dit pas.
    }
    return {
      address: addressShape(this.deps.location.pathname),
      redirects: navigation?.redirects ?? null,
      status: navigation?.status ?? null,
      cookies,
      searchBase: null,
      ...(this.storeFacts !== null && { storeRead: this.storeFacts }),
    }
  }

  readEntry(): EntryReading {
    const { reading, button } = readEntry(this.deps.document, this.deps.location)
    this.entryUrl = reading.kind === 'LINK' ? reading.url : null
    this.entryButton = button
    return reading
  }

  async followEntry(): Promise<void> {
    const { navigate } = this.deps
    const url = this.entryUrl
    const button = this.entryButton
    this.entryUrl = null
    this.entryButton = null
    if (button !== null) {
      await this.pacer.act(() => button.click())
    } else if (url !== null && navigate !== undefined) {
      await this.pacer.act(() => navigate(url))
    } else {
      return
    }
    await this.deps.sleep(ENTRY_WAIT_MS)
  }

  stats(): RequestStats {
    return this.pacer.stats()
  }

  // —— La recherche et la lecture des produits (DRV-724) ———————————————————————————————————————————————————————————————————————

  /**
   * Les produits que la page de résultats de `GET /recherche?text=<terme>` propose, dans l'ordre de la page (une seule page : la pagination n'est pas
   * mesurée). Chaque produit a son identifiant d'offre (`Candidate.offerId`). La requête passe par le `Pacer` (une à la fois, à la cadence d'Auchan).
   * Une redirection du terme vers une page de rayon (mesuré, DRV-734) est lue comme une page de résultats ; vers une fiche de produit (non mesuré), aucun produit. L'EAN n'est pas sur cette page.
   * @throws {RetailerError} `NOT_LOGGED_IN`, `BLOCKED`, `NETWORK`, ou `CONTRACT_CHANGED` avec la cause d'une page de forme inconnue.
   */
  async searchProducts(query: string): Promise<Candidate[]> {
    const text = query.trim()
    if (text === '') return []
    this.searchFacts = null
    const reply = await this.pacer.request(searchPath(text), SEARCH_INIT)
    const facts = describeReply(reply, mimeOf(reply.contentType), headerNames(reply.headers))
    this.searchFacts = facts
    try {
      this.assertUsable(reply)
      const reading = interpretSearch(reply, this.deps.parseHtml)
      facts.outcome = reading.products.length > 0 ? 'PRODUCTS' : 'EMPTY'
      facts.products = reading.products.length
      facts.phrases = reading.phrases
      if (reading.landing !== undefined) facts.landing = reading.landing
      if (reading.notDrive > 0) facts.notDrive = reading.notDrive
      for (const product of reading.products)
        this.rememberOffer(product.productId, offerOf(product))
      return reading.products.map((product) => toCandidate(product, this.deps.location))
    } catch (error) {
      facts.outcome = 'FAILED'
      if (error instanceof RetailerError) facts.fault = { code: error.code, cause: error.cause }
      else facts.fault = { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION' }
      throw error
    }
  }

  /** Le produit voulu parmi les résultats d'une recherche (son identifiant de produit), ou `null` s'il n'y figure pas. */
  async readProductFromSearch(query: string, productId: string): Promise<Candidate | null> {
    const candidates = await this.searchProducts(query)
    return candidates.find((candidate) => candidate.id === productId) ?? null
  }

  lastSearchFacts(): SearchFacts | null {
    return this.searchFacts
  }

  /** Une seule forme de requête de recherche : rien à sonder, aucune requête. */
  exploreSearchVariants(): Promise<AttemptFacts[]> {
    return Promise.resolve([])
  }

  // —— Ce qui n'a pas encore de réponse : aucun panier n'a eu lieu ———————————————————————————————————————————————————————————————

  pageCartTotal(): number | null {
    return this.cart.totalCents()
  }
  cartQuantity(productId: string): number | null {
    return this.cart.quantityOf(productId)
  }
  /**
   * La quantité déjà au panier, LUE (DRV-732) : la page de résultats d'Auchan ne la dit pas, le panier oui. Un seul `GET /cart` par passage (par le `Pacer`),
   * partagé entre les produits et rafraîchi par chaque écriture.
   */
  readCartQuantity(productId: string): Promise<number | null> {
    return this.cart.readQuantity(productId)
  }

  /**
   * La sonde de lecture du panier du diagnostic (DRV-752) : UNE requête `GET /cart` à la cadence, jamais une écriture, qui ne retient rien du panier. Elle rend
   * la forme de la réponse du site et ne lève jamais d'erreur.
   */
  probeCart(): Promise<CartProbeFacts> {
    return this.cart.probe()
  }

  /** La forme de la dernière réponse du panier qui a échoué (DRV-752), de cette page ou de l'onglet ; `null` s'il n'y en a pas. */
  lastCartFailure(): CartReplyFacts | null {
    return this.cart.lastFailure()
  }

  // —— Écrit par DRV-725 (le panier) ——————————————————————————————————————————————————————————————————————————————————————————

  setCartQuantity(productId: string, quantity: number): Promise<CartResult> {
    return this.cart.setQuantity(productId, quantity)
  }
  readAisleMenu(): never {
    return notWritten()
  }
  describeLastReply(): never {
    return notWritten()
  }
  aisleChoices(): never {
    return notWritten()
  }
  aisleSamples(): never {
    return notWritten()
  }
  exploreFacets(): Promise<never> {
    return notWrittenLater()
  }
  siteAisles(): never {
    return notWritten()
  }
  searchFiltered(): Promise<never> {
    return notWrittenLater()
  }
  describeProductLists(): never {
    return notWritten()
  }
  validateSiteFilter(): Promise<never> {
    return notWrittenLater()
  }
}

function safePath(url: string): string {
  try {
    return new URL(url, 'https://x.invalid').pathname
  } catch {
    return ''
  }
}

/** Les redirections et le code HTTP du document, lus dans la mesure du navigateur (`PerformanceNavigationTiming`) : des nombres seulement. */
function navigationOf(win: Window & typeof globalThis): NavigationFacts | null {
  const entry = win.performance?.getEntriesByType?.('navigation')[0] as
    { redirectCount?: unknown; responseStatus?: unknown } | undefined
  if (!entry) return null
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
  const status = count(entry.responseStatus)
  return { redirects: count(entry.redirectCount), status: status === 0 ? null : status }
}

/** Les dépendances du navigateur : la page courante (lue en lecture seule), son `fetch` pris au démarrage et l'horloge réelle. */
export function browserDeps(
  win: Window & typeof globalThis,
  primitives: WindowPrimitives = takeWindowPrimitives(win),
): AuchanDeps {
  return {
    fetch: primitives.fetch,
    location: win.location,
    document: win.document,
    authenticated: () => {
      try {
        return win.sessionStorage.getItem('tracking_authenticated')
      } catch {
        return null
      }
    },
    navigation: () => navigationOf(win),
    cookies: () => win.document.cookie,
    storage: {
      getItem: (key) => {
        try {
          return win.sessionStorage.getItem(key)
        } catch {
          return null
        }
      },
      setItem: (key, value) => win.sessionStorage.setItem(key, value),
    },
    navigate: (url) => win.location.assign(url),
    parseHtml: primitives.parseHtml,
    sleep: (ms) => new Promise((resolve) => win.setTimeout(resolve, ms)),
    timer: (ms, fire) => {
      const id = win.setTimeout(fire, ms)
      return () => win.clearTimeout(id)
    },
    random: () => Math.random(),
    now: () => Date.now(),
  }
}
