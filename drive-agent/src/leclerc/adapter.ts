import {
  CART_HEADERS,
  cartBody,
  MAX_QUANTITY,
  readCartListing,
  readCartResponse,
  readMobileCartWrite,
  readPageTotal,
  type CartProductFacts,
} from './cart'
import {
  asksOldBasketChoice,
  cartReadRequest,
  cartWriteRequest,
  describeSearchForm,
  isServerOrigin,
  originOf,
  readMobileSearch,
  readServerHost,
  searchRequest,
  usesMobileProtocol,
  type ServerHostReading,
} from './mobile'
import { describeCartReply } from './mobile-reply'
import { aisleMenuFacts, type AisleMenuFacts, type PageLinks, readPageLinks } from './aisle-menu'
import {
  aisleChoices,
  aisleSamples,
  plausibleLabel,
  urlAisle,
  shownAisleText,
  shownAisleTexts,
  type AisleGrouping,
  type AisleSample,
  type ShownAisleTexts,
  type ShownFacet,
} from './aisle-labels'
import { type Candidate, toCandidate } from './candidate'
import {
  aisleBloc,
  allValues,
  countKeys,
  FILTER_KEY,
  chipCoherent,
  coherence,
  filterKeys,
  listCounts,
  productLists,
  type ProductLists,
  keyFor,
  validationTarget,
  type FilterForm,
  totalProducts,
  type ProbeAttempt,
  filterHrefsIn,
  filterLinks,
  filterLinkShape,
  filterLinkShapes,
  filterTemplate,
  freshValues,
  FRESH_PRODUCT,
  readFacets,
  universes,
  valueShape,
  type FacetExploration,
  type FacetMatch,
  type FacetValue,
  type FilteredProbe,
} from './facets'
import { cleanText } from '../text'
import { stringifyJson, takeWindowPrimitives, type WindowPrimitives } from '../primitives'
import { extractProducts } from './embedded'
import type { CartProbeFacts, CartReplyFacts } from '../retailers/cart-facts'
import { httpCause } from '../retailers/causes'
import {
  entryFacts,
  findStartButton,
  readEntry,
  type EntryFacts,
  type EntryReading,
  type StartButton,
} from './entry'
import { RetailerError } from '../retailers/errors'
import { type FetchFn, Pacer, type PacerDeps, type Reply, type RequestStats } from './pacer'
import {
  addressShape,
  type ArrivalFacts,
  type AttemptFacts,
  attemptOf,
  type CookieFacts,
  cookieFacts,
  deliveryFacts,
  describeSearchReply,
  type MobileFacts,
  type NavigationFacts,
  pagePhrases,
  type SearchFacts,
} from './probe'
import {
  aisleVocabulary,
  facetLabels,
  facetObjects,
  namedObjectKeys,
  replyShape,
  type NamedObjectKeys,
  type ReplyShape,
  type VocabularyKey,
} from './reply-shape'
import { readSearchPage } from './search-page'
import {
  applicable,
  buildSearch,
  FALLBACK_ORDER,
  SEARCH_VARIANTS,
  type DesktopVariant,
  type SearchContext,
} from './search-request'
import {
  describeSession,
  looksLikeLoginPage,
  LOGIN_CONTROL_LABELS,
  readSession,
  type SessionReading,
} from './session'
import { findControl, type GuideStep, type GuideTarget } from '../retailers/guide'
import { findPostalCodeField } from './store-field'
import {
  findDeliveryPoint,
  findSearchBase,
  hostFamily,
  type LocationLike,
  type PageStore,
  readDeliveryPoint,
  readPageStore,
  readStorePaths,
  type SearchBase,
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
  /** La disponibilité du produit que la réponse du panier donne (DRV-644), `null` quand elle n'en dit rien. */
  product?: CartProductFacts | null
  /**
   * Le code-barres du produit quand la réponse du panier le donne (DRV-725 : une enseigne dont le panier le donne ; Leclerc ne le donne pas). 8 à 14 chiffres ; absent sinon.
   * Rendu au résultat du choix (`ChosenProduct.ean`) pour que Repas le mémorise.
   */
  ean?: string
  /** Le code HTTP de la réponse du site. */
  status: number
}

