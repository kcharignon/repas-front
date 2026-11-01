// La VERSION MOBILE de Leclerc (DRV-754, décision du propriétaire du 2026-11-01 : le drive ne fonctionne que sur téléphone, et ce qui ne se touche pas sur un
// téléphone ne se touche pas pour la personne). Les pages sont servies par `www` (accueil, choix du magasin) puis `m-courses.leclercdrive.fr/magasin-N-N-ville` (une
// application Angular, chemin sans `.aspx`) ; ses appels AJAX vont au serveur du magasin, `fd<N>-courses.leclercdrive.fr`, depuis une page d'un AUTRE hôte.
//
// FAITS MESURÉS le 2026-11-01 (vrai site, magasin d'essai public ; rapport DRV-754 du dépôt back) :
//   M1  recherche : `POST <serveur>/magasin-N-N/recherche-ajax.aspx?TexteRecherche=<mot>&idsupport=10&ng-ajax=1`, sans corps ni en-tête, session envoyée
//       (`credentials: 'include'`) : 200 JSON ; `lstProduits.lstElements[].objElement` porte le produit (mêmes champs que la page ordinateur, libellés avec des ENTITÉS HTML) ;
//   M2  l'ancienne recherche `GET recherche.aspx` échoue depuis `m-courses` (interdit entre hôtes) ;
//   M3  l'hôte `fd<N>` se lit dans les liens du pied de page de `m-courses` (`https://fd8-courses…/magasin-N-N-Ville/plan-du-site`) : jamais deviné ;
//   M4  écriture du panier : `POST <serveur>/magasin-N-N/panier.aspx?op=1&ng-ajax=1`, un champ de formulaire `d` (du JSON) ;
//   M5  lecture du panier : `POST …/panier.aspx?op=12&ng-ajax=1`, `d={"sNoPointLivraison":"<id>"}` : 200, un tableau d'évènements (`eTypeEvenement` 6) dont l'`objElement` est
//       le panier (`sType` « Panier », `iQuantitePanier`, `sTotalAPayer`, `lstProduitsLight[]`) ;
//   M6  juste après la connexion, `m-courses` demande « Souhaitez-vous compléter le panier en cours avec les articles du panier du … ? » (« Oui je souhaite compléter mon
//       panier » / « Non je ne souhaite pas compléter mon panier ») : l'agent ne choisit JAMAIS ; une barre basse « Dernière connexion le … » apparaît connecté.
//   M11 (relevé le 2026-11-01, produit 17313, magasin 654321, identique au clic sur « + ») la requête d'un ajout n'a AUCUN en-tête propre au site (pas de `zcwb`) :
//       Accept, Content-Type, Origin, Referer, … du navigateur ; corps `d=<JSON>` EXACTEMENT : `{"eTypeAction":1,"iIdProduit":17313,"iQuantite":1,"sNoPointLivraison":"654321",
//       "objContexteProvenanceArticle":{"eOrigine":9,"eTypePage":3,"niIdElement":null,"eVue":0,"sTexteRecherche":"Poireau","lIdDemande":null}}` (l'identifiant est un NOMBRE ; ce
//       contexte est celui d'un ajout depuis les résultats d'une recherche) ;
//   M12 la quantité est ABSOLUE (le total voulu au panier : un second clic envoie `iQuantite` 2, retirer envoie 0) ;
//   M13 la réponse d'un ajout : 4 évènements dans l'ordre : PRODUIT (`eTypeEvenement` 101 première fois, 103 changement, 102 retrait ; `objElement.iQuantitePanier` = la quantité
//       de CE produit au panier), RAYON (503), PANIER (1 : total d'articles, `sTotalAPayer`, `lstProduitsLight[]`), `PaniersComplets` (4) : `readMobileCartWrite` ;
//   M14 un produit refusé ou inconnu (`iIdProduit` 999999999) : 200 JSON, évènements produit 102 PUIS 106, `iQuantitePanier` 0, panier inchangé : « Leclerc n'a pas pris ce
//       produit » (`MobileCartReading.refused`) ;
//   M15 le `sNoPointLivraison` d'un ajout est le numéro du magasin, celui de `objElement.sNoPointLivraison` de la recherche.
// HYPOTHÈSES (non mesurées, à confirmer à la recette ; elles sont listées dans `drive-agent/README.md`) :
//   H4  tant que la question de l'ancien panier n'a pas de réponse, un ajout peut être refusé ou ignoré : l'agent le DÉTECTE (la question est dans la page) et dit « Leclerc
//       attend ton choix » ;
//   H6  la connexion se reconnaît à la barre basse « Dernière connexion le … » et à l'absence de « Connexion / Inscription » dans la page ;
//   H7  le pied de page de `m-courses` est dessiné quand la page a fini de charger (l'agent l'attend 10 s).
// Règles : l'agent n'écrit JAMAIS un identifiant ni un code, ne touche ni le hCaptcha, ni la case « plus de code sur cet appareil », ni les fenêtres d'aide, de consentement
// marketing, d'ajout à l'écran d'accueil ou de cookies, ni les deux boutons de la question de l'ancien panier.
import { parseJson, stringifyJson } from '../primitives'
import { RetailerError } from '../retailers/errors'
import { decodeEntities, extractProducts, type RawProduct } from './embedded'
import { INVISIBLE, visibleText } from './page-text'
import { SITE_STYLE } from './reply-shape'
import { hostFamily, isMobileHost, type LocationLike } from './store'

