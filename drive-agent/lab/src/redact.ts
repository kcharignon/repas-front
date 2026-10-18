// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Garde-fous de confidentialité : le banc ne montre ni ne copie jamais un cookie, un jeton ou un identifiant de compte.
import type { StoreInfo } from './store'

/**
 * Dit si un cookie de ce nom existe. Seul un booléen sort d'ici : la valeur n'est jamais retournée, ni affichée.
 * `cookies` est le contenu de `document.cookie` (ou une chaîne de test).
 */
export function hasCookie(cookies: string, name: string): boolean {
  return cookies
    .split(';')
    .some((part) => part.trim().toLowerCase().startsWith(`${name.toLowerCase()}=`))
}

const EMAIL = /[^\s"'<>()]+@[^\s"'<>()]+\.[a-z]{2,}/gi

export function maskEmails(text: string): string {
  return text.replace(EMAIL, '[adresse e-mail masquée]')
}

/** Clés d'une réponse du site dont la valeur n'est jamais affichée. */
const SENSITIVE_KEY =
  /cookie|token|jeton|mail|mdp|passw|motdepasse|session|secret|iban|carte|telephone|portable|adresse|prenom|nomclient|^s?nom$|datadome|pointlivraison/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Le nom de ville de l'adresse, brut ou décodé, où qu'il apparaisse. */
function maskCity(text: string, city: string | null): string {
  if (city === null) return text
  const names = new Set([city])
  try {
    names.add(decodeURIComponent(city))
  } catch {
    // Séquence d'échappement invalide : on garde la version brute.
  }
  let masked = text
  for (const name of names) {
    if (name.length >= 3) masked = masked.replace(new RegExp(escapeRegExp(name), 'gi'), '[ville]')
  }
  return masked
}

/**
 * Remplace le magasin (numéro, début d'adresse `magasin-…`) par des repères neutres.
 * Appliqué à tout texte affiché ou copié : le dépôt est public et le magasin de l'utilisateur est une donnée personnelle.
 * `extra` : d'autres numéros à masquer (le point de livraison lu dans la page, qui peut différer de ceux de l'adresse).
 */
export function maskStore(
  text: string,
  store: StoreInfo | null,
  extra: readonly string[] = [],
): string {
  let masked = maskEmails(text)
  if (!store) return masked
  const segment = store.basePath.slice(1)
  const variants = new Set<string>([segment])
  try {
    variants.add(decodeURIComponent(segment))
  } catch {
    // Séquence d'échappement invalide : on garde la version brute.
  }
  variants.add(store.cartPath.slice(1))
  for (const variant of variants) {
    masked = masked.replace(new RegExp(escapeRegExp(variant), 'gi'), 'magasin-[masqué]')
  }
  masked = maskCity(masked, store.city)
  const ids = new Set([store.id])
  if (store.secondId !== null) ids.add(store.secondId)
  if (/^\d+$/.test(store.second)) ids.add(store.second)
  for (const value of extra) if (value.length >= 4) ids.add(value)
  // Le site écrit parfois un numéro sans ses zéros de tête (« 001234 » devient « 1234 »).
  for (const id of ids) {
    const bare = id.replace(/^0+/, '')
    if (bare.length >= 4) ids.add(bare)
  }
  for (const id of ids) {
    masked = masked.replace(new RegExp(`(?<!\\d)${escapeRegExp(id)}(?!\\d)`, 'g'), '[n° magasin]')
  }
  return masked
}

/** Rend une valeur affichable : raccourcie, sur une ligne, sans adresse e-mail. */
export function shorten(value: unknown, max = 80): string {
  const text = maskEmails(String(value)).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}