/** Tout ce qui est propre à une enseigne, derrière une interface : une autre enseigne ou un changement du site ne touche que ce dossier. */
export interface RetailerAdapter {
  /**
   * Le magasin de la page courante. Leclerc le lit dans l'adresse de la page (synchrone, aucune requête) ; une enseigne dont le magasin ne s'y lit pas le
   * demande à son site (DRV-717 : une requête, donc une promesse) : l'appelant attend toujours le résultat.
   * @throws {RetailerError} `UNSUPPORTED_PAGE` hors d'une page de magasin (ou sans magasin choisi).
   */
  readStore(): StoreInfo | Promise<StoreInfo>
  /**
   * FACULTATIVE (DRV-740, DRV-753) : présente chez une enseigne dont le magasin se CHOISIT SUR LA PAGE du site (il n'est pas dans l'adresse), ou qui le fait choisir sur son
   * accueil avant tout magasin (la page montre « Commencer mes courses » une fois choisi : DRV-753). Dit si la page montre qu'un magasin est choisi. Une lecture de la page seule : aucune requête, jamais d'erreur. Le mode
   * configuration s'en sert quand `readStore` dit « aucun magasin choisi » : au lieu d'un écran d'erreur, il laisse la page utilisable et attend ce choix.
   */
  storeChosenOnPage?(): boolean
  /**
   * FACULTATIVE (DRV-751) : le contrôle de la page que la personne doit toucher pour une étape guidée (`store` : choisir son magasin, `login` : se connecter), avec
   * son libellé tel que la page l'écrit ; `null` quand la page ne le montre pas (ou que l'enseigne n'a pas cette étape sur la page). Une lecture de la page seule : aucune
   * requête, et l'agent ne touche jamais ce contrôle, il l'entoure seulement.
   */
  guideTarget?(step: GuideStep): GuideTarget | null
  /**
   * FACULTATIVE (DRV-751) : la page courante est-elle celle de CONNEXION de l'enseigne (par son adresse seulement) ? Sur cette page l'agent ne « entre » jamais dans
   * le magasin et ne dit pas de toucher « Se connecter » : la personne remplit le formulaire, que l'agent n'approche pas (le mot de passe se tape à la main).
   */
  onLoginPage?(): boolean
  /**
   * FACULTATIVE (DRV-754) : vrai chez une enseigne dont la page ne dit pas elle-même qu'on est connecté avant que la personne l'ait fait (la version mobile de Leclerc : ni
   * jeton, ni page de visiteur nette). Le passage n'écrit alors rien dans un panier tant que la page ne CONFIRME pas la connexion (`readSession().state === 'MEMBER'`) : un
   * état inconnu est une étape « connecte-toi », jamais un panier anonyme (ticket G). Absent : seul un visiteur reconnu arrête le passage.
   */
  readonly requiresConfirmedLogin?: boolean
  /**
   * FACULTATIVE (DRV-754) : la page demande-t-elle un choix à la personne avant tout (la question « compléter ton ancien panier ? » d'après la connexion) ? Une lecture de
   * la page seule. L'agent ne choisit JAMAIS à sa place : le passage attend, une carte le dit, et reprend dès que la question a disparu.
   */
  basketChoiceAsked?(): boolean
  /**
   * FACULTATIVE (DRV-754) : les cartes du guide se posent hors des boutons d'un mur de cookies (la version mobile montre une fenêtre modale à chaque premier usage). Absent :
   * seule la carte du choix du magasin le fait.
   */
  readonly keepClearOfConsent?: boolean
  /**
   * FACULTATIVE (DRV-748) : présente (et vraie) chez une enseigne dont l'accueil, après la connexion que la personne tape elle-même, montre de nouveau « Commencer
   * mes courses » alors que l'agent l'a déjà touché AVANT la connexion (le site avait répondu par sa page de connexion). Le passage peut alors faire une seconde
   * entrée, la dernière, session connectée (voir `Flow.enterStore`). Absente : une seule entrée par envoi et par onglet, comme avant.
   */
  readonly entersAfterLogin?: boolean
  /** Les produits que le site propose pour cette recherche, dans l'ordre de la page. */
  searchProducts(query: string): Promise<Candidate[]>
  /** Fixe la quantité du produit au panier (absolue : `0` le retire) et vérifie la réponse du site. */
  setCartQuantity(productId: string, quantity: number): Promise<CartResult>
  /** Le produit voulu parmi les résultats d'une recherche (stock, prix du jour), ou `null` s'il n'y figure pas. */
  readProductFromSearch(query: string, productId: string): Promise<Candidate | null>
  /**
   * La quantité de ce produit dans la dernière réponse du panier (ticket M : plancher de ce qu'on écrit quand la recherche ne donne pas la
   * quantité déjà au panier), `null` si cette réponse ne le cite pas ou s'il n'y en a pas eu. Aucune requête.
   */
  cartQuantity(productId: string): number | null
  /**
   * FACULTATIVE (DRV-732) : la quantité de ce produit au panier quand la recherche ne la donne pas. Elle LIT le panier si le passage ne l'a pas encore fait (une
   * requête, à la cadence, jamais en parallèle) puis répond depuis cette lecture, partagée entre les produits et rafraîchie par chaque écriture ; `null` quand le
   * panier est lu mais ne dit pas la quantité de cette ligne (jamais une quantité inventée). Absente (Leclerc : sa recherche dit la quantité), `putInCart` retombe
   * sur `cartQuantity`, sans requête.
   * @throws {RetailerError} l'erreur de la lecture du panier, à traiter comme celle d'une écriture.
   */
  readCartQuantity?(productId: string): Promise<number | null>
  /**
   * FACULTATIVE (DRV-752) : la sonde de lecture du panier du diagnostic, présente chez une enseigne dont le panier se lit à part (`GET /cart`).
   * UNE requête de lecture, à la cadence, jamais une écriture ; elle ne retient rien du panier et ne lève jamais d'erreur : elle rend la FORME de la réponse du
   * site (code, type, taille, noms d'en-têtes, mots d'une liste fermée) et le nombre de lignes quand le panier s'est lu. Absente (Leclerc : la réponse du
   * panier se lit à l'écriture), le diagnostic dit « sans objet ».
   */
  probeCart?(): Promise<CartProbeFacts>
  /**
   * FACULTATIVE (DRV-752) : la forme de la dernière réponse du panier qui a échoué, dans cette page ou, rechargement compris, dans cet onglet ; `null` s'il n'y
   * en a pas. Aucune requête.
   */
  lastCartFailure?(): CartReplyFacts | null
  /**
   * Les compteurs de la cadence depuis la création de l'adaptateur (ticket L) : requêtes, erreurs, blocages, délais dépassés, réponses lentes, plus
   * longue pause. Des nombres seulement. Cumulatifs : un passage en prend la différence entre son début et sa fin.
   */
  stats(): RequestStats
  /** Le total du panier (centimes) lu dans la page de la dernière recherche, `null` si elle n'en portait pas ou s'il n'y a pas eu de recherche. */
  pageCartTotal(): number | null
  /** Ce que la page courante montre de la connexion de l'utilisateur (visiteur, client connecté ou inconnu). Aucune requête. */
  readSession(): SessionReading
  /** Ce que la page d'arrivée laisse voir pour le diagnostic (ticket B) : formes et nombres seulement. Aucune requête. */
  readArrival(): ArrivalFacts
  /**
   * Ce que la dernière recherche a laissé voir de la réponse du site (ticket B) : code, type, longueur, formes d'adresse, noms de clés et
   * d'en-têtes, jamais une valeur. `null` avant toute recherche ou si la dernière n'a pas eu de réponse.
   */
  lastSearchFacts(): SearchFacts | null
  /**
   * Sonde, pour le diagnostic, les variantes de la requête de recherche que la dernière recherche n'a pas essayées (chacune un GET, à la cadence
   * normale) et rend toutes les tentatives, dans l'ordre des variantes. Ne retient aucune variante et ne lève jamais d'erreur.
   */
  exploreSearchVariants(query: string): Promise<AttemptFacts[]>
  /**
   * L'accueil du magasin (DRV-625, DRV-629) : « Commencer mes courses » dans la page, soit un lien vérifié comme menant à une page du magasin
   * `store`, soit un bouton sans adresse que le DOM permet de cliquer (`BUTTON`). Aucune requête. Garde ce qu'il faut pour `followEntry`.
   */
  readEntry(store: { id: string }): EntryReading
  /**
   * Suit le lien que `readEntry` vient de vérifier, ou clique le bouton qu'il vient de trouver, à la cadence des autres actions (une pause
   * entière d'abord). La page quitte le script : la promesse ne se résout que si la page est restée là (navigation refusée, clic sans effet)
   * après `ENTRY_WAIT_MS`. Sans lien ni bouton vérifié, ne fait rien et se résout aussitôt. Aucune écriture.
   */
  followEntry(): Promise<void>
  /**
   * Le menu des rayons de la page en cours (DRV-647, étape 0) : les liens de rayon, leur identifiant et leur libellé de catalogue, et les clés de l'état
   * de la page qui parlent de rayon ou de filtre. Lu dans le DOM tel qu'il est : aucune requête, aucun clic.
   */
  readAisleMenu(): AisleMenuFacts
  /**
   * La forme de l'état embarqué de la dernière réponse de recherche (DRV-647, étape 0) : noms des clés du premier niveau et d'un produit, chemin
   * jusqu'aux produits, clés qui parlent de rayon ou de filtre. Aucune requête ; `null` avant toute recherche ou sans produit.
   */
  describeLastReply(): ReplyFacts | null
  /**
   * Les groupes présents dans ces produits (DRV-647), au niveau (rayon ou famille) où le site les nomme, du plus fourni au moins fourni : identifiant, libellé (`null` s'il n'en a pas de
   * lisible) et nombre de produits. Lu dans ce qui est déjà reçu (les produits, la dernière réponse, la page) : aucune requête.
   */
  aisleChoices(candidates: readonly Candidate[]): AisleGrouping
  /**
   * Pour le diagnostic (DRV-647) : jusqu'à [max] produits de [candidates] aux paires (rayon, famille) distinctes, avec ce que le site leur joint pour nommer
   * leur rayon (`objFiltreBloc`, `sUrlVoirRayon`, `sCategorie`), rendu sûr. Aucune requête.
   */
  aisleSamples(candidates: readonly Candidate[], max: number): AisleSample[]
  /**
   * Pour le diagnostic (DRV-647, agent 0.35.0) : la facette « Rayons » de la dernière réponse (celle de [term], dont [candidates] sont les produits), la
   * correspondance de ses valeurs avec les rayons et familles de produits échantillons, la forme du paramètre `Filtres` dans les liens déjà reçus, la
   * pagination et les univers ; puis, SEULEMENT si un lien de recherche filtrée montre la forme de l'adresse, UNE recherche de [term] filtrée sur la valeur
   * « fruits / légumes » de la facette (à défaut la première), à la cadence normale, lecture seule. Jamais deux requêtes ; aucune erreur n'en sort.
   */
  exploreFacets(term: string, candidates: readonly Candidate[]): Promise<FacetExploration | null>
  /**
   * Les rayons du site que la facette « Rayons » de la dernière réponse de recherche propose (DRV-647, 0.36.0) : clé de filtre (`sIdValeurUrl`, forme
   * `N-N`), libellé du site, nombre de références, enfants. Vide sans facette lisible. Aucune requête.
   */
  siteAisles(): SiteAisle[]
  /**
   * UNE recherche de [query] filtrée sur le rayon du site [key] (une clé de `siteAisles`), à la cadence normale ; ne change pas ce que l'adaptateur retient
   * de la dernière recherche. @throws {RetailerError} comme `searchProducts`.
   */
  searchFiltered(
    query: string,
    key: string,
  ): Promise<{ candidates: Candidate[]; total: number | null; coherent: boolean }>
  /**
   * Pour le diagnostic (DRV-647, 0.38.0) : les listes de produits de premier niveau de la dernière réponse (`objContenu`, `objContenuMDD`,
   * `objContenuGroupeVariantes`, `lstTrade`…), ce qu'elles contiennent, et la valeur « fruits / légumes » de la facette. Aucune requête.
   */
  describeProductLists():
    | (ProductLists & {
        freshFacet: {
          label: string | null
          references: number | null
          children: { label: string | null; references: number | null }[]
        } | null
      })
    | null
  /**
   * Valide la forme de `Filtres` (DRV-647, 0.37.0) sur la facette de la dernière réponse de [query] : trois formes au plus, la première COHÉRENTE avec la
   * valeur demandée est retenue pour le reste du passage. Une seule fois par adaptateur ; les appels suivants rendent le même résultat. Jamais une erreur.
   */
  validateSiteFilter(query: string): Promise<boolean>
}

