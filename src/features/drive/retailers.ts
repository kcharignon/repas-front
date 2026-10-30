import { STORE_HOST } from '@drive-protocol'

import type { components } from '@/api/schema'

/** L'identifiant d'une enseigne, celui du contrat de l'API (`Retailer`). */
export type RetailerId = components['schemas']['Retailer']

export interface StoreAddress {
  /** L'identifiant du magasin chez l'enseigne : le premier groupe de chiffres de l'adresse, zéros initiaux conservés. */
  id: string
  /** L'adresse de base du magasin, celle que le back enregistre. */
  baseUrl: string
}

/**
 * Une enseigne de drive pour le web. Les six premiers champs sont ceux du contrat commun des couches (`docs/drive/samples/retailers.sample.json`
 * du back, vérifiés par `retailers.spec.ts`) ; les trois suivants sont propres au web.
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
  /** Lit une adresse de magasin déjà analysée (https, sans port ni identifiants) : le magasin et son adresse de base, ou `null`. */
  readStore: (url: URL) => StoreAddress | null
  /** L'adresse « Finaliser » d'un magasin pour l'application, d'après son adresse de base enregistrée ; `null` si elle n'est pas lisible. */
  finalizeStoreUrl: (storeBaseUrl: URL) => string | null
}

/** `/magasin-N-N`, avec ou sans ville : les deux numéros du magasin, sans le reste de l'adresse. */
const LECLERC_STORE_IDS = /^\/(magasin-\d{1,12}-\d{1,12})(?:-[^/?#]*)?(?:\/|$)/

const leclerc: Retailer = {
  id: 'leclerc',
  name: 'Leclerc',
  nameDe: 'de Leclerc',
  storeAddressPattern: '^https://[a-z0-9-]+\\.leclercdrive\\.fr/magasin-([0-9]+)-([0-9]+)$',
  storeAddressExample: 'https://exemple.leclercdrive.fr/magasin-123456-123456',
  productIdPattern: '^[0-9]{1,12}$',
  offerIdPattern: null,
  appName: 'Drive Leclerc',
  homeUrl: 'https://www.leclercdrive.fr/',
  readStore: (url) => {
    if (!STORE_HOST.test(url.hostname)) return null
    const path = /^\/magasin-(\d{1,12})-(\d{1,12})(?:\/.*)?$/.exec(url.pathname)
    if (path === null) return null

    return {
      id: path[1] as string,
      baseUrl: `https://${url.hostname}/magasin-${path[1]}-${path[2]}`,
    }
  },
  finalizeStoreUrl: (url) => {
    const store = LECLERC_STORE_IDS.exec(url.pathname)

    return url.protocol !== 'https:' || store === null ? null : `https://${url.host}/${store[1]}`
  },
}

/** Le registre : le seul endroit du web qui nomme une enseigne (les textes la reçoivent en paramètre, `fr.ts` ne la nomme jamais hors de ce fichier). */
export const RETAILERS: readonly Retailer[] = [leclerc]

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
