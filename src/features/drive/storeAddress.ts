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
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '')
    return null

  return retailer.readStore(url)
}

/** Les derniers chiffres de l'identifiant (« …123 ») : l'agent ne lit pas le nom du magasin, c'est ce qu'on montre à la place. */
export const storeTail = (id: string): string => id.slice(-3)
