/**
 * Met en minuscule la première lettre d'un nom pour le lire au milieu d'une phrase (« Jaune d'œuf » donne « jaune d'œuf », la ligature
 * `Œ` donne `œ`). Un sigle (deux majuscules de suite : « BBQ », « T55 ») reste tel quel, et la suite du nom n'est jamais touchée.
 */
export function lowerFirst(value: string): string {
  const text = value.trim()
  if (text === '' || /^\p{Lu}\p{Lu}/u.test(text)) return text

  return `${text.charAt(0).toLocaleLowerCase('fr')}${text.slice(1)}`
}
