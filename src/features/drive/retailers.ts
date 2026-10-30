import { STORE_HOST } from '@drive-protocol'

import type { components } from '@/api/schema'

/** L'identifiant d'une enseigne, celui du contrat de l'API (`Retailer`). */
export type RetailerId = components['schemas']['Retailer']

export interface StoreAddress {
  /** L'identifiant du magasin chez l'enseigne : pour Leclerc, le premier groupe de chiffres de l'adresse, zéros initiaux conservés ; pour Auchan, un identifiant lu par l'application. */
  id: string
  /** L'adresse de base du magasin, celle que le back enregistre. */
  baseUrl: string
}

/**
 * D'où vient l'identifiant du magasin (`storeIdSource` du contrat) : `URL` : il se lit dans l'adresse du magasin (Leclerc) ; `EXPLICIT` : l'adresse est une
 * constante de l'enseigne, le magasin est un identifiant que l'application lit dans la page de l'enseigne (Auchan).
 */
export type StoreIdSource = 'URL' | 'EXPLICIT'

/**
 * Une enseigne de drive pour le web. Les champs jusqu'à `offerIdPattern` sont ceux du contrat commun des couches (`docs/drive/samples/retailers.sample.json`
 * du back, vérifiés par `retailers.spec.ts`) ; les suivants sont propres au web.
 */
export interface Retailer {
  id: RetailerId
  /** Le nom, tel qu'on le dit : « Leclerc ». */
  name: string
  /** Le nom avec « de » devant, élision comprise : « de Leclerc » (« d’Auchan »). Jamais construit par concaténation. */
  nameDe: string
  /** L'adresse de base d'un magasin, en entier (motif du contrat). */
  storeAddressPattern: string
  /** Un exemple d'adresse de magasin, factice. */
  storeAddressExample: string
  /** L'identifiant d'un produit chez l'enseigne (motif du contrat). */
  productIdPattern: string
  /** D'où vient l'identifiant du magasin (contrat DRV-720). */
  storeIdSource: StoreIdSource
  /** La forme de l'identifiant du magasin (motif du contrat). */
  storeIdPattern: string
  /**
   * L'identifiant d'offre d'un produit chez l'enseigne (motif du contrat, DRV-722), ou `null` quand l'enseigne n'a pas d'offre : le site n'envoie alors jamais
   * `offerId` à l'agent ni à Repas.
   */
  offerIdPattern: string | null
  /** Le nom de l'application officielle de l'enseigne, dit quand le panier est prêt (DRV-645). */
  appName: string
  /**
   * L'accueil du drive : session ouverte, il affiche l'accueil du magasin de l'utilisateur, d'où le panier est à une touche. Dans l'application,
   * ce lien s'ouvre dans l'écran du drive (connecté), jamais dans le navigateur du téléphone (DRV-625). C'est aussi le repli de « Finaliser »
   * quand l'application ne connaît pas encore le chemin du magasin.
   */
  homeUrl: string
  /**
   * Lit une adresse de magasin déjà analysée (https, sans port ni identifiants) : le magasin et son adresse de base, ou `null`. Une enseigne dont le
   * magasin est explicite (`storeIdSource` `EXPLICIT`) rend toujours `null` : son magasin ne se lit pas dans une adresse.
   */
  readStore: (url: URL) => StoreAddress | null
  /**
   * L'adresse du site MOBILE de l'enseigne, déjà analysée (https, sans port ni identifiants), ramenée à ce que l'application ouvre en mode ordinateur
   * (DRV-741) : l'enseigne la redirige alors vers la bonne adresse de magasin. `null` si ce n'est pas une adresse de magasin du site mobile, et toujours
   * `null` pour une enseigne sans site mobile à refuser. Elle ne dit jamais le magasin : seule la page finale, lue par l'agent, le fait (l'hôte du
   * magasin ne se devine pas).
   */
  readMobileStoreAddress: (url: URL) => string | null
  /** L'adresse « Finaliser » d'un magasin pour l'application, d'après son adresse de base enregistrée ; `null` si elle n'est pas lisible. */
  finalizeStoreUrl: (storeBaseUrl: URL) => string | null
  /**
   * L'adresse de la recherche d'un produit sur le site de l'enseigne, d'après l'adresse de base du magasin enregistré : le repli « Chercher à la
   * main » (DRV-710), quand l'envoi automatique n'est pas possible. Le texte cherché est encodé ici.
   */
  searchUrl: (storeBaseUrl: string, query: string) => string
}

