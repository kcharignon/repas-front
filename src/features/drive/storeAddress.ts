import { STORE_HOST } from '@drive-protocol'

export interface StoreAddress {
  /** L'identifiant du magasin chez l'enseigne : le premier groupe de chiffres de l'adresse, zéros initiaux conservés. */
  id: string
  /** L'adresse de base, `https://<sous-domaine>.leclercdrive.fr/magasin-<id>-<id>`. */
  baseUrl: string
}

/**
 * Lit l'adresse d'un magasin comme le back la valide (hôte `*.leclercdrive.fr` en https, chemin `/magasin-<id>-<id>`) : une adresse
 * collée depuis le navigateur, avec une suite de chemin, une requête ou un `#`, est ramenée à l'adresse de base. `null` si ce n'est
 * pas celle d'un magasin. Le back vérifie de nouveau : ceci ne sert qu'à répondre tout de suite.
 */
export function parseStoreAddress(input: string): StoreAddress | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    !STORE_HOST.test(url.hostname)
  )
    return null
  const path = /^\/magasin-(\d{1,12})-(\d{1,12})(?:\/.*)?$/.exec(url.pathname)
  if (path === null) return null

  return { id: path[1] as string, baseUrl: `https://${url.hostname}/magasin-${path[1]}-${path[2]}` }
}

/** Les derniers chiffres de l'identifiant (« …123 ») : l'agent ne lit pas le nom du magasin, c'est ce qu'on montre à la place. */
export const storeTail = (id: string): string => id.slice(-3)
