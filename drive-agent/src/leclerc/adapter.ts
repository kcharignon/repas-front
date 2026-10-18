import { CART_HEADERS, cartBody, MAX_QUANTITY, readCartResponse, readPageTotal } from './cart'
import { type Candidate, toCandidate } from './candidate'
import { httpCause } from './causes'
import { LeclercError } from './errors'
import { type FetchFn, Pacer, type PacerDeps, type Reply } from './pacer'
import { readSearchPage } from './search-page'
import { looksLikeLoginPage, readSession, type SessionReading } from './session'
import {
  type LocationLike,
  readDeliveryPoint,
  readStorePaths,
  type StoreInfo,
  type StorePaths,
} from './store'

/** Ce que le site dit du panier après une écriture. */
export interface CartResult {
  productId: string
  /** La quantité que l'appelant a demandée. */
  requested: number
  /** La quantité envoyée au site : la demandée, plafonnée à 99 et au stock connu. */
  sent: number
  /** La quantité au panier d'après la réponse du site (`lstProduitsLight`). */
  obtained: number
  /** Vrai : le panier a la quantité envoyée. */
  ok: boolean
  /** Nombre d'articles du panier (`iQuantitePanier`), `null` si la réponse ne le dit pas. */
  items: number | null
  /** Total du panier en centimes (`sTotalAPayer`), `null` si la réponse ne le dit pas. */
  totalCents: number | null
  /** Le code HTTP de la réponse du site. */
  status: number
}

/** Tout ce qui est propre à une enseigne, derrière une interface : une autre enseigne ou un changement du site ne touche que ce dossier. */
export interface RetailerAdapter {
  /** Le magasin de la page courante. @throws {LeclercError} `UNSUPPORTED_PAGE` hors d'une page de magasin. */
  readStore(): StoreInfo
  /** Les produits que le site propose pour cette recherche, dans l'ordre de la page. */
  searchProducts(query: string): Promise<Candidate[]>
  /** Fixe la quantité du produit au panier (absolue : `0` le retire) et vérifie la réponse du site. */
  setCartQuantity(productId: string, quantity: number): Promise<CartResult>
  /** Le produit voulu parmi les résultats d'une recherche (stock, prix du jour), ou `null` s'il n'y figure pas. */
  readProductFromSearch(query: string, productId: string): Promise<Candidate | null>
  /** Le total du panier (centimes) lu dans la page de la dernière recherche, `null` si elle n'en portait pas ou s'il n'y a pas eu de recherche. */
  pageCartTotal(): number | null
  /** Ce que la page courante montre de la connexion de l'utilisateur (visiteur, client connecté ou inconnu). Aucune requête. */
  readSession(): SessionReading
}

export interface LeclercDeps extends PacerDeps {
  /** `window.fetch` : l'adaptateur n'envoie des requêtes qu'à l'hôte de la page (chemins relatifs). */
  fetch: FetchFn
  location: LocationLike
  /** Le texte de la page (pour y lire le point de livraison) ; appelé une fois. */
  pageText: () => string
  /** Le libellé du magasin lu dans la page, s'il y en a un. */
  readLabel?: () => string | null
}

const PRODUCT_ID = /^[0-9]{1,12}$/
const SEARCH_HEADERS = { Accept: 'text/html,application/xhtml+xml' }
/** Une redirection vers une page de connexion. */
const LOGIN_PATH = /connexion|identif|login|authent/i

/** L'adaptateur de l'enseigne E.Leclerc Drive : le site PC `fdN-courses.leclercdrive.fr`, seul contrat supporté. */
export class LeclercAdapter implements RetailerAdapter {
  private readonly deps: LeclercDeps
  private readonly pacer: Pacer
  private lastQuery = ''
  private pageTotal: number | null = null
  private deliveryPoint: string | null = null
  private readonly stocks = new Map<string, number>()

  constructor(deps: LeclercDeps) {
    this.deps = deps
    this.pacer = new Pacer(deps.fetch, deps)
  }

  readStore(): StoreInfo {
    return this.paths().store
  }

  async searchProducts(query: string): Promise<Candidate[]> {
    const text = query.trim()
    if (text === '') return []
    const { pagePath } = this.paths()
    const url = `${pagePath}/recherche.aspx?TexteRecherche=${encodeURIComponent(text)}`
    const reply = await this.pacer.request(url, { method: 'GET', headers: SEARCH_HEADERS })
    this.assertUsable(reply)
    const products = this.readSearch(reply)
    this.lastQuery = text
    this.pageTotal = readPageTotal(reply.text)
    const candidates = products.map(toCandidate)
    for (const candidate of candidates) {
      if (candidate.stock !== null) this.stocks.set(candidate.id, candidate.stock)
    }
    return candidates
  }