/** Un rayon du site, lu dans sa facette « Rayons » (DRV-647, 0.36.0). */
export interface SiteAisle {
  /** La clé de filtre du site (`sIdValeurUrl`). */
  key: string
  label: string | null
  count: number | null
  children: SiteAisle[]
}

/** Ce que la dernière réponse de recherche laisse voir de sa structure (DRV-647) : des noms de clés et des nombres. */
export interface ReplyFacts {
  shape: ReplyShape | null
  vocabulary: VocabularyKey[]
  /** Étape 1 : les textes du rayon du premier produit (valeurs du catalogue, rendues sûres par le diagnostic), `null` sans produit. */
  firstAisleTexts?: ShownAisleTexts | null
  /** Les NOMS des clés d'un `objFiltreBloc` de la réponse et du premier niveau de `objNavigationRayonFamille` de la page. */
  filterBlock?: NamedObjectKeys | null
  pageNavigation?: NamedObjectKeys | null
  /** Les objets de filtre ou de rayon de la réponse, hors des produits (8 au plus) : clés, identifiants, libellés rendus sûrs. */
  facets?: ShownFacet[]
}

export interface LeclercDeps extends PacerDeps {
  /** `window.fetch` : l'adaptateur n'envoie des requêtes qu'à l'hôte de la page (chemins relatifs). */
  fetch: FetchFn
  location: LocationLike
  /** Le texte de la page : le point de livraison s'y lit une fois ; `readSession` le relit à chaque appel (sans requête). */
  pageText: () => string
  /** Le libellé du magasin lu dans la page, s'il y en a un. */
  readLabel?: () => string | null
  /** Ce que le navigateur sait de la navigation qui a amené sur la page (redirections, code HTTP) ; `null` s'il ne le dit pas. */
  navigation?: () => NavigationFacts | null
  /** Les cookies lisibles par la page : un nombre et un oui/non, jamais un nom ni une valeur. */
  cookies?: () => CookieFacts | null
  /** Ouvre une adresse dans la page (`location.assign`) : suivre le lien « Commencer mes courses ». Absente, `followEntry` ne fait rien. */
  navigate?: (url: string) => void
  /** Le bouton « Commencer mes courses » sans adresse de la page, à cliquer (DRV-629). Absent, un tel bouton n'est pas touché. */
  startButton?: () => StartButton | null
  /** Les liens de la page et le bloc du menu « Rayons », lus dans le DOM (DRV-647). Absente, la page n'a aucun lien. */
  pageLinks?: () => PageLinks
  /** Le lien ou bouton « Se connecter » de la page (DRV-751), à entourer. Absent, l'agent n'en désigne aucun. */
  loginControl?: () => GuideTarget | null
  /** Le champ du code postal de l'accueil, où l'on choisit son magasin (DRV-753), à entourer. Absent, l'agent n'en désigne aucun. */
  storeField?: () => GuideTarget | null
}

/** Le temps laissé à une navigation pour quitter la page avant de la dire sans effet (le clic ou le lien d'entrée, 0.39.0 : l'utilisateur ne doit pas attendre davantage). */
export const ENTRY_WAIT_MS = 3_000

/** Le temps qu'on laisse au pied de page de `m-courses` pour se dessiner (hypothèse H7), et le rythme de relecture : des lectures du DOM, aucune requête. */
export const SERVER_HOST_WAIT_MS = 10_000
const SERVER_HOST_POLL_MS = 500

