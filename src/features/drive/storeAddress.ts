import { DEFAULT_RETAILER } from './retailers'
import type { Retailer, StoreAddress } from './retailers'

export type { StoreAddress }

/**
 * Lit l'adresse d'un magasin comme le back la valide (la règle de l'enseigne, dans `retailers.ts`) : une adresse collée depuis le
 * navigateur, avec une suite de chemin, une requête ou un `#`, est ramenée à l'adresse de base. `null` si ce n'est pas celle d'un
 * magasin. Le back vérifie de nouveau : ceci ne sert qu'à répondre tout de suite.
 */
export function parseStoreAddress(
  input: string,
  retailer: Retailer = DEFAULT_RETAILER,
): StoreAddress | null {
  // Un magasin explicite n'est pas dans l'adresse : aucune adresse collée ne dit quel est le magasin (`readExplicitStore`).
  if (retailer.storeIdSource === 'EXPLICIT') return null
  const url = plainHttpsUrl(input)

  return url === null ? null : retailer.readStore(url)
}

/**
 * Reconnaît l'adresse du site MOBILE d'un magasin (DRV-741), celle que donne un téléphone : `https://m-courses…/magasin-N-N-ville[.aspx]`. Elle ne dit pas
 * le magasin (l'enseigne la redirige, en mode ordinateur, vers l'hôte du magasin, qu'on ne peut pas deviner) : elle rend l'adresse à ouvrir dans
 * l'application, qui lit le magasin sur la page finale. Jamais enregistrée telle quelle. `null` si ce n'est pas une adresse mobile de magasin.
 */
export function parseMobileStoreAddress(
  input: string,
  retailer: Retailer = DEFAULT_RETAILER,
): string | null {
  if (retailer.storeIdSource === 'EXPLICIT') return null
  const url = plainHttpsUrl(input)

  return url === null ? null : retailer.readMobileStoreAddress(url)
}

/** Une adresse `https` sans port ni identifiants, ou `null`. */
function plainHttpsUrl(input: string): URL | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '')
    return null

  return url
}

/**
 * Le magasin d'une enseigne dont l'identifiant est explicite (`storeIdSource` `EXPLICIT`), tel que l'application l'a lu : l'identifiant a la forme du contrat et
 * l'adresse de base est exactement celle de l'enseigne (une constante). `null` sinon, et toujours `null` pour une enseigne dont le magasin se lit dans l'adresse.
 */
export function readExplicitStore(
  id: string,
  baseUrl: string,
  retailer: Retailer,
): StoreAddress | null {
  if (retailer.storeIdSource !== 'EXPLICIT') return null
  if (!new RegExp(retailer.storeIdPattern).test(id)) return null
  if (!new RegExp(retailer.storeAddressPattern).test(baseUrl)) return null

  return { id, baseUrl }
}

/** Les derniers chiffres de l'identifiant (« …123 ») : l'agent ne lit pas le nom du magasin, c'est ce qu'on montre à la place. */
export const storeTail = (id: string): string => id.slice(-3)