  async setCartQuantity(productId: string, quantity: number): Promise<CartResult> {
    if (!PRODUCT_ID.test(productId) || !Number.isInteger(quantity) || quantity < 0) {
      throw new RangeError('Produit ou quantité invalide.')
    }
    const { store, cartPath } = this.paths()
    const stock = this.stocks.get(productId)
    const sent = Math.min(
      quantity,
      MAX_QUANTITY,
      stock !== undefined && stock > 0 ? stock : MAX_QUANTITY,
    )
    this.deliveryPoint ??= readDeliveryPoint(this.deps.pageText(), store)
    const body = cartBody({
      productId,
      quantity: sent,
      deliveryPoint: this.deliveryPoint,
      searchText: this.lastQuery,
    })
    const reply = await this.pacer.request(`${cartPath}/panier.aspx?op=1`, {
      method: 'POST',
      headers: { ...CART_HEADERS },
      body,
    })
    this.assertUsable(reply)
    const { obtained, items, totalCents } = this.readCart(reply, productId)
    return {
      productId,
      requested: quantity,
      sent,
      obtained,
      ok: obtained === sent,
      items,
      totalCents,
      status: reply.status,
    }
  }

  /**
   * La page de recherche lue (ticket C : une page sans résultat est une liste vide, une structure inconnue est `CONTRACT_CHANGED` avec sa cause),
   * puis contrôlée : la page d'un visiteur non connecté arrête tout, même si elle porte des produits (ticket G).
   */
  private readSearch(reply: Reply): ReturnType<typeof readSearchPage> {
    let products
    try {
      products = readSearchPage(reply)
    } catch (error) {
      if (error instanceof LeclercError && error.code === 'CONTRACT_CHANGED')
        this.assertMember(reply)
      throw error
    }
    this.assertMember(reply)
    return products
  }

  /** @throws {LeclercError} `NOT_LOGGED_IN` si la réponse est la page d'un visiteur : rien ne s'écrit dans un panier anonyme. */
  private assertMember(reply: Reply): void {
    if (readSession(reply.text).state === 'VISITOR') {
      throw new LeclercError('NOT_LOGGED_IN', reply.status, 'SESSION_VISITOR')
    }
  }

  /** La réponse du panier lue ; une réponse illisible garde son code HTTP, pour le rapport du test automatique. */
  private readCart(reply: Reply, productId: string): ReturnType<typeof readCartResponse> {
    try {
      return readCartResponse(reply.text, productId)
    } catch (error) {
      if (!(error instanceof LeclercError)) throw error
      if (error.cause === 'CART_NOT_JSON' && looksLikeLoginPage(reply.text, false)) {
        throw new LeclercError('NOT_LOGGED_IN', reply.status, 'LOGIN_FORM')
      }
      throw error.withStatus(reply.status)
    }
  }

  pageCartTotal(): number | null {
    return this.pageTotal
  }

  readSession(): SessionReading {
    return readSession(this.deps.pageText())
  }

  async readProductFromSearch(query: string, productId: string): Promise<Candidate | null> {
    const candidates = await this.searchProducts(query)
    return candidates.find((candidate) => candidate.id === productId) ?? null
  }

  private paths(): StorePaths {
    return readStorePaths(this.deps.location, this.deps.readLabel?.() ?? null)
  }

  /**
   * Écarte les réponses qui ne sont pas une réponse du site à notre requête. Un 404 n'est pas un blocage (c'est une requête mal formée
   * ou une route disparue) ; seuls 403, 429 et la page de défi, traités par le `Pacer`, sont `BLOCKED`.
   */
  private assertUsable(reply: Reply): void {
    if (reply.status === 401) throw new LeclercError('NOT_LOGGED_IN', reply.status, 'HTTP_401')
    if (reply.redirected && LOGIN_PATH.test(safePath(reply.url))) {
      throw new LeclercError('NOT_LOGGED_IN', reply.status, 'LOGIN_REDIRECT')
    }
    if (reply.status >= 500) {
      throw new LeclercError('NETWORK', reply.status, httpCause(reply.status))
    }
    if (reply.status < 200 || reply.status >= 300) {
      throw new LeclercError('CONTRACT_CHANGED', reply.status, httpCause(reply.status))
    }
  }
}

function safePath(url: string): string {
  try {
    return new URL(url, 'https://x.invalid').pathname
  } catch {
    return ''
  }
}

/** Les dépendances du navigateur : la page courante (lue en lecture seule), son `fetch` et l'horloge réelle. */
export function browserDeps(win: Window & typeof globalThis): LeclercDeps {
  return {
    fetch: (input, init) => win.fetch(input, init),
    location: win.location,
    pageText: () => new win.XMLSerializer().serializeToString(win.document),
    sleep: (ms) => new Promise((resolve) => win.setTimeout(resolve, ms)),
    random: () => Math.random(),
    now: () => Date.now(),
  }
}
