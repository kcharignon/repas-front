// Lire une page de recherche (ticket C de l'audit des hypothèses, 2026-10-18). Une recherche sans résultat n'est pas une panne : c'est
// « aucun produit trouvé pour cet ingrédient », que l'utilisateur règle d'un « Chercher autre chose » ou d'un « Passer ». Un site qui a
// changé, lui, doit arrêter le passage avec sa cause. La différence se lit dans la STRUCTURE de la page, pas dans une phrase :
//   - le squelette que le site embarque dans toutes ses pages de magasin (point de livraison, total et lignes du panier, conteneur de
//     produits : relevés DRV-002 et DRV-011 dans la page de recherche et l'accueil) est là ;
//   - aucun produit n'y est lisible, et rien ne laisse croire qu'il y en a (ni champ de produit, ni liste non vide).
// Aucune page « aucun résultat » réelle n'a jamais été relevée : les formes reconnues sont les formes plausibles de ce squelette (liste
// vide, liste nulle, conteneur absent, état encodé en entités), pas des mesures. Ce qui n'a pas ce squelette, ou qui annonce des produits
// que l'agent ne sait pas lire, reste `CONTRACT_CHANGED`, avec la cause (`causes.ts`).
import { extractProducts, pageReadings, type RawProduct } from './embedded'
import { LeclercError } from './errors'
import { visibleText } from './page-text'
import { looksLikeLoginPage } from './session'

/** Ce que l'adaptateur retient d'une réponse de recherche. */
export interface SearchReply {
  text: string
  status: number
  /** La réponse vient d'une redirection : la page lue n'est peut-être pas celle de la recherche. */
  redirected: boolean
}

const key = (name: string) => new RegExp(`(?<![A-Za-z0-9_])["']?${name}["']?\\s*[:=]`)

/** Les repères de l'état embarqué d'une page de magasin. Il en faut deux (ou un seul avec le message du site) pour parler de squelette. */
const SKELETON = [
  'sNoPointLivraison',
  'sTotalAPayer',
  'iQuantitePanier',
  'lstProduitsLight',
  'lstProduits',
].map(key)
/** Les champs d'un produit de recherche (les lignes du panier n'ont pas de libellé ni de prix : DRV-007) : en trouver, c'est qu'il y a des produits. */
const PRODUCT_FIELDS = [
  'sLibelleLigne1',
  'sLibelleLigne2',
  'nrPVUnitaireTTC',
  'sPrixUnitaire',
  'sPrixParUniteDeMesure',
  'sUrlVignetteProduit',
].map(key)
/** Une liste de produits explicitement vide ou nulle : la seule forme que l'ancien code reconnaissait, elle compte pour deux repères. */
const EMPTY_LIST = /(?<![A-Za-z0-9_])["']?lstProduits["']?\s*[:=]\s*(?:\[\s*\]|null\b)/
/** Une liste de produits qui n'est ni vide ni nulle : `lstProduits: [` suivi d'autre chose que `]`. */
const NON_EMPTY_LIST = /(?<![A-Za-z0-9_])["']?lstProduits["']?\s*[:=]\s*\[\s*[^\s\]]/
/** Le message du site, dans le texte visible (sans accent ni majuscule). */
const NO_RESULT_TEXT = /aucun\s+(?:resultat|produit|article)|pas\s+de\s+resultat|\b0\s+resultat/

/**
 * Les produits d'une page de recherche : une liste vide si la page est une recherche sans résultat.
 *
 * @throws {LeclercError} `CONTRACT_CHANGED` (avec sa cause) si la structure n'est pas reconnue ou si les produits sont illisibles ;
 *   `NOT_LOGGED_IN` (`LOGIN_FORM`) si c'est une page de connexion.
 */
export function readSearchPage(reply: SearchReply): RawProduct[] {
  const { products } = extractProducts(reply.text)
  if (products.length > 0) return products

  const readings = pageReadings(reply.text)
  const has = (pattern: RegExp) => readings.some((reading) => pattern.test(reading))
  const skeleton = SKELETON.filter(has).length + (has(EMPTY_LIST) ? 1 : 0)
  if (looksLikeLoginPage(reply.text, skeleton > 0)) {
    throw new LeclercError('NOT_LOGGED_IN', reply.status, 'LOGIN_FORM')
  }
  if (PRODUCT_FIELDS.some(has) || has(NON_EMPTY_LIST)) {
    throw new LeclercError('CONTRACT_CHANGED', reply.status, 'SEARCH_PRODUCTS_UNREADABLE')
  }
  if (skeleton >= 2 || (skeleton === 1 && NO_RESULT_TEXT.test(visibleText(reply.text)))) return []
  throw new LeclercError(
    'CONTRACT_CHANGED',
    reply.status,
    reply.redirected ? 'SEARCH_REDIRECTED' : 'SEARCH_NO_STATE',
  )
}
