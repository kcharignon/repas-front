import { ApiError } from '@/api'
import { i18n } from '@/i18n'
import { DEFAULT_RETAILER, retailerParams } from '@/features/drive/retailers'

import { useNotificationsStore } from './store'

// Hors d'un écran, l'enseigne n'est pas connue : celle par défaut du registre (le seul texte concerné, `driveStoreInvalid`).
const t = (key: string, named?: Record<string, unknown>) =>
  i18n.global.t(key, { ...retailerParams(DEFAULT_RETAILER), ...named })

/** Les codes de domaine du drive que le back renvoie comme message d'erreur : chacun a son texte, quel que soit le statut. */
const driveCodes = new Map([
  ['DRIVE_DISABLED', 'errors.driveDisabled'],
  ['SHOPPING_LIST_SENT', 'errors.listSent'],
  ['SHOPPING_LIST_NOT_SENT', 'errors.listNotSent'],
  ['SHOPPING_LIST_NOT_SENDABLE', 'errors.listNotSendable'],
  ['SHOPPING_LIST_EMPTY', 'errors.listEmpty'],
  ['DRIVE_NOT_CONFIGURED', 'errors.driveNotConfigured'],
  ['DRIVE_CHOICE_INVALID', 'errors.driveChoiceInvalid'],
  ['DRIVE_CHOICE_NOT_FOUND', 'errors.driveChoiceNotFound'],
  ['DRIVE_INGREDIENT_NOT_FOUND', 'errors.driveIngredientNotFound'],
  ['DRIVE_LIMIT_REACHED', 'errors.driveLimitReached'],
  ['DRIVE_STORE_MISMATCH', 'errors.driveStoreMismatch'],
  ['DRIVE_STORE_INVALID', 'errors.driveStoreInvalid'],
  // Unités (DRV-409) : la dimension et le facteur de base vont ensemble, le facteur est strictement positif
  ['UNIT_MEASURE_INCOMPLETE', 'errors.unitMeasureIncomplete'],
  ['UNIT_BASE_FACTOR_INVALID', 'errors.unitBaseFactorInvalid'],
  // Ingrédient de base (ING-015) : seul le propriétaire du catalogue le règle
  ['INGREDIENT_BASE_FORBIDDEN', 'errors.ingredientBaseForbidden'],
  // Le même nom dans le même rayon (ING-016) : un 409 qui n'est pas « une autre modification en cours »
  ['INGREDIENT_NAME_ALREADY_USED', 'errors.ingredientNameUsed'],
])

/** Les conversions propres à un ingrédient : chaque refus du back a sa phrase, quel que soit le statut (un 409 n'est pas un « autre modification en cours »). */
const conversionCodes = new Map([
  ['CONVERSION_ALREADY_EXISTS', 'errors.conversionExists'],
  ['CONVERSION_SAME_UNIT', 'conversion.errors.sameUnit'],
  ['CONVERSION_REQUIRED_BY_INGREDIENT', 'errors.conversionRequired'],
])

/** Les plafonds et les bornes des recettes, ingrédients, listes et conversions (422) : chacun dit sa limite, au lieu du code brut. */
const limitCodes = new Map([
  ['RECIPE_LIMIT_REACHED', 'limits.recipeLimitReached'],
  ['INGREDIENT_LIMIT_REACHED', 'limits.ingredientLimitReached'],
  ['SHOPPING_LIST_LIMIT_REACHED', 'limits.listLimitReached'],
  ['SHOPPING_LIST_MEAL_LIMIT_REACHED', 'limits.listMealLimitReached'],
  ['RECIPE_ROWS_LIMIT_REACHED', 'limits.recipeRowsLimitReached'],
  ['CONVERSION_LIMIT_REACHED', 'limits.conversionLimitReached'],
  ['RECIPE_QUANTITY_INVALID', 'limits.quantityInvalid'],
  ['SHOPPING_LIST_QUANTITY_INVALID', 'limits.quantityInvalid'],
  ['RECIPE_SERVING_INVALID', 'limits.servingInvalid'],
  ['MEAL_SERVING_INVALID', 'limits.servingInvalid'],
  ['USER_SERVING_INVALID', 'limits.servingInvalid'],
  ['CONVERSION_COEFFICIENT_INVALID', 'limits.coefficientInvalid'],
])