/** `/magasin-N-N`, avec ou sans ville : les deux numéros du magasin, sans le reste de l'adresse. */
const LECLERC_STORE_IDS = /^\/(magasin-\d{1,12}-\d{1,12})(?:-[^/?#]*)?(?:\/|$)/

/** Le site mobile de Leclerc : un premier nom `m` ou `m-…` (`m-courses.leclercdrive.fr`), comme l'agent et l'application le reconnaissent. */
const LECLERC_MOBILE_HOST = /^m(?:-[a-z0-9-]*)?\./
/** `/magasin-N-N[-ville][.aspx]`, suivi au besoin d'un chemin : le segment du magasin, sans le `.aspx`. */
const LECLERC_MOBILE_STORE =
  /^\/(magasin-\d{1,12}-\d{1,12}(?:-[A-Za-z0-9%_-]{1,100})?)(?:\.aspx)?(?:\/.*)?$/

/** `/magasin-N-N[-ville][.aspx]` (DRV-742), suivi au besoin d'un chemin : seuls les deux numéros (groupes 1 et 2) sont gardés, ni la ville (3) ni `.aspx` (4). */
const LECLERC_DESKTOP_STORE =
  /^\/magasin-(\d{1,12})-(\d{1,12})(-[A-Za-z0-9%_-]{1,100})?(\.aspx)?(?:\/.*)?$/

const leclerc: Retailer = {
  id: 'leclerc',
  name: 'Leclerc',
  nameDe: 'de Leclerc',
  storeAddressPattern: '^https://[a-z0-9-]+\\.leclercdrive\\.fr/magasin-([0-9]+)-([0-9]+)$',
  storeAddressExample: 'https://exemple.leclercdrive.fr/magasin-123456-123456',
  productIdPattern: '^[0-9]{1,12}$',
  storeIdSource: 'URL',
  storeIdPattern: '^[0-9]{1,20}$',
  offerIdPattern: null,
  appName: 'Leclerc Drive',
  homeUrl: 'https://www.leclercdrive.fr/',
  readStore: (url) => {
    if (!STORE_HOST.test(url.hostname)) return null
    const path = LECLERC_DESKTOP_STORE.exec(url.pathname)
    if (path === null) return null
    // Une adresse mobile avec ville ou .aspx va par `readMobileStoreAddress` (DRV-741) : son hôte n'est jamais enregistré
    if ((path[3] !== undefined || path[4] !== undefined) && LECLERC_MOBILE_HOST.test(url.hostname))
      return null

    return {
      id: path[1] as string,
      baseUrl: `https://${url.hostname}/magasin-${path[1]}-${path[2]}`,
    }
  },
  readMobileStoreAddress: (url) => {
    if (!STORE_HOST.test(url.hostname) || !LECLERC_MOBILE_HOST.test(url.hostname)) return null
    const path = LECLERC_MOBILE_STORE.exec(url.pathname)

    return path === null ? null : `https://${url.hostname}/${path[1]}`
  },
  finalizeStoreUrl: (url) => {
    const store = LECLERC_STORE_IDS.exec(url.pathname)

    return url.protocol !== 'https:' || store === null ? null : `https://${url.host}/${store[1]}`
  },
  searchUrl: (storeBaseUrl, query) =>
    `${storeBaseUrl}/recherche.aspx?TexteRecherche=${encodeURIComponent(query)}`,
}

/** Un UUID en minuscules : la forme des identifiants d'Auchan (magasin, produit, offre) dans le contrat. */
const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

/**
 * Auchan (DRV-727), déclarée mais éteinte : le web ne la propose que si le back la sert dans `retailers` (`DRIVE_RETAILERS`) et que l'application
 * l'annonce. Son magasin ne se lit pas dans une adresse : l'adresse de base est celle du site, le magasin est un UUID lu par l'application.
 */
const auchan: Retailer = {
  id: 'auchan',
  name: 'Auchan',
  nameDe: 'd’Auchan',
  storeAddressPattern: '^https://www\\.auchan\\.fr/$',
  storeAddressExample: 'https://www.auchan.fr/',
  productIdPattern: UUID,
  storeIdSource: 'EXPLICIT',
  storeIdPattern: UUID,
  offerIdPattern: UUID,
  appName: 'Auchan',
  homeUrl: 'https://www.auchan.fr/courses',
  readStore: () => null,
  // Un site adaptatif : pas de site mobile à refuser
  readMobileStoreAddress: () => null,
  // Pas de page de magasin à ouvrir : « Finaliser » mène à l'accueil des courses
  finalizeStoreUrl: () => null,
  // La recherche du site ne dépend pas du magasin (celui-ci est un identifiant, l'adresse de base est celle du site)
  searchUrl: (_storeBaseUrl, query) =>
    `https://www.auchan.fr/recherche?text=${encodeURIComponent(query)}`,
}

/** Le registre : le seul endroit du web qui nomme une enseigne (les textes la reçoivent en paramètre, `fr.ts` ne la nomme jamais hors de ce fichier). */
export const RETAILERS: readonly Retailer[] = [leclerc, auchan]

/** L'enseigne quand rien ne dit laquelle (réglages pas encore lus, pages publiques) : la première du registre. */
export const DEFAULT_RETAILER: Retailer = leclerc

/** L'enseigne d'un identifiant ; une valeur inconnue ou absente rend l'enseigne par défaut, jamais une erreur. */
export const retailerOf = (id: string | null | undefined): Retailer =>
  RETAILERS.find((retailer) => retailer.id === id) ?? DEFAULT_RETAILER

/** Une offre d'un produit (DRV-722) est une chaîne de 1 à 40 caractères : la borne du protocole et du back. */
const OFFER_ID_MAX = 40

/**
 * L'identifiant d'offre à envoyer, ou `null` : il n'est gardé que si l'enseigne a des offres (`offerIdPattern`) et qu'il en a la forme. Le plan du back ne le
 * porte que pour ces enseignes ; la revérification évite qu'une valeur que l'agent ou Repas refuserait en bloc fasse échouer tout le message.
 */
export function offerIdOf(value: unknown, retailer: Retailer): string | null {
  if (retailer.offerIdPattern === null) return null

  return typeof value === 'string' &&
    value !== '' &&
    [...value].length <= OFFER_ID_MAX &&
    new RegExp(retailer.offerIdPattern).test(value)
    ? value
    : null
}

/** Les paramètres de texte d'une enseigne : `{retailer}` (« Leclerc »), `{retailerDe}` (« de Leclerc »), `{appName}` et l'exemple d'adresse. */
export const retailerParams = (retailer: Retailer) => ({
  retailer: retailer.name,
  retailerDe: retailer.nameDe,
  appName: retailer.appName,
  storeExample: retailer.storeAddressExample,
})

/**
 * L'adresse du lien « Finaliser », ou `null` sans magasin.
 *
 * Dans l'application (`inApp`) : l'adresse que l'enseigne sait lire, qui dit seulement **quel magasin** (pour Leclerc, `https://<hôte>/magasin-N-N`,
 * sans ville). L'application l'ouvre sur la page d'accueil du magasin avec la ville qu'elle a retenue, sur l'accueil du drive sinon, et ne va
 * **jamais** vers la page du panier (DRV-631 : Leclerc l'ouvre « introuvable » quand on n'y arrive pas depuis son site). Dans un navigateur :
 * l'accueil du drive, car ce lien sans ville y serait une page introuvable, et l'on n'y est pas connecté de toute façon. Jamais une adresse lue
 * sur une page de l'enseigne : seuls l'hôte et les numéros du magasin enregistré servent.
 */
export const finalizeLink = (
  storeBaseUrl: string | null | undefined,
  inApp = false,
  retailer: Retailer = DEFAULT_RETAILER,
): string | null => {
  if (!storeBaseUrl) return null
  if (!inApp) return retailer.homeUrl

  try {
    return retailer.finalizeStoreUrl(new URL(storeBaseUrl)) ?? retailer.homeUrl
  } catch {
    return retailer.homeUrl
  }
}

/**
 * Les drives que sert une application qui n'annonce rien (`app.info` sans `retailers`, DRV-707) : celui d'avant les drives multiples. Le seul endroit
 * qui le dit.
 */
const LEGACY_APP_RETAILERS: readonly string[] = ['leclerc']

/**
 * L'application sert-elle ce drive ? D'après ce qu'elle annonce (`app.info.retailers`) ; sans annonce (ancienne application, ou réponse pas encore
 * lue : `undefined`), elle ne sert que le drive d'avant. Un drive que l'application ne connaît pas ne reçoit ni lecture de magasin ni plan.
 */
export const appServes = (announced: readonly string[] | undefined, id: string): boolean =>
  (announced ?? LEGACY_APP_RETAILERS).includes(id)
