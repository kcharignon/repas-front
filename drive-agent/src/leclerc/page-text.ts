// Lire le texte VISIBLE d'une page de l'enseigne, sans scripts, styles ni commentaires : les libellés de l'interface (« Se connecter »,
// « Aucun résultat ») se cherchent là, jamais dans le JSON embarqué, où un même mot peut figurer pour une autre raison.
import { decodeEntities } from './embedded'

/** Les commentaires, scripts et styles : ce que l'utilisateur ne voit pas. */
export const INVISIBLE = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>/gi

/** Un texte comparable : sans balise, entités décodées, minuscules, sans accent, apostrophes droites, espaces réduites. */
export function fold(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, ' '))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Le texte visible d'une page, comparable (voir `fold`). */
export function visibleText(page: string): string {
  return fold(page.replace(INVISIBLE, ' '))
}