/** Une page du serveur qui est la version mobile (`mobile-detail-panier.aspx`) : l'agent y parle comme sur `m-courses`. */
const MOBILE_PAGE_NAME = /\/mobile-[a-z0-9_-]{1,40}\.aspx$/i

/** Vrai quand la page est celle de la version mobile : `m-courses`, ou une page `mobile-….aspx` du serveur du magasin. */
export function usesMobileProtocol(location: LocationLike): boolean {
  const host = location.hostname.toLowerCase()
  return (
    isMobileHost(host) || (hostFamily(host) !== null && MOBILE_PAGE_NAME.test(location.pathname))
  )
}

/** L'hôte du serveur lu dans la page : trouvé, absent, ou ambigu (deux hôtes différents : on ne choisit pas). */
export type ServerHostReading =
  | { kind: 'FOUND'; host: string; links: number }
  | { kind: 'MISSING'; links: number }
  | { kind: 'AMBIGUOUS'; links: number }

const HREF = /\bhref\s*=\s*(?:"([^"]{1,600})"|'([^']{1,600})')/gi

/**
 * L'hôte `fd<N>-courses` du serveur du magasin (M3), lu dans les LIENS de la page qui visent CE magasin (`/magasin-<id>-<id>…` des mêmes numéros que l'adresse de la page),
 * en `https` sur un hôte de la forme `fd<N>-courses.leclercdrive.fr` (le schéma et le port de la page : un faux site de test n'a ni l'un ni l'autre). Jamais deviné,
 * jamais tiré d'ailleurs que d'un lien.
 */
