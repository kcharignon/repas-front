// Le texte lu sur la page de l'enseigne est une donnée non fiable : un libellé qui porte un caractère invisible ou de contrôle (largeur nulle,
// sens de lecture inversé, saut de ligne, marque d'ordre des octets) est refusé par le back, qui rejette alors EN BLOC les choix de tout le
// passage (`422 DRIVE_CHOICE_INVALID` sur `PUT /drive/choices`, revue de sécurité du back, défaut D2). L'agent les retire donc à la lecture.

/** Ce qui sépare deux mots sans être une espace : le texte reste lisible, on y met une espace. */
const LINE_BREAKS = /[\t\n\v\f\r\u0085\u2028\u2029]/g

/**
 * Les caractères que le back refuse dans un libellé de produit : exactement ceux de `LABEL_FORBIDDEN_CHARACTERS_PATTERN` (`Product.php` du
 * dépôt back) : contrôles (`Cc`), séparateurs de ligne et de paragraphe (`Zl`, `Zp`), marque de lettre arabe, marques et jointures de
 * largeur nulle et du sens de lecture (U+200B à U+200F, U+202A à U+202E, U+2060, U+2066 à U+2069) et marque d'ordre des octets. S'y ajoute
 * `Cs` : une moitié de paire de substitution n'est pas un texte, et son échappement `\udXXX` ferait refuser le JSON entier.
 * `drive-agent/test/label-characters.spec.ts` éprouve cette liste contre une copie du motif du back.
 */
const FORBIDDEN =
  /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu

/**
 * Un texte de l'enseigne prêt à être gardé : sauts de ligne et tabulations changés en espace, caractères invisibles et de contrôle retirés
 * (sans rien laisser à leur place : une largeur nulle ne sépare pas deux mots), suites d'espaces de toute sorte réduites à une espace, bords
 * rognés. Un texte qui n'était fait que d'invisibles et d'espaces rend `''`.
 */
export function cleanText(text: string): string {
  return text.replace(LINE_BREAKS, ' ').replace(FORBIDDEN, '').replace(/\s+/g, ' ').trim()
}