const PRODUCT_ID = /^[0-9]{1,12}$/
/** La ville du chemin du magasin (`/magasin-N-N-<Ville>`) : un libellé de rayon qui la porte est écarté. */
const STORE_CITY = /^\/magasin-\d{1,12}-\d{1,12}-([^/?#]+)/i
/**
 * L'adresse d'une page de connexion du site (le chemin seulement) : `/connexion(.aspx)` du site ordinateur, et celles de la version mobile (mesurées le 2026-11-01) :
 * `…/drive/magasin-N-N-Ville/authentification.aspx` (la connexion, la même page pendant la fenêtre du code reçu par e-mail) et `creation-compte-ccc.aspx` (où mène d'abord
 * « Connexion / Inscription » de `m-courses`).
 */
const LOGIN_PAGE =
  /(?:^|\/)(?:connexion(?:\.aspx)?|authentification\.aspx|creation-compte[a-z0-9-]*\.aspx)(?:\/|$)/i
/** Une redirection vers une page de connexion. */
const LOGIN_PATH = /connexion|identif|login|authent/i

/** L'adaptateur de l'enseigne E.Leclerc Drive : le site PC `fdN-courses.leclercdrive.fr`, seul contrat supporté. */
export class LeclercAdapter implements RetailerAdapter {
  /** Leclerc : l'accueil peut montrer le bouton avant la connexion (le toucher mène alors à la connexion) et de nouveau après : l'entrée se refait une fois (DRV-748). */
  readonly entersAfterLogin = true
  private readonly deps: LeclercDeps
  private readonly pacer: Pacer
  private lastQuery = ''
  private pageTotal: number | null = null
  private deliveryPoint: string | null = null
  /** La forme de requête de recherche qui a passé la dernière fois : celle d'abord essayée ensuite (aucune avant la première). */
  private searchVariant: DesktopVariant | null = null
  /** Le chemin avec la ville que la page donne, une fois trouvé (la page ne change pas de magasin pendant la vie de l'agent). */
  private searchBase: SearchBase | null = null
  private facts: SearchFacts | null = null
  /** Le texte de la dernière réponse de recherche, gardé en mémoire seulement pour `describeLastReply` (remplacé à chaque recherche). */
  private lastReplyText: string | null = null
  /** La validation de la forme de `Filtres` (DRV-647, 0.37.0) : lancée une fois, gardée pour la vie de l'adaptateur (le passage). */
  private filterCheck: Promise<boolean> | null = null
  /** La forme de `Filtres` validée, `null` : aucune (ou pas encore). */
  private filterForm: FilterForm | null = null
  /** Les valeurs de facette des rayons proposés, par clé de la rangée. */
  private readonly siteValues = new Map<string, FacetValue>()
  /** Les libellés de rayon lus hors des produits dans la dernière réponse (DRV-647), calculés une fois par réponse, à la demande. */
  private replyFacets: { text: string; labels: Map<number, string[]> } | null = null
  /** Ceux de la page (DRV-647) : la page ne change pas pendant la vie de l'agent, ils sont lus une fois, à la demande. */
  private pageFacets: Map<number, string[]> | null = null
  /** L'adresse que `readEntry` a vérifiée en dernier, `null` sans lien sûr : la seule que `followEntry` suive. */
  private entryUrl: string | null = null
  /** Le bouton que `readEntry` a trouvé en dernier, `null` sans bouton : le seul que `followEntry` clique. */
  private entryButton: StartButton | null = null
  private readonly stocks = new Map<string, number>()
  /** Les quantités de la dernière réponse du panier lisible (ticket M), `null` avant la première. */
  private cartLines: ReadonlyMap<string, number> | null = null
  /** La page est celle de la version mobile (DRV-754) : l'agent parle comme l'application mobile (`mobile.ts`). */
  private readonly mobile: boolean
  /** L'hôte du serveur du magasin (`fd<N>-courses`), une fois lu ; d'où il vient et combien de liens du magasin la page portait. */
  private serverHost: string | null = null
  private serverSource: MobileFacts['serverHost'] | null = null
  private serverLinks = 0
  /** La forme de la dernière réponse du panier qui a échoué (DRV-752), en mémoire pour la vie de la page. */
  private failure: CartReplyFacts | null = null
  readonly requiresConfirmedLogin?: boolean
  readonly keepClearOfConsent?: boolean
  probeCart?: () => Promise<CartProbeFacts>
  lastCartFailure?: () => CartReplyFacts | null
  basketChoiceAsked?: () => boolean

  constructor(deps: LeclercDeps) {
    this.deps = deps
    // Une requête hors de l'hôte de la page ne part que vers le serveur du magasin (`fd<N>-courses`), jugé ICI par l'enseigne
    this.pacer = new Pacer(deps.fetch, {
      ...deps,
      allowsOrigin: (origin) => isServerOrigin(origin, deps.location),
    })
    this.mobile = usesMobileProtocol(deps.location)
    // La PREUVE de la connexion avant toute écriture, sur TOUT adaptateur de Leclerc (DRV-754) : un état de session inconnu n'écrit jamais dans un panier anonyme
    this.requiresConfirmedLogin = true
    if (this.mobile) {
      this.keepClearOfConsent = true
      this.probeCart = () => this.probeMobileCart()
      this.lastCartFailure = () => this.failure
      this.basketChoiceAsked = () => this.oldBasketAsked()
    }
  }

  readStore(): StoreInfo | Promise<StoreInfo> {
    return this.mobile ? this.readMobileStore() : this.paths().store
  }

  // —— La version mobile (DRV-754, `mobile.ts`) ————————————————————————————————————————————————————————————————————————————————

  /** La page pose-t-elle la question de l'ancien panier ? Une lecture de la page, jamais une erreur. */
  private oldBasketAsked(): boolean {
    try {
      return asksOldBasketChoice(this.deps.pageText())
    } catch {
      return false
    }
  }

  /**
   * Le magasin de la version mobile : les numéros de l'adresse de la page, l'hôte du SERVEUR lu dans ses liens. Une question d'ancien panier posée est une étape de la
   * personne, pas une erreur de page : `BASKET_MERGE_ASKED` (le guide l'attend).
   */
  private async readMobileStore(): Promise<StoreInfo> {
    if (this.oldBasketAsked())
      throw new RetailerError('UNSUPPORTED_PAGE', null, 'BASKET_MERGE_ASKED')
    const page = readPageStore(this.deps.location)
    const host = await this.mobileHost(page)
    return {
      id: page.id,
      host,
      baseUrl: `https://${host}${page.cartPath}`,
      label: this.deps.readLabel?.() ?? null,
    }
  }

  /**
   * L'hôte du serveur du magasin : celui de la page quand elle est sur lui, sinon celui de ses liens (le pied de page de `m-courses`), attendu jusqu'à
   * `SERVER_HOST_WAIT_MS` (la page Angular se dessine après son chargement). Jamais deviné : sans lien (`PAGE_SERVER_HOST`) ou avec deux hôtes différents, l'erreur.
   */
  private async mobileHost(page: PageStore): Promise<string> {
    if (this.serverHost !== null) return this.serverHost
    const own = this.deps.location.hostname.toLowerCase()
    if (hostFamily(own) !== null) {
      this.serverSource = 'PAGE'
      return (this.serverHost = own)
    }
    const read = (): ServerHostReading =>
      readServerHost(this.deps.pageText(), this.deps.location, {
        first: page.id,
        second: page.second,
      })
    let reading = read()
    for (
      let waited = 0;
      reading.kind === 'MISSING' && waited < SERVER_HOST_WAIT_MS;
      waited += SERVER_HOST_POLL_MS
    ) {
      await this.deps.sleep(SERVER_HOST_POLL_MS)
      reading = read()
    }
    this.serverLinks = reading.links
    if (reading.kind === 'FOUND') {
      this.serverSource = 'FOOTER'
      return (this.serverHost = reading.host)
    }
    this.serverSource = reading.kind
    throw new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_SERVER_HOST')
  }

  /** Où partent les appels de la version mobile : le chemin du magasin sans ville, et l'origine du serveur quand ce n'est pas la page (`undefined` : l'hôte de la page). */
  private async mobileTarget(): Promise<{
    base: string
    origin: string | undefined
    cartPath: string
    id: string
  }> {
    const page = readPageStore(this.deps.location)
    const host = await this.mobileHost(page)
    const same = host === this.deps.location.hostname.toLowerCase()
    const origin = same ? undefined : originOf(host, this.deps.location)
    return { base: origin ?? '', origin, cartPath: page.cartPath, id: page.id }
  }

  /** La recherche de la version mobile (M1) : un POST au serveur du magasin, une réponse JSON, des produits lus comme ceux de la page ordinateur. */
  private async searchMobile(text: string): Promise<Candidate[]> {
    const target = await this.mobileTarget()
    const { url, init } = searchRequest(target.base, target.cartPath, text)
    const reply = await this.pacer.request(url, init, target.origin)
    this.lastReplyText = reply.text
    const facts = describeSearchReply('m', reply, url, target.id)
    facts.attempts = [attemptOf('m', reply, url)]
    facts.form = describeSearchForm(reply.text)
    // La connexion est celle de la PAGE (l'en-tête de `m-courses`), pas de la réponse JSON
    facts.session = describeSession(readSession(this.deps.pageText()))
    this.facts = facts
    let products
    try {
      this.assertUsable(reply)
      products = readMobileSearch(reply.text, reply.status)
    } catch (error) {
      facts.outcome = 'FAILED'
      facts.phrases = pagePhrases(reply.text)
      if (error instanceof RetailerError) facts.fault = { code: error.code, cause: error.cause }
      else facts.fault = { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION' }
      throw error
    }
    facts.products = products.length
    facts.outcome = products.length > 0 ? 'PRODUCTS' : 'EMPTY'
    if (products.length === 0) facts.phrases = pagePhrases(reply.text)
    this.lastQuery = text
    this.pageTotal = null
    this.deliveryPoint ??= findDeliveryPoint(reply.text)
    const candidates = products.map((raw) => toCandidate(raw, this.deps.location))
    for (const candidate of candidates) {
      if (candidate.stock !== null) this.stocks.set(candidate.id, candidate.stock)
    }
    return candidates
  }

  /**
   * L'écriture du panier de la version mobile (M4, M11 à M15) : jamais tant que la page attend le choix de l'ancien panier ; la réponse est lue sur la forme MESURÉE (`readMobileCartWrite`),
   * et toute erreur porte la FORME de la réponse. Une écriture sans effet ou une réponse illisible pendant que la question est posée est `BASKET_MERGE_ASKED` (H4) : « Leclerc
   * attend ton choix », jamais « le site a changé ».
   */
  private async writeMobile(
    productId: string,
    quantity: number,
    sent: number,
  ): Promise<CartResult> {
    if (this.oldBasketAsked())
      throw new RetailerError('UNSUPPORTED_PAGE', null, 'BASKET_MERGE_ASKED')
    // La session est relue (le DOM seul) AVANT CHAQUE écriture : un client devenu visiteur en cours de passage n'écrit plus rien (ticket G)
    if (this.readSession().state !== 'MEMBER') {
      throw new RetailerError('NOT_LOGGED_IN', null, 'SESSION_VISITOR')
    }
    const target = await this.mobileTarget()
    const { url, init } = cartWriteRequest(target.base, target.cartPath, {
      productId,
      quantity: sent,
      deliveryPoint: this.deliveryPoint ?? target.id,
      searchText: this.lastQuery,
    })
    const reply = await this.pacer.request(url, init, target.origin)
    const shape = describeCartReply(reply)
    let read
    try {
      this.assertUsable(reply)
      read = this.readMobileWrite(reply, productId, sent)
    } catch (error) {
      this.failure = shape
      if (error instanceof RetailerError) {
        // Seule une écriture sans effet ou une réponse de forme inattendue se dit « attend ton choix » : jamais une session perdue ni un blocage
        const unchanged = error.code === 'CONTRACT_CHANGED' || error.code === 'NETWORK'
        if (unchanged && this.oldBasketAsked()) {
          throw new RetailerError(
            'UNSUPPORTED_PAGE',
            reply.status,
            'BASKET_MERGE_ASKED',
            undefined,
            shape,
          )
        }
        throw error.withReply(shape)
      }
      throw error
    }
    this.cartLines = read.quantities
    if (read.obtained !== sent && this.oldBasketAsked()) {
      this.failure = shape
      throw new RetailerError(
        'UNSUPPORTED_PAGE',
        reply.status,
        'BASKET_MERGE_ASKED',
        undefined,
        shape,
      )
    }
    return {
      productId,
      requested: quantity,
      sent,
      obtained: read.obtained,
      ok: read.obtained === sent,
      items: read.items,
      totalCents: read.totalCents,
      ...(read.product && { product: read.product }),
      status: reply.status,
    }
  }

  /** La réponse d'une écriture de la version mobile lue (M13, M14) ; une page de connexion servie à la place est `NOT_LOGGED_IN`, une réponse illisible garde son code HTTP. */
  private readMobileWrite(
    reply: Reply,
    productId: string,
    requested: number,
  ): ReturnType<typeof readMobileCartWrite> {
    try {
      return readMobileCartWrite(reply.text, productId, requested)
    } catch (error) {
      if (!(error instanceof RetailerError)) throw error
      if (error.cause === 'CART_NOT_JSON' && looksLikeLoginPage(reply.text, false)) {
        throw new RetailerError('NOT_LOGGED_IN', reply.status, 'LOGIN_FORM')
      }
      throw error.withStatus(reply.status)
    }
  }

  /** La sonde de lecture du panier du diagnostic (M5) : UN POST de lecture, jamais une écriture ; elle ne retient rien du panier et ne lève jamais d'erreur. */
  private async probeMobileCart(): Promise<CartProbeFacts> {
    try {
      const target = await this.mobileTarget()
      const { url, init } = cartReadRequest(
        target.base,
        target.cartPath,
        this.deliveryPoint ?? target.id,
      )
      const reply = await this.pacer.request(url, init, target.origin)
      const shape = describeCartReply(reply)
      try {
        this.assertUsable(reply)
        const listing = readCartListing(reply.text)
        return { outcome: 'READ', reply: shape, lines: listing.quantities.size, fault: null }
      } catch (error) {
        return {
          outcome: 'FAILED',
          reply: shape,
          lines: null,
          fault:
            error instanceof RetailerError
              ? { code: error.code, cause: error.cause, status: error.status ?? reply.status }
              : { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION', status: reply.status },
        }
      }
    } catch (error) {
      return {
        outcome: 'FAILED',
        reply: null,
        lines: null,
        fault:
          error instanceof RetailerError
            ? { code: error.code, cause: error.cause, status: error.status }
            : { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION', status: null },
      }
    }
  }

  /** Ce que la page de la version mobile laisse voir pour le diagnostic : d'où vient l'hôte du serveur, les liens du magasin, la question de l'ancien panier, la connexion. */
  private mobileFacts(): MobileFacts {
    let serverHost = this.serverSource
    let links = this.serverLinks
    if (serverHost === null) {
      try {
        const page = readPageStore(this.deps.location)
        if (hostFamily(this.deps.location.hostname.toLowerCase()) !== null) serverHost = 'PAGE'
        else {
          const reading = readServerHost(this.deps.pageText(), this.deps.location, {
            first: page.id,
            second: page.second,
          })
          serverHost = reading.kind === 'FOUND' ? 'FOOTER' : reading.kind
          links = reading.links
        }
      } catch {
        serverHost = 'MISSING'
      }
    }
    return {
      serverHost,
      links,
      oldBasketQuestion: this.oldBasketAsked(),
      session: describeSession(readSession(this.deps.pageText())),
    }
  }

  async searchProducts(query: string): Promise<Candidate[]> {
    const text = query.trim()
    if (text === '') return []
    this.facts = null
    this.lastReplyText = null
    if (this.mobile) return this.searchMobile(text)
    const paths = this.paths()
    const { reply, variant, url, attempts } = await this.requestSearch(text, paths)
    this.lastReplyText = reply.text
    const facts = describeSearchReply(variant, reply, url, paths.store.id)
    facts.attempts = attempts
    this.facts = facts
    let products
    try {
      this.assertUsable(reply)
      products = this.readSearch(reply)
    } catch (error) {
      facts.outcome = 'FAILED'
      facts.phrases = pagePhrases(reply.text)
      if (error instanceof RetailerError) facts.fault = { code: error.code, cause: error.cause }
      else facts.fault = { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION' }
      throw error
    }
    facts.products = products.length
    facts.outcome = products.length > 0 ? 'PRODUCTS' : 'EMPTY'
    if (products.length === 0) facts.phrases = pagePhrases(reply.text)
    if (reply.status >= 200 && reply.status < 300) this.searchVariant = variant
    this.lastQuery = text
    this.pageTotal = readPageTotal(reply.text)
    const candidates = products.map((raw) => toCandidate(raw, this.deps.location))
    for (const candidate of candidates) {
      if (candidate.stock !== null) this.stocks.set(candidate.id, candidate.stock)
    }
    return candidates
  }

  /**
   * La recherche, avec son repli : la requête courante (ou la dernière forme qui a passé), et tant que le site répond HTTP 400 (recette réelle
   * du 2026-10-18 : un GET qui passait la veille dans un essai jetable répondait 400), chacune des autres formes une fois (`search-request.ts`), une
   * requête à la fois à la cadence normale. Toute autre réponse arrête le repli. Les tentatives sont notées pour le diagnostic.
   */
  private async requestSearch(
    text: string,
    paths: StorePaths,
  ): Promise<{ reply: Reply; variant: DesktopVariant; url: string; attempts: AttemptFacts[] }> {
    const context = this.searchContext(paths)
    const kept = this.searchVariant
    const order =
      kept === null ? [...FALLBACK_ORDER] : [kept, ...FALLBACK_ORDER.filter((v) => v !== kept)]
    const attempts: AttemptFacts[] = []
    const seen = new Set<string>()
    let last: { reply: Reply; variant: DesktopVariant; url: string } | null = null
    for (const variant of order) {
      if (!applicable(variant, context)) continue
      const { url, init } = buildSearch(variant, context, text)
      // Deux formes qui donnent la même requête (une adresse sans ville : e1 et e2 sont la requête courante) ne sont pas rejouées.
      const key = `${url}\n${stringifyJson(init)}`
      if (seen.has(key)) continue
      seen.add(key)
      const reply = await this.pacer.request(url, init)
      attempts.push(attemptOf(variant, reply, url))
      last = { reply, variant, url }
      if (reply.status !== 400) break
    }
    if (last === null) throw new RetailerError('CONTRACT_CHANGED', null, 'EXCEPTION')
    return { ...last, attempts }
  }

  /**
   * Ce que la page donne pour bâtir les adresses de recherche. Le chemin avec la ville est lu dans la page (formulaire de recherche du site, à défaut
   * premier lien) : la page est sérialisée, ce qui coûte, donc tant qu'il n'est pas trouvé et une fois par recherche seulement.
   */
  private searchContext(paths: StorePaths): SearchContext {
    const base = this.searchBaseOf(paths)
    return {
      pagePath: paths.pagePath,
      cartPath: paths.cartPath,
      pathname: this.deps.location.pathname,
      linkPath: base?.path ?? null,
    }
  }

  private searchBaseOf(paths: StorePaths): SearchBase | null {
    this.searchBase ??= findSearchBase(this.deps.pageText(), paths.cartPath)
    return this.searchBase
  }

  readArrival(): ArrivalFacts {
    let storeId: string | null = null
    let searchBase: ArrivalFacts['searchBase'] = null
    try {
      const paths = this.paths()
      storeId = paths.store.id
      const base = this.searchBaseOf(paths)
      if (base) searchBase = { shape: addressShape(base.path), source: base.source }
    } catch {
      // Hors d'un magasin : rien à comparer.
    }
    let navigation: NavigationFacts | null = null
    try {
      navigation = this.deps.navigation?.() ?? null
    } catch {
      // Le navigateur ne le dit pas.
    }
    let cookies: CookieFacts | null = null
    try {
      cookies = this.deps.cookies?.() ?? null
    } catch {
      // La page ne les dit pas.
    }
    return {
      address: addressShape(this.deps.location.pathname),
      redirects: navigation?.redirects ?? null,
      status: navigation?.status ?? null,
      delivery: deliveryFacts(this.deps.pageText(), storeId),
      cookies,
      searchBase,
      entry: this.entryFacts(),
      ...(this.mobile && { mobile: this.mobileFacts() }),
    }
  }

  /** Les formes de « Commencer mes courses » : le texte de la page, et le DOM pour savoir si le bouton se clique vraiment. */
  private entryFacts(): EntryFacts {
    const facts = entryFacts(this.deps.pageText(), this.deps.location)
    const button = this.findButton() !== null
    // Le texte de la page ne montre pas toujours un bouton que le DOM a (attributs très longs, élément qui n'est ni lien ni bouton) : le DOM tranche.
    if (!facts.start.present && button) {
      return { start: { present: true, shape: null, where: null }, clickable: true }
    }
    return { ...facts, clickable: facts.clickable && button }
  }

  private findButton(): StartButton | null {
    try {
      return this.deps.startButton?.() ?? null
    } catch {
      return null
    }
  }

  readEntry(store: { id: string }): EntryReading {
    let reading = readEntry(this.deps.pageText(), this.deps.location, store.id)
    this.entryUrl = reading.kind === 'LINK' ? reading.url : null
    this.entryButton = null
    if (reading.kind === 'BUTTON') {
      // Le texte de la page dit « bouton » : encore faut-il le trouver, cliquable, dans le DOM.
      this.entryButton = this.findButton()
      if (this.entryButton === null) reading = { kind: 'REFUSED' }
    } else if (reading.kind === 'NONE') {
      // Le texte de la page n'en montre pas (élément qui n'est ni lien ni bouton, attributs très longs) : le DOM peut avoir le bouton à toucher.
      this.entryButton = this.findButton()
      if (this.entryButton !== null) reading = { kind: 'BUTTON' }
    }
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

  lastSearchFacts(): SearchFacts | null {
    return this.facts
  }

  readAisleMenu(): AisleMenuFacts {
    let links: PageLinks = { menu: false, links: [] }
    try {
      links = this.deps.pageLinks?.() ?? links
    } catch {
      // Le DOM ne se laisse pas lire : aucun lien.
    }
    return aisleMenuFacts(links, this.deps.location, this.deps.pageText())
  }

  describeLastReply(): ReplyFacts | null {
    const text = this.lastReplyText
    if (text === null) return null
    let pageNavigation: NamedObjectKeys | null = null
    try {
      pageNavigation = namedObjectKeys(this.deps.pageText(), 'objNavigationRayonFamille')
    } catch {
      // La page ne se laisse pas lire.
    }
    const firstProduct = extractProducts(text).products[0]
    return {
      shape: replyShape(text),
      vocabulary: aisleVocabulary(text),
      firstAisleTexts:
        firstProduct === undefined ? null : shownAisleTexts(firstProduct.aisleTexts, this.city()),
      filterBlock: namedObjectKeys(text, 'objFiltreBloc'),
      pageNavigation,
      facets: facetObjects(text, 8).map((facet): ShownFacet => ({
        keys: facet.keys,
        total: facet.total,
        ids: facet.ids,
        label: shownAisleText(facet.label, this.city()),
        block: shownAisleText(facet.block, this.city()),
      })),
    }
  }

  aisleSamples(candidates: readonly Candidate[], max: number): AisleSample[] {
    return aisleSamples(candidates, max, this.city())
  }

  async exploreFacets(
    term: string,
    candidates: readonly Candidate[],
  ): Promise<FacetExploration | null> {
    const text = this.lastReplyText
    // Le filtre par rayon (`Filtres`) n'a jamais été mesuré sur la version mobile : aucune sonde, aucune requête (DRV-754)
    if (text === null || this.mobile) return null
    const city = this.city()
    const safe = (label: string | null): string | null => {
      const shown = shownAisleText(label, city)
      return shown.kind === 'TEXT' ? shown.text : null
    }
    let pageText = ''
    try {
      pageText = this.deps.pageText()
    } catch {
      // La page ne se laisse pas lire.
    }
    const tree = readFacets(text)
    const rayons = aisleBloc(tree)
    const known = allValues(tree.values)
    const matchOf = (id: number | null): FacetMatch | null => {
      if (id === null) return null
      const found = known.find(({ value }) => value.id === id)
      return found === undefined ? null : { id, label: safe(found.value.label), depth: found.depth }
    }
    const seen = new Set<string>()
    const samples: FacetExploration['samples'] = []
    for (const candidate of candidates) {
      const pair = `${candidate.aisle}|${candidate.family}`
      if (samples.length >= 6 || seen.has(pair)) continue
      seen.add(pair)
      samples.push({
        aisle: candidate.aisle,
        family: candidate.family,
        aisleMatch: matchOf(candidate.aisle),
        familyMatch: matchOf(candidate.family),
      })
    }
    const { hostname, pathname } = this.deps.location
    let pageHrefs: string[] = []
    try {
      pageHrefs = (this.deps.pageLinks?.().links ?? []).map((link) => link.href)
    } catch {
      // Le DOM ne se laisse pas lire.
    }
    const pageLinks = filterLinks(pageHrefs, hostname, pathname)
    const replyLinks = filterLinks(filterHrefsIn(text), hostname, pathname)
    let cartPath = ''
    try {
      cartPath = this.paths().cartPath
    } catch {
      // Hors d'un magasin.
    }
    const values = rayons?.values ?? []
    const template = filterTemplate(
      [...replyLinks, ...pageLinks],
      values.length > 0 ? values : tree.values,
      cartPath,
    )
    const fresh = freshValues(values)
    // La même valeur que la validation de l'écran (0.37.0) : la plus fournie qui a des enfants lisibles, à défaut la plus fournie.
    const target = validationTarget(values)
    let probe: FacetExploration['probe']
    if (values.length === 0)
      probe = { skipped: tree.values.length === 0 ? 'NO_FACET' : 'NO_TARGET' }
    else if (target === null) probe = { skipped: 'NO_FILTER_KEY' }
    else probe = await this.probeFiltered(term, target, totalProducts(text), safe)
    // UNE requête de plus (0.38.0) : la valeur « fruits / légumes » avec la forme retenue, si elle n'est pas déjà celle de la validation.
    const freshTarget = fresh.find(({ depth }) => depth === 0)?.value ?? null
    let freshProbe: FilteredProbe | null = null
    if (
      'retained' in probe &&
      probe.retained !== null &&
      freshTarget !== null &&
      freshTarget.id !== target?.id
    ) {
      const tried = await this.tryForms(
        term,
        freshTarget,
        totalProducts(text),
        safe,
        probe.retained,
      )
      freshProbe = { target: { id: freshTarget.id, label: safe(freshTarget.label) }, ...tried }
    }
    return {
      blocs: tree.blocs.map((bloc) => ({
        id: bloc.id,
        label: safe(bloc.label),
        values: bloc.values,
      })),
      aisleBloc:
        rayons === null
          ? null
          : {
              id: rayons.bloc.id,
              label: safe(rayons.bloc.label),
              total: rayons.values.length,
              values: rayons.values.slice(0, 40).map((value, index) => ({
                id: value.id,
                label: safe(value.label),
                references: value.references,
                children: value.children.length,
                ...(index < 5 && {
                  urlId: value.urlId === null ? null : valueShape(value.urlId, city),
                  urlHasId: value.urlId !== null && value.urlId.includes(String(value.id)),
                  childLabels: value.children.slice(0, 6).map((child) => safe(child.label)),
                }),
              })),
            },
      fresh: fresh.slice(0, 5).map(({ value, depth }) => ({
        id: value.id,
        label: safe(value.label),
        references: value.references,
        depth,
      })),
      samples,
      links: {
        page: { count: pageLinks.length, shapes: filterLinkShapes(pageLinks, city) },
        reply: { count: replyLinks.length, shapes: filterLinkShapes(replyLinks, city) },
      },
      urlIdShapes: [
        ...new Set(
          values.flatMap((value) => (value.urlId === null ? [] : [valueShape(value.urlId, city)])),
        ),
      ].slice(0, 5),
      template:
        'miss' in template
          ? template
          : { shape: filterLinkShape(template.link, city), kind: template.kind },
      probe,
      freshProbe,
      pagination: { reply: countKeys(text), page: countKeys(pageText) },
      universes: { reply: universes(text), page: universes(pageText) },
    }
  }

  /** Le diagnostic (DRV-647, 0.37.0) : les formes essayées sur [target], comme la validation de l'écran, sans rien retenir pour le passage. */
  private async probeFiltered(
    term: string,
    target: FacetValue,
    before: number | null,
    safe: (label: string | null) => string | null,
  ): Promise<FilteredProbe> {
    const { attempts, retained, address } = await this.tryForms(term, target, before, safe)
    return { target: { id: target.id, label: safe(target.label) }, attempts, retained, address }
  }

  /**
   * Les formes de `Filtres` essayées sur [target] (DRV-647, 0.37.0), dans l'ordre (i) `sIdValeurUrl`, (ii) `iIdBloc-iIdValeur`, (iii) `iIdValeur-iIdBloc` (formes
   * distinctes bâties sur les valeurs lues), en s'arrêtant à la première COHÉRENTE avec la valeur (`coherence`) ou à une erreur du site : trois requêtes au
   * plus, par le `Pacer`. [before] : `iNbTotalProduits` de la recherche sans filtre. Jamais une erreur.
   */
  private async tryForms(
    term: string,
    target: FacetValue,
    before: number | null,
    safe: (label: string | null) => string | null,
    only?: FilterForm,
  ): Promise<{ attempts: ProbeAttempt[]; retained: FilterForm | null; address: string | null }> {
    const attempts: ProbeAttempt[] = []
    let address: string | null = null
    const city = this.city()
    const childLabels = target.children.flatMap((child) =>
      child.label === null || child.label.trim() === '' ? [] : [child.label],
    )
    for (const { form, key } of filterKeys(target).filter(
      (one) => only === undefined || one.form === only,
    )) {
      const attempt: ProbeAttempt = {
        form,
        value: valueShape(key, city),
        status: null,
        before,
        total: null,
        references: target.references,
        products: null,
        coherence: null,
        families: [],
        first: null,
      }
      attempts.push(attempt)
      try {
        const { url, reply } = await this.filteredRequest(term, key)
        address = filterLinkShape(
          {
            path: url.split('?', 1)[0] ?? '',
            params: new URLSearchParams(url.split('?')[1] ?? ''),
            filtres: key,
          },
          city,
        )
        attempt.status = reply.status
        attempt.total = totalProducts(reply.text)
        const ok = reply.status >= 200 && reply.status < 300
        const candidates = ok
          ? readSearchPage(reply).map((raw) => toCandidate(raw, this.deps.location))
          : []
        const groupLabels = candidates.map((candidate) => {
          const found = urlAisle(candidate.aisleTexts?.url, city)
          return found !== null && found.id === candidate.family ? found.label : null
        })
        const grouping = aisleChoices(candidates, { city })
        const first = candidates[0]
        attempt.products = candidates.length
        // D'où viennent les produits de la réponse filtrée (DRV-647, 0.38.0) : leur nombre dans chaque liste.
        attempt.lists = ok ? listCounts(reply.text) : []
        attempt.families = grouping.choices
          .slice(0, 5)
          .map(({ id, label, count }) => ({ id, label, count }))
        attempt.first =
          first === undefined
            ? null
            : {
                label: safe(cleanText(first.label).slice(0, 60)),
                fresh: FRESH_PRODUCT.test(first.label),
              }
        attempt.coherence = coherence({
          status: reply.status,
          products: candidates.length,
          before,
          after: attempt.total,
          references: target.references,
          childLabels,
          groupLabels,
        })
        if (!ok) attempt.fault = httpCause(reply.status)
        if (attempt.coherence.valid) return { attempts, retained: form, address }
      } catch (error) {
        attempt.fault =
          error instanceof RetailerError
            ? `${error.code}${error.cause === null ? '' : ` (${error.cause})`}`
            : 'EXCEPTION'
        // Une erreur du site (blocage, réseau) arrête l'essai des formes.
        break
      }
    }
    return { attempts, retained: null, address }
  }

  async validateSiteFilter(query: string): Promise<boolean> {
    if (this.mobile) return false
    if (this.filterCheck !== null) return this.filterCheck
    const text = this.lastReplyText
    const target =
      text === null ? null : validationTarget(aisleBloc(readFacets(text))?.values ?? [])
    if (text === null || target === null) return false
    const before = totalProducts(text)
    this.filterCheck = this.tryForms(query.trim(), target, before, (label) => label).then(
      ({ retained }) => {
        this.filterForm = retained
        return retained !== null
      },
      () => false,
    )
    return this.filterCheck
  }

  /**
   * La requête d'une recherche filtrée (DRV-647, 0.36.0) : le chemin du magasin SANS ville (la forme de recherche `e1`, qui répond sur le vrai site),
   * `TexteRecherche` puis `Filtres`, avec les en-têtes de la forme de recherche retenue, par le `Pacer`. [key] est une clé de filtre lue dans la réponse
   * (`FILTER_KEY` : `N-N`), jamais une donnée de l'utilisateur. Ne change rien de ce que l'adaptateur retient de la dernière recherche.
   */
  private async filteredRequest(
    query: string,
    key: string,
  ): Promise<{ url: string; reply: Reply }> {
    if (!FILTER_KEY.test(key)) throw new RetailerError('CONTRACT_CHANGED', null, 'EXCEPTION')
    const context = this.searchContext(this.paths())
    const base = buildSearch('e1', context, query).url
    const { init } = buildSearch(this.searchVariant ?? 'a', context, query)
    const url = `${base}&Filtres=${encodeURIComponent(key)}`
    return { url, reply: await this.pacer.request(url, init) }
  }

  async searchFiltered(
    query: string,
    aisle: string,
  ): Promise<{ candidates: Candidate[]; total: number | null; coherent: boolean }> {
    // La forme validée pour ce passage, appliquée à la valeur de facette du rayon : sans forme validée, aucune requête filtrée.
    const value = this.siteValues.get(aisle)
    const key =
      value === undefined || this.filterForm === null ? null : keyFor(value, this.filterForm)
    if (key === null) throw new RetailerError('CONTRACT_CHANGED', null, 'EXCEPTION')
    const { reply } = await this.filteredRequest(query.trim(), key)
    this.assertUsable(reply)
    const candidates = this.readSearch(reply).map((raw) => toCandidate(raw, this.deps.location))
    for (const candidate of candidates) {
      if (candidate.stock !== null) this.stocks.set(candidate.id, candidate.stock)
    }
    // Le résultat est-il celui de CE rayon (0.38.0) : la moitié des produits dans ses enfants, ou un nombre proche de ses références ?
    const city = this.city()
    const coherent = chipCoherent({
      products: candidates.length,
      references: value?.references ?? null,
      childLabels: (value?.children ?? []).flatMap((child) =>
        child.label === null ? [] : [child.label],
      ),
      groupLabels: candidates.map((candidate) => {
        const found = urlAisle(candidate.aisleTexts?.url, city)
        return found !== null && found.id === candidate.family ? found.label : null
      }),
    })
    return { candidates, total: totalProducts(reply.text), coherent }
  }

  describeProductLists(): ReturnType<RetailerAdapter['describeProductLists']> {
    const text = this.lastReplyText
    if (text === null) return null
    const city = this.city()
    const safe = (label: string | null): string | null => {
      const shown = shownAisleText(label, city)
      return shown.kind === 'TEXT' ? shown.text : null
    }
    const fresh =
      freshValues(aisleBloc(readFacets(text))?.values ?? []).find(({ depth }) => depth === 0)
        ?.value ?? null
    return {
      ...productLists(text, city, safe),
      freshFacet:
        fresh === null
          ? null
          : {
              label: safe(fresh.label),
              references: fresh.references,
              children: fresh.children
                .slice(0, 6)
                .map((child) => ({ label: safe(child.label), references: child.references })),
            },
    }
  }

  siteAisles(): SiteAisle[] {
    const text = this.lastReplyText
    if (text === null || this.mobile) return []
    const rayons = aisleBloc(readFacets(text))
    const city = this.city()
    const shown = (values: readonly FacetValue[]): SiteAisle[] =>
      values.flatMap((value) => {
        if (filterKeys(value).length === 0) return []
        // La clé d'un rayon de la rangée : la valeur de la facette (la forme de `Filtres` vient de la validation du passage).
        const key = `${value.bloc ?? ''}|${value.id}`
        this.siteValues.set(key, value)
        return [
          {
            key,
            label: plausibleLabel(value.label, city),
            count: value.references,
            children: shown(value.children),
          },
        ]
      })
    return shown(rayons?.values ?? [])
  }

  /** La ville du chemin de la page (`/magasin-N-N-<Ville>`), `null` sans elle. */
  private city(): string | null {
    return STORE_CITY.exec(this.deps.location.pathname)?.[1] ?? null
  }

  aisleChoices(candidates: readonly Candidate[]): AisleGrouping {
    const text = this.lastReplyText
    if (text !== null && this.replyFacets?.text !== text) {
      this.replyFacets = { text, labels: facetLabels(text) }
    }
    if (this.pageFacets === null) {
      try {
        this.pageFacets = facetLabels(this.deps.pageText())
      } catch {
        this.pageFacets = new Map()
      }
    }
    return aisleChoices(candidates, {
      city: this.city(),
      ...(this.replyFacets && text !== null && { reply: this.replyFacets.labels }),
      page: this.pageFacets,
    })
  }

  async exploreSearchVariants(query: string): Promise<AttemptFacts[]> {
    const facts = this.facts
    const text = query.trim()
    if (facts === null || text === '') return []
    // La version mobile n'a qu'une forme de recherche, mesurée : aucune variante à sonder
    if (this.mobile) return [...facts.attempts]
    try {
      const paths = this.paths()
      const context = this.searchContext(paths)
      const seen = new Set(
        facts.attempts.flatMap((attempt) => {
          if (attempt.variant === 'm') return []
          const { url, init } = buildSearch(attempt.variant, context, text)
          return [`${url}\n${stringifyJson(init)}`]
        }),
      )
      for (const variant of SEARCH_VARIANTS) {
        if (variant === 'm') continue
        if (facts.attempts.some((attempt) => attempt.variant === variant)) continue
        if (!applicable(variant, context)) continue
        const { url, init } = buildSearch(variant, context, text)
        const key = `${url}\n${stringifyJson(init)}`
        if (seen.has(key)) continue
        seen.add(key)
        const reply = await this.pacer.request(url, init)
        facts.attempts.push(attemptOf(variant, reply, url))
      }
    } catch {
      // Un blocage ou un réseau coupé pendant la sonde l'arrête : la sonde n'est jamais une erreur.
    }
    facts.attempts.sort(
      (a, b) => SEARCH_VARIANTS.indexOf(a.variant) - SEARCH_VARIANTS.indexOf(b.variant),
    )
    return [...facts.attempts]
  }

  async setCartQuantity(productId: string, quantity: number): Promise<CartResult> {
    if (!PRODUCT_ID.test(productId) || !Number.isInteger(quantity) || quantity < 0) {
      throw new RangeError('Produit ou quantité invalide.')
    }
    const stock = this.stocks.get(productId)
    const sent = Math.min(
      quantity,
      MAX_QUANTITY,
      stock !== undefined && stock > 0 ? stock : MAX_QUANTITY,
    )
    if (this.mobile) return this.writeMobile(productId, quantity, sent)
    const { store, cartPath } = this.paths()
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
    const { obtained, items, totalCents, quantities, product } = this.readCart(reply, productId)
    this.cartLines = quantities
    return {
      productId,
      requested: quantity,
      sent,
      obtained,
      ok: obtained === sent,
      items,
      totalCents,
      ...(product && { product }),
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
      if (error instanceof RetailerError && error.code === 'CONTRACT_CHANGED')
        this.assertMember(reply)
      throw error
    }
    this.assertMember(reply)
    return products
  }

  /** @throws {RetailerError} `NOT_LOGGED_IN` si la réponse est la page d'un visiteur : rien ne s'écrit dans un panier anonyme. */
  private assertMember(reply: Reply): void {
    if (readSession(reply.text).state === 'VISITOR') {
      throw new RetailerError('NOT_LOGGED_IN', reply.status, 'SESSION_VISITOR')
    }
  }

  /** La réponse du panier lue ; une réponse illisible garde son code HTTP, pour le rapport du test automatique. */
  private readCart(reply: Reply, productId: string): ReturnType<typeof readCartResponse> {
    try {
      return readCartResponse(reply.text, productId)
    } catch (error) {
      if (!(error instanceof RetailerError)) throw error
      if (error.cause === 'CART_NOT_JSON' && looksLikeLoginPage(reply.text, false)) {
        throw new RetailerError('NOT_LOGGED_IN', reply.status, 'LOGIN_FORM')
      }
      throw error.withStatus(reply.status)
    }
  }

  pageCartTotal(): number | null {
    return this.pageTotal
  }

  cartQuantity(productId: string): number | null {
    return this.cartLines?.get(productId) ?? null
  }

  stats(): RequestStats {
    return this.pacer.stats()
  }

  /** La page de connexion de Leclerc : `/connexion` ou `/connexion.aspx`, à la racine de l'hôte ou sous le chemin d'un magasin (le même repère que `RetailerSite.loginPath` de l'application). */
  onLoginPage(): boolean {
    return LOGIN_PAGE.test(this.deps.location.pathname)
  }

  /**
   * Chez Leclerc le magasin se lit dans l'adresse, mais il se CHOISIT sur l'accueil (DRV-753) : « Commencer mes courses » n'y apparaît qu'une fois un magasin choisi.
   * La page dit donc qu'un magasin est choisi quand elle montre ce bouton (ou un lien vers le magasin, ou un défi : la lecture de l'entrée n'est pas « rien »). Une lecture
   * de la page seule, aucune requête, jamais d'erreur. Le magasin du plan n'est pas jugé ici (`readStore` le fait, par l'adresse).
   */
  storeChosenOnPage(): boolean {
    try {
      return (
        readEntry(this.deps.pageText(), this.deps.location, '').kind !== 'NONE' ||
        this.findButton() !== null
      )
    } catch {
      return false
    }
  }

  /** Le contrôle à désigner : le champ du code postal de l'accueil (`store`, jamais touché ni rempli), ou le lien « Se connecter » (`login`). */
  guideTarget(step: GuideStep): GuideTarget | null {
    try {
      return step === 'login'
        ? (this.deps.loginControl?.() ?? null)
        : (this.deps.storeField?.() ?? null)
    } catch {
      return null
    }
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
}

function safePath(url: string): string {
  try {
    return new URL(url, 'https://x.invalid').pathname
  } catch {
    return ''
  }
}

/** Les dépendances du navigateur : la page courante (lue en lecture seule), son `fetch` et l'horloge réelle. */
export function browserDeps(
  win: Window & typeof globalThis,
  primitives: WindowPrimitives = takeWindowPrimitives(win),
): LeclercDeps {
  return {
    fetch: primitives.fetch,
    location: win.location,
    navigate: (url) => win.location.assign(url),
    startButton: () => findStartButton(win.document),
    pageLinks: () => readPageLinks(win.document),
    loginControl: () => findControl(win.document, LOGIN_CONTROL_LABELS),
    storeField: () => findPostalCodeField(win.document),
    pageText: () => new win.XMLSerializer().serializeToString(win.document),
    navigation: () => navigationOf(win),
    cookies: () => cookiesOf(win),
    sleep: (ms) => new Promise((resolve) => win.setTimeout(resolve, ms)),
    timer: (ms, fire) => {
      const id = win.setTimeout(fire, ms)
      return () => win.clearTimeout(id)
    },
    random: () => Math.random(),
    now: () => Date.now(),
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

/** Le compte des cookies lisibles par la page et la présence d'un cookie anti-robot (voir `cookieFacts` : jamais un nom ni une valeur). */
function cookiesOf(win: Window & typeof globalThis): CookieFacts | null {
  try {
    return cookieFacts(win.document.cookie)
  } catch {
    return null
  }
}