export function readServerHost(
  pageText: string,
  page: Pick<LocationLike, 'protocol' | 'port'>,
  store: { first: string; second: string },
): ServerHostReading {
  const hosts = new Set<string>()
  let links = 0
  const markup = pageText.replace(INVISIBLE, ' ')
  for (const found of markup.matchAll(HREF)) {
    const raw = decodeEntities(found[1] ?? found[2] ?? '').trim()
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    const path = /^\/magasin-(\d{1,12})-(\d{1,12})(?:-[^/?#]*)?(?:[/?#]|$)/i.exec(url.pathname)
    if (
      url.protocol !== (page.protocol ?? 'https:') ||
      url.port !== (page.port ?? '') ||
      url.username !== '' ||
      url.password !== '' ||
      hostFamily(url.hostname) === null ||
      path?.[1] !== store.first ||
      path?.[2] !== store.second
    ) {
      continue
    }
    links += 1
    hosts.add(url.hostname.toLowerCase())
  }
  const [only] = hosts
  if (hosts.size > 1) return { kind: 'AMBIGUOUS', links }
  return only === undefined ? { kind: 'MISSING', links } : { kind: 'FOUND', host: only, links }
}

const OLD_BASKET_YES = 'oui je souhaite completer mon panier'
const OLD_BASKET_NO = 'non je ne souhaite pas completer mon panier'

/**
 * La page pose-t-elle la question de l'ancien panier (M6) ? Les DEUX boutons y sont. Une lecture du texte visible, jamais un toucher : choisir « Oui » fusionne les articles
 * d'un ancien panier dans la commande, « Non » les écarte, et c'est à la personne de le dire.
 */
export function asksOldBasketChoice(pageText: string): boolean {
  const text = visibleText(pageText)
  return text.includes(OLD_BASKET_YES) && text.includes(OLD_BASKET_NO)
}

/** La barre basse « Dernière connexion le … » (M6) : un signe que la personne est connectée, jamais seul (voir `session.ts`). */
export function showsLastLogin(pageText: string): boolean {
  return visibleText(pageText).includes('derniere connexion le')
}

/** Un hôte (`fd8-courses.leclercdrive.fr`) devenu une origine : le schéma et le port de la page, comme le navigateur les voit. */
export function originOf(host: string, page: Pick<LocationLike, 'protocol' | 'port'>): string {
  const port = page.port === undefined || page.port === '' ? '' : `:${page.port}`
  return `${page.protocol ?? 'https:'}//${host}${port}`
}

/** Les requêtes de la version mobile : une adresse (complète, ou relative au serveur de la page) et ses options de `fetch`. */
export interface MobileRequest {
  url: string
  init: RequestInit
}

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } as const

/** M1 : la recherche. Un POST sans corps ni autre en-tête, comme celui que `m-courses` envoie (une requête simple : aucune pré-vérification entre hôtes). */
export function searchRequest(base: string, cartPath: string, query: string): MobileRequest {
  return {
    url: `${base}${cartPath}/recherche-ajax.aspx?TexteRecherche=${encodeURIComponent(query)}&idsupport=10&ng-ajax=1`,
    init: { method: 'POST' },
  }
}

/** Ce qu'une écriture du panier demande : le produit, la quantité visée AU TOTAL (0 retire), le point de livraison, le dernier mot cherché. */
export interface MobileCartRequest {
  productId: string
  quantity: number
  deliveryPoint: string
  searchText: string
}

/**
 * Le champ `d` d'une écriture (M11, M12), EXACTEMENT celui que l'application mobile envoie depuis les résultats d'une recherche : l'ordre des clés, l'identifiant en NOMBRE,
 * le contexte `eOrigine` 9, `eTypePage` 3, `niIdElement` et `lIdDemande` nuls. La quantité est le total voulu ; 0 retire (le `eTypeAction` d'un retrait n'a pas été relevé : la même
 * action que l'ajout, la quantité dit tout).
 */
export function cartPayload(request: MobileCartRequest): string {
  return stringifyJson({
    eTypeAction: 1,
    iIdProduit: Number(request.productId),
    iQuantite: request.quantity,
    sNoPointLivraison: request.deliveryPoint,
    objContexteProvenanceArticle: {
      eOrigine: 9,
      eTypePage: 3,
      niIdElement: null,
      eVue: 0,
      sTexteRecherche: request.searchText,
      lIdDemande: null,
    },
  })
}

/** M4, M11 : l'écriture du panier, un champ de formulaire `d`, aucun en-tête propre au site (pas de `zcwb`) : le type de contenu du formulaire seul. */
export function cartWriteRequest(
  base: string,
  cartPath: string,
  request: MobileCartRequest,
): MobileRequest {
  return {
    url: `${base}${cartPath}/panier.aspx?op=1&ng-ajax=1`,
    init: {
      method: 'POST',
      headers: { ...FORM },
      body: `d=${encodeURIComponent(cartPayload(request))}`,
    },
  }
}

/** M5 : la lecture du panier, `d={"sNoPointLivraison":"<id>"}`. Une lecture : elle n'écrit rien. */
export function cartReadRequest(
  base: string,
  cartPath: string,
  deliveryPoint: string,
): MobileRequest {
  return {
    url: `${base}${cartPath}/panier.aspx?op=12&ng-ajax=1`,
    init: {
      method: 'POST',
      headers: { ...FORM },
      body: `d=${encodeURIComponent(stringifyJson({ sNoPointLivraison: deliveryPoint }))}`,
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parse(text: string): unknown {
  try {
    return parseJson(text.trim())
  } catch {
    return undefined
  }
}

/**
 * Les produits de la réponse de recherche de la version mobile (M1), dans l'ordre de la liste. Un produit se lit comme ceux de la page ordinateur (même lecteur de champs :
 * entités HTML décodées, contenu net, prix, stock).
 *
 * @throws {RetailerError} `CONTRACT_CHANGED` avec sa cause : `SEARCH_NOT_JSON` (la réponse n'est pas du JSON), `SEARCH_NO_LIST` (pas de `lstProduits.lstElements`),
 *   `SEARCH_PRODUCTS_UNREADABLE` (des éléments, aucun produit lisible, ou un total annoncé sans élément). Une recherche sans résultat n'est pas une erreur : `[]`.
 */
export function readMobileSearch(text: string, status = 200): RawProduct[] {
  const parsed = parse(text)
  const root = asRecord(parsed)
  if (parsed === undefined) throw new RetailerError('CONTRACT_CHANGED', status, 'SEARCH_NOT_JSON')
  const list = asRecord(root?.lstProduits)?.lstElements
  if (!Array.isArray(list)) throw new RetailerError('CONTRACT_CHANGED', status, 'SEARCH_NO_LIST')
  const total = root?.iNbTotalProduits
  if (list.length === 0) {
    // Zéro élément alors que le site annonce des produits : la liste n'est pas là où on la lit, ce n'est pas « aucun résultat ».
    if (typeof total === 'number' && total > 0) {
      throw new RetailerError('CONTRACT_CHANGED', status, 'SEARCH_PRODUCTS_UNREADABLE')
    }
    return []
  }
  const products: RawProduct[] = []
  for (const element of list) {
    const object = asRecord(asRecord(element)?.objElement)
    if (object === null) continue
    const id = String(object.iIdProduit)
    const read = extractProducts(stringifyJson(object)).products.find((one) => one.id === id)
    if (read !== undefined) products.push(read)
  }
  if (products.length === 0) {
    throw new RetailerError('CONTRACT_CHANGED', status, 'SEARCH_PRODUCTS_UNREADABLE')
  }
  return products
}

/** Au plus autant de noms de clés dans la forme d'une réponse. */
const MAX_NAMES = 24

const shown = (names: string[]): string =>
  names
    .slice(0, MAX_NAMES)
    .map((name) => (SITE_STYLE.test(name) ? name : '?'))
    .join(', ') + (names.length > MAX_NAMES ? `, … (${names.length})` : '')

/**
 * La FORME d'une réponse de recherche, en une ligne, quand elle n'est pas lue (ou pour le diagnostic) : le genre du corps, les NOMS des clés du premier niveau et de
 * `lstProduits`, le nombre d'éléments. Jamais une valeur du site : un nom qui n'a pas le style de ceux du site est écrit `?`. « Leclerc a changé son site » ne se dit
 * jamais sans cette forme.
 */
export function describeSearchForm(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return 'corps vide'
  const parsed = parse(trimmed)
  if (parsed === undefined) return trimmed.startsWith('<') ? 'page HTML' : 'texte, pas du JSON'
  if (Array.isArray(parsed)) return `JSON : liste de ${parsed.length}`
  const root = asRecord(parsed)
  if (root === null) return 'JSON : une valeur seule'
  const products = root.lstProduits
  const inner = asRecord(products)
  const elements = inner?.lstElements
  const about = Array.isArray(products)
    ? `lstProduits : liste de ${products.length}`
    : inner === null
      ? 'lstProduits : absent'
      : `lstProduits : objet (${shown(Object.keys(inner))})${
          Array.isArray(elements)
            ? `, lstElements : liste de ${elements.length}`
            : ', sans lstElements'
        }`
  return `JSON : ${shown(Object.keys(root))} ; ${about}`
}
