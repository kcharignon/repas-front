import type { RecipeComponent } from '@/api'
import { i18n } from '@/i18n'

/**
 * Les recettes utilisées dans une autre recette (COMP-006, ADR 0040 du back) : le nombre de fois, les phrases accordées et les listes de noms.
 * Fonctions pures, sans composant : le mot à l'écran est « fois » (jamais « × », jamais le nom de la recette au pluriel), et jamais
 * « sous-recette ».
 */

/** Les bornes du back (`RecipeComponent::MIN_MULTIPLIER` et `MAX_MULTIPLIER`) : « 1 fois » est la recette comme elle est écrite. */
export const MIN_TIMES = 0.01
export const MAX_TIMES = 100
/** Le pas des boutons « − » et « + ». */
export const TIMES_STEP = 0.5
/** Au plus dix recettes utilisées par recette (`RecipeComponent::MAX_PER_RECIPE`, `422 RECIPE_COMPONENT_LIMIT_REACHED`). */
export const MAX_COMPONENTS = 10

const FRENCH = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3, useGrouping: false })

/** « 0,5 », « 1 », « 2,25 » : le nombre comme on le tape en France. */
export function formatTimes(value: number): string {
  return FRENCH.format(value)
}

/**
 * Le nombre de fois tapé : la virgule et le point valent la même chose. `null` si ce n'est pas un nombre (vide, lettres, signe, exposant)
 * ou s'il sort des bornes du back (0,01 à 100).
 */
export function parseTimes(text: string | number): number | null {
  const typed = String(text).trim().replace(',', '.')
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(typed)) return null
  const value = Number(typed)

  return Number.isFinite(value) && value >= MIN_TIMES && value <= MAX_TIMES ? value : null
}

const EPSILON = 1e-9

/** Le « + » : le multiple de 0,5 juste au-dessus, jusqu'à 100 (à partir d'un nombre invalide on repart de zéro). */
export function nextTimes(value: number | null): number {
  const from = value ?? 0

  return Math.min(MAX_TIMES, (Math.floor(from / TIMES_STEP + EPSILON) + 1) * TIMES_STEP)
}

/** Le « − » : le multiple de 0,5 juste en dessous, jamais moins de 0,5 (le bouton est grisé à 0,5 et en dessous). */
export function previousTimes(value: number): number {
  return Math.max(TIMES_STEP, (Math.ceil(value / TIMES_STEP - EPSILON) - 1) * TIMES_STEP)
}

/** « − » possible : au-dessus de 0,5. */
export const canLessTimes = (value: number | null): boolean => value !== null && value > TIMES_STEP

/** « + » possible : en dessous de 100 (et pour un nombre invalide, qui repart de zéro). */
export const canMoreTimes = (value: number | null): boolean => value === null || value < MAX_TIMES

/**
 * La phrase d'aide d'une ligne qui n'est pas à 1 fois : « Tu prends 2 fois les quantités de Crème au citron. » ou, pour 0,5, « la moitié ».
 * `null` à 1 fois (la recette comme elle est écrite) ou pour un nombre invalide.
 */
export function timesHelp(value: number | null, name: string): string | null {
  if (value === null || value === 1) return null
  const { t } = i18n.global
  if (value === 0.5) return t('recipes.components.helpHalf', { name })

  return t('recipes.components.helpTimes', { times: formatTimes(value), name })
}

/** « 1 fois », « 0,5 fois » : la ligne d'une recette utilisée dans la fiche. */
export function timesLabel(value: number): string {
  return i18n.global.t('recipes.with.times', { times: formatTimes(value) })
}

/** Une liste de noms lue à voix haute : « A », « A et B », « A, B et C ». */
export function joinNames(names: readonly string[]): string {
  const { t } = i18n.global
  if (names.length <= 1) return names.join('')

  return `${names.slice(0, -1).join(', ')} ${t('recipes.components.and')} ${names[names.length - 1]}`
}

/**
 * Les recettes qui en utilisent une autre, dites en une phrase courte : un nom, deux noms, puis « A, B et 1 autre » au-delà de deux.
 */
export function usedInNames(names: readonly string[]): string {
  if (names.length <= 2) return joinNames(names)
  const rest = names.length - 2

  return joinNames([
    ...names.slice(0, 2),
    i18n.global.t('recipes.usedIn.others', { count: rest }, rest),
  ])
}

/**
 * Le message après « Copier » : ce qui entre dans les recettes de l'utilisateur. Une recette sans recette utilisée garde son message
 * d'avant (« {nom} » est dans tes recettes). Avec des recettes utilisées : tous les noms jusqu'à trois recettes, puis « A et 3 autres recettes ».
 */
export function copiedMessage(name: string, components: readonly Pick<RecipeComponent, 'name'>[]) {
  const { t } = i18n.global
  if (components.length === 0) return t('recipes.copiedToast', { name })
  if (components.length <= 2)
    return t('recipes.copiedWith.few', {
      names: joinNames([name, ...components.map((c) => c.name)]),
    })

  return t('recipes.copiedWith.many', { name, count: components.length })
}

/**
 * Les lignes d'une recette utilisée que le back ne sait pas convertir dans l'unité d'achat de leur ingrédient (`convertible` faux) : la
 * recette qui l'utilise ne peut pas être planifiée tant qu'elles ne sont pas réglées. Un back qui ne rend pas le champ ne signale rien.
 */
export function unconvertibleRows(component: RecipeComponent): RecipeComponent['rows'] {
  return (component.rows ?? []).filter((row) => row.convertible === false)
}

/** La recette utilisée empêche de planifier : le back la dit non convertible, ou une de ses lignes l'est. */
export const needsFix = (component: RecipeComponent): boolean =>
  component.convertible === false || unconvertibleRows(component).length > 0
