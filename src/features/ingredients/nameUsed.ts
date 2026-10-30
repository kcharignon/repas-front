import { ApiError } from '@/api'
import { i18n } from '@/i18n'

/** Le refus du back pour un nom déjà pris dans le même rayon (`409 INGREDIENT_NAME_ALREADY_USED`, ING-016). */
export const isNameAlreadyUsed = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 409 &&
  error.message === 'INGREDIENT_NAME_ALREADY_USED'

/** « Tu as déjà « Petits pois » dans Surgelés. Choisis-le plutôt que d'en créer un autre. » ; `null` si ce n'est pas ce refus. */
export function nameUsedMessage(
  error: unknown,
  name: string,
  departmentName: string,
): string | null {
  if (!isNameAlreadyUsed(error)) return null

  return i18n.global.t('ingredients.nameUsed', { name, department: departmentName })
}

interface OptionWithDepartment {
  name: string
  departmentSlug?: string
  departmentName?: string
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr')

/**
 * Les ingrédients de la personne qui portent déjà ce nom (sans tenir compte de la casse), avec leur rayon. Un ancien back (la liste
 * ne dit pas le rayon) n'en rend aucun : on ne sait rien, le back dira non si besoin.
 */
function withName<T extends OptionWithDepartment>(options: T[], name: string): T[] {
  if (name.trim() === '') return []

  return options.filter(
    (option) =>
      sameName(option.name, name) &&
      option.departmentSlug !== undefined &&
      option.departmentSlug !== '',
  )
}

/** L'ingrédient de ce nom DANS CE RAYON : le back refusera la création (`409`), on le dit tout de suite. */
export function sameNameInDepartment<T extends OptionWithDepartment>(
  options: T[],
  name: string,
  departmentSlug: string,
): T | null {
  return withName(options, name).find((option) => option.departmentSlug === departmentSlug) ?? null
}

/** Un ingrédient de ce nom dans un AUTRE rayon (permis) : rien si le rayon choisi en a déjà un, le refus parlerait alors. */
export function sameNameElsewhere<T extends OptionWithDepartment>(
  options: T[],
  name: string,
  departmentSlug: string,
): T | null {
  const found = withName(options, name)
  if (departmentSlug === '' || found.some((option) => option.departmentSlug === departmentSlug))
    return null

  return found[0] ?? null
}
