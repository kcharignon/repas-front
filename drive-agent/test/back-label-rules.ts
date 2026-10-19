// Les règles du back sur le libellé d'un produit, recopiées pour que l'agent soit éprouvé contre elles (aucun appel au back).
// Un libellé refusé fait échouer en bloc (`422 DRIVE_CHOICE_INVALID`) tout le lot de `PUT /drive/choices` : les choix d'un passage entier.

/**
 * COPIE, à l'octet près, de `LABEL_FORBIDDEN_CHARACTERS_PATTERN` dans `src/Drive/Domain/Model/Product.php` du dépôt back
 * `kcharignon/repas` (PR #198, qui élargit celui de la PR #159) : contrôles (`Cc`), TOUS les caractères de format (`Cf` : trait d'union
 * conditionnel U+00AD, marques et inversions du sens de lecture, largeurs nulles, opérateurs invisibles U+2060 à U+2064, marque d'ordre des
 * octets, TAG), séparateurs de ligne et de paragraphe (`Zl`, `Zp`), puis une liste d'invisibles d'autres catégories (`Lo`, `Mn`) : U+034F,
 * remplisseurs hangul, voyelles inhérentes khmères, sélecteurs mongols et sélecteurs de variation, bloc des TAG.
 * Si le back change ce motif, le recopier ici : `label-characters.spec.ts` échoue alors tant que l'agent n'en retire pas autant.
 * (Le back l'écrit en trois morceaux concaténés ; c'est le même motif.)
 */
export const BACK_FORBIDDEN_PATTERN_PHP = String.raw`/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\x{034F}\x{115F}\x{1160}\x{17B4}\x{17B5}\x{180B}-\x{180F}\x{3164}\x{FE00}-\x{FE0F}\x{FFA0}\x{E0000}-\x{E007F}\x{E0100}-\x{E01EF}]/u`

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

/**
 * Le libellé d'un produit est-il accepté par `Product::checkedLabel` (`trim`, non vide, 255 au plus, rien d'interdit, pas que des espaces) ?
 * Une moitié de paire de substitution n'existe pas en UTF-8 : le JSON du message est refusé avant d'arriver au motif (et `preg_match` rend
 * `false` sur de l'UTF-8 invalide, `!== 0` : refusé aussi).
 */
export function backAcceptsLabel(label: string): boolean {
  const trimmed = phpTrim(label)
  return (
    trimmed !== '' &&
    [...trimmed].length <= BACK_LABEL_MAX_LENGTH &&
    !BACK_FORBIDDEN.test(trimmed) &&
    !/\p{Cs}/u.test(trimmed) &&
    !/^[\p{Z}\s]*$/u.test(trimmed)
  )
}
