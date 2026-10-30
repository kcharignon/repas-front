// L'adresse de la photo d'un produit (DRV-633). Elle vient du JSON ou de la page de l'enseigne : c'est du texte non fiable. Elle n'est affichée
// (balise `img`) que si c'est une adresse `https` d'un hôte de la liste blanche DE L'ENSEIGNE (`PhotoRule`, DRV-717 : chaque enseigne a la sienne, ce
// fichier n'en nomme aucune), sans identifiant ni port, d'au plus 2 000 caractères ; sinon la fiche reste en texte, sans erreur. Jamais envoyée à
// Repas, jamais gardée.
import type { PhotoRule } from './retailers/names'

/** La longueur maximale d'une adresse de photo (le ticket DRV-633). */
export const MAX_PHOTO_URL = 2000

/** Seuls des caractères ASCII imprimables, sans espace ni barre oblique inverse : le navigateur les « corrigerait » (tabulations ôtées, `\` lu comme `/`). */
const PRINTABLE_ASCII = /^[\x21-\x5b\x5d-\x7e]+$/

/** L'emplacement de la page, pour résoudre une adresse relative (`LocationLike` de l'adaptateur, sans en dépendre). */
export interface PhotoPage {
  hostname: string
  pathname: string
  protocol?: string
  port?: string
}

/**
 * L'adresse à mettre dans `src`, ou `null`. `rule` : la liste blanche de l'enseigne. `page` : l'emplacement de la page, pour une adresse relative
 * (`/images/a.jpg`, `a.jpg`) ; sans `page`, seule une adresse absolue passe. Une adresse relative d'une page qui n'est pas en `https` ou qui a un port
 * est refusée comme n'importe quelle autre.
 */
export function photoUrl(
  raw: unknown,
  rule: PhotoRule,
  page: PhotoPage | null = null,
): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (text.length === 0 || text.length > MAX_PHOTO_URL || text !== raw) return null
  if (!PRINTABLE_ASCII.test(text)) return null
  // Seules deux formes sont lues : absolue (`https://hôte/…`) ou relative à la racine de la page (`/…`, `//hôte/…`). `https:x` ou `x.jpg` seraient résolues par le navigateur
  // de façon moins évidente.
  if (!/^https:[/][/]/i.test(text) && !(page && text.startsWith('/'))) return null
  let url: URL
  try {
    url = page
      ? new URL(
          text,
          `${page.protocol ?? 'https:'}//${page.hostname}${page.port ? `:${page.port}` : ''}${page.pathname}`,
        )
      : new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username !== '' || url.password !== '' || url.port !== '') return null
  if (!rule.host.test(url.hostname)) return null
  if (rule.path !== undefined && !rule.path.test(url.pathname)) return null
  return url.href.length <= MAX_PHOTO_URL ? url.href : null
}
