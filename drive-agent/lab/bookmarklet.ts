// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Du code JavaScript à la chaîne `javascript:…` qu'on colle dans un favori.

export const SCHEME = 'javascript:'

/** Caractères que `encodeURIComponent` échappe sans nécessité dans une adresse `javascript:` : on les rend pour gagner de la place. */
const KEEP = new Map<string, string>([
  ['%2C', ','],
  ['%3B', ';'],
  ['%3A', ':'],
  ['%3D', '='],
  ['%7B', '{'],
  ['%7D', '}'],
  ['%5B', '['],
  ['%5D', ']'],
  ['%2B', '+'],
  ['%24', '$'],
  ['%26', '&'],
  ['%2F', '/'],
  ['%40', '@'],
  ['%7C', '|'],
  ['%5E', '^'],
  ['%20', ' '],
  ['%60', '`'],
  ['%3F', '?'],
])

/**
 * Chaîne du favori. Reste échappé tout ce qui pourrait être mal compris : `%` (sinon le décodage casse le code), `#` (le navigateur
 * coupe l'adresse au dièse), retours à la ligne et tabulations (il les supprime), guillemets doubles, `<`, `>`, `\`, accents.
 * Les espaces, l'apostrophe inversée et `?` restent tels quels : le code est plein de texte et ils pèsent lourd une fois échappés.
 * La chaîne se copie donc depuis un fichier, un e-mail ou une note, pas depuis une messagerie qui met le texte en forme.
 * Le code se termine par `void 0` pour que la page ne soit pas remplacée par la valeur de la dernière expression.
 */
export function toBookmarklet(code: string): string {
  const body = `${code.trim().replace(/;+$/, '')};void 0`
  const encoded = encodeURIComponent(body).replace(
    /%(?:2C|3B|3A|3D|7B|7D|5B|5D|2B|24|26|2F|40|7C|5E|20|60|3F)/g,
    (escaped) => {
      return KEEP.get(escaped) ?? escaped
    },
  )
  // Deux barres obliques après « javascript: » seraient lues comme le début d'un nom d'hôte.
  return `${SCHEME}${encoded.startsWith('//') ? `%2F${encoded.slice(1)}` : encoded}`
}

/** Le code JavaScript que le navigateur exécutera pour cette adresse (utile aux tests). */
export function fromBookmarklet(url: string): string {
  if (!url.startsWith(SCHEME)) throw new Error('Pas une adresse javascript:')
  return decodeURIComponent(url.slice(SCHEME.length))
}
