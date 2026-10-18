// Les règles du back sur le libellé d'un produit, recopiées pour que l'agent soit éprouvé contre elles (aucun appel au back).
// Un libellé refusé fait échouer en bloc (`422 DRIVE_CHOICE_INVALID`) tout le lot de `PUT /drive/choices` : les choix d'un passage entier.

/**
 * COPIE, à l'octet près, de `LABEL_FORBIDDEN_CHARACTERS_PATTERN` dans `src/Drive/Domain/Model/Product.php` du dépôt back
 * `kcharignon/repas` (PR #159) : contrôles (`Cc`), séparateurs de ligne et de paragraphe (`Zl`, `Zp`), marque d'ordre des octets, marques
 * et inversions du sens de lecture, espaces et jointures de largeur nulle.
 * Si le back change ce motif, le recopier ici : `label-characters.spec.ts` échoue alors tant que l'agent n'en retire pas autant.
 */
export const BACK_FORBIDDEN_PATTERN_PHP = String.raw`/[\p{Cc}\p{Zl}\p{Zp}\x{061C}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}\x{2066}-\x{2069}\x{FEFF}]/u`

/** Le même motif en JavaScript (`\x{200B}` de PCRE s'écrit `\u{200B}` avec le drapeau `u`). */
export const BACK_FORBIDDEN = new RegExp(
  BACK_FORBIDDEN_PATTERN_PHP.slice(1, -2).replace(/\\x\{([0-9A-Fa-f]+)\}/g, '\\u{$1}'),
  'u',
)

/** `LABEL_MAX_LENGTH` de `Product.php`, en caractères (`mb_strlen`). */
export const BACK_LABEL_MAX_LENGTH = 255

/** `trim()` de PHP : espace, tabulation, saut de ligne, retour chariot, NUL et tabulation verticale, aux deux bords et rien d'autre. */
const PHP_TRIM = new Set([' ', '\t', '\n', '\r', String.fromCharCode(0), String.fromCharCode(11)])
function phpTrim(text: string): string {
  const chars = [...text]
  while (chars.length > 0 && PHP_TRIM.has(chars[0] ?? '')) chars.shift()
  while (chars.length > 0 && PHP_TRIM.has(chars.at(-1) ?? '')) chars.pop()
  return chars.join('')
}

/** Le libellé d'un produit est-il accepté par `Product::checkedLabel` (`trim`, non vide, 255 au plus, rien d'interdit, pas que des espaces) ? */
export function backAcceptsLabel(label: string): boolean {
  const trimmed = phpTrim(label)
  return (
    trimmed !== '' &&
    [...trimmed].length <= BACK_LABEL_MAX_LENGTH &&
    !BACK_FORBIDDEN.test(trimmed) &&
    !/^[\p{Z}\s]*$/u.test(trimmed)
  )
}
