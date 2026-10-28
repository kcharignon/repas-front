/**
 * Met en majuscule la première lettre d'un nom (de recette, d'ingrédient) et rien d'autre : la suite du nom est conservée telle
 * que la personne l'a tapée (« pâtes carbonara » donne « Pâtes carbonara », « de la farine T55 » donne « De la farine T55 »).
 *
 * - Multioctet et accents, en français : `é` donne `É`, la ligature `œ` donne `Œ`.
 * - Les espaces de tête sont conservés, la lettre qui les suit passe en majuscule (comme le back, `StringTool::capitalizeFirst`).
 * - Un premier caractère qui n'est pas une lettre (chiffre, parenthèse, apostrophe) reste tel quel, et la lettre d'après aussi.
 * - Idempotent ; une chaîne vide ou faite d'espaces reste inchangée.
 */
export function capitalizeFirst(value: string): string {
  const match = /^(\s*)(\P{White_Space})([\s\S]*)$/u.exec(value)
  if (match === null) return value

  const [, lead, first, rest] = match

  return `${lead}${first!.toLocaleUpperCase('fr')}${rest}`
}