/**
 * Trop de requêtes en peu de temps (`429`) : un refus passager, qui ne dit rien de la requête elle-même (le drive plafonne le débit par
 * utilisateur, DRV-615, et n'a rien enregistré). On ne le rejoue jamais tout seul.
 */
export const isRateLimited = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 429

/**
 * `DRIVE_RATE_LIMITED` : le débit du drive est plafonné par utilisateur et par minute. `Retry-After` est un minimum, jamais une promesse :
 * après une rafale il annonce souvent 1 seconde alors que le compteur ne se libère qu'en environ une minute. On dit donc toujours au
 * moins une minute, et davantage si le back en annonce davantage.
 */
function driveRateLimited(error: ApiError): string {
  const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60))
  const wait = i18n.global.t('errors.driveWait', { minutes }, minutes)

  return t('errors.driveRateLimited', { wait })
}

/**
 * `WRITE_RATE_LIMITED` : trop d'actions en peu de temps, rien n'a été enregistré. Le délai est court : jusqu'à une minute on dit « un instant ».
 * `PASSWORD_RATE_LIMITED` : trop de mots de passe actuels refusés ; `Retry-After` est exact, on le dit en minutes (au moins une).
 */
function rateLimitedByCode(code: string, error: ApiError): string | null {
  const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60))
  const minutesText = i18n.global.t('errors.driveWait', { minutes }, minutes)
  if (code === 'WRITE_RATE_LIMITED') {
    const wait = (error.retryAfter ?? 0) <= 60 ? t('errors.writeWaitShort') : minutesText

    return t('errors.writeRateLimited', { wait })
  }
  if (code === 'PASSWORD_RATE_LIMITED')
    return t('errors.passwordRateLimited', { wait: minutesText })

  return null
}

/** Le message que lit l'utilisateur pour un échec d'écriture, selon le code renvoyé par le back (ADR 0007, 0016). */
export function messageForFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return t('errors.generic')
  if (error.message === 'DRIVE_RATE_LIMITED') return driveRateLimited(error)
  const rateLimited = rateLimitedByCode(error.message, error)
  if (rateLimited !== null) return rateLimited
  const code =
    driveCodes.get(error.message) ??
    conversionCodes.get(error.message) ??
    limitCodes.get(error.message)
  if (code !== undefined) return t(code)

  switch (error.status) {
    case 0:
      return t('errors.unreachable')
    case 401:
      return t('errors.sessionExpired')
    case 403:
      return t('errors.forbidden')
    case 404:
      return t('errors.notFound')
    case 409:
      return t('errors.conflict')
    case 412:
      return t('errors.outdated')
    case 422:
      return error.message
    case 429: {
      const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60))

      return i18n.global.t('errors.tooMany', { minutes }, minutes)
    }
    default:
      return t('errors.generic')
  }
}

/** 412 et 409 disent que la ressource a changé ailleurs, `DRIVE_DISABLED` que le drive vient d'être coupé : l'écran doit se relire. */
export const isStale = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.status === 412 || error.status === 409 || error.message === 'DRIVE_DISABLED')

export function notifyFailure(error: unknown) {
  useNotificationsStore().push('error', messageForFailure(error))
}

/**
 * Un refus de suppression est un 409 (la chose est encore utilisée) : on dit pourquoi, avec le texte de l'écran, au lieu
 * du « autre modification en cours » des conflits d'écriture.
 */
export function notifyDeleteFailure(error: unknown, usedMessage: string) {
  if (error instanceof ApiError && error.status === 409)
    useNotificationsStore().push('error', usedMessage)
  else notifyFailure(error)
}
