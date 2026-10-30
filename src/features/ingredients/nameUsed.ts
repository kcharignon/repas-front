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
