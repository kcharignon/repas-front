// Un texte de l'enseigne (ou de la fiche d'un produit) est une donnée non fiable : un libellé qui porte un caractère invisible ou de contrôle est
// refusé par le back, qui rejette alors EN BLOC les choix de tout le passage (`422 DRIVE_CHOICE_INVALID` sur `PUT /drive/choices`). L'agent les
// retire à la lecture de la page ; le front les retire une seconde fois avant d'écrire, pour un agent plus ancien (l'APK ne se met pas à jour en
// même temps que le site). Une seule fonction pour les deux : le protocole la partage. Elle ne change pas le format des messages.

/** Ce qui sépare deux mots sans être une espace : le texte reste lisible, on y met une espace. */
const LINE_BREAKS = /[\t\n\v\f\r\u0085\u2028\u2029]/g

/**
 * Les caractères que le back refuse dans un libellé de produit : exactement ceux de `LABEL_FORBIDDEN_CHARACTERS_PATTERN` (`Product.php` du
 * dépôt back, PR #198), par catégorie Unicode, donc selon la version d'Unicode du navigateur qui exécute ce code :
 * - `Cc` : contrôles ; `Zl` et `Zp` : séparateurs de ligne et de paragraphe (U+2028, U+2029) ;
 * - `Cf` : TOUS les caractères de format, sans tracé : trait d'union conditionnel (U+00AD, très courant sur les pages web), marques et
 *   inversions du sens de lecture, espaces et jointures de largeur nulle (U+200B à U+200D), opérateurs invisibles (U+2060 à U+2064), marque
 *   d'ordre des octets (U+FEFF), caractères de TAG ;
 * - les invisibles d'une autre catégorie, listés un à un : U+034F, U+115F, U+1160, U+17B4, U+17B5, U+180B à U+180F, U+3164, U+FE00 à U+FE0F,
 *   U+FFA0, tout le bloc des TAG (U+E0000 à U+E007F) et U+E0100 à U+E01EF.
 * S'y ajoute `Cs` : une moitié de paire de substitution n'est pas un texte, et son échappement `\udXXX` ferait refuser le JSON entier.
 *
 * Restent acceptés, comme au back : lettres accentuées et ligatures (é, è, ç, œ), accents combinants, symboles courants (®, ™, °, €, %, &, ’,
 * « »), l'espace et les espaces insécables U+00A0 et U+202F (qui deviennent une espace ordinaire, voir `cleanText`), un emoji d'un seul
 * caractère. `drive-agent/test/label-characters.spec.ts` éprouve cette liste contre une copie du motif du back.
 */
const FORBIDDEN =
  // oxlint-disable-next-line no-misleading-character-class -- des marques et sélecteurs, à retirer exprès : c'est l'objet de la liste
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\u{034F}\u{115F}\u{1160}\u{17B4}\u{17B5}\u{180B}-\u{180F}\u{3164}\u{FE00}-\u{FE0F}\u{FFA0}\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu

/**
 * Un texte de l'enseigne prêt à être gardé : sauts de ligne et tabulations changés en espace, caractères invisibles et de contrôle retirés
 * (sans rien laisser à leur place : une largeur nulle ou un trait d'union conditionnel ne sépare pas deux mots), suites d'espaces de toute sorte
 * (insécables comprises) réduites à une espace, bords rognés. Un texte qui n'était fait que d'invisibles et d'espaces rend `''`.
 */
export function cleanText(text: string): string {
  return text.replace(LINE_BREAKS, ' ').replace(FORBIDDEN, '').replace(/\s+/g, ' ').trim()
}
