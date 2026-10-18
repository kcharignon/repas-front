import { ApiError } from '@/api'
import { i18n } from '@/i18n'

import { useNotificationsStore } from './store'

const t = (key: string, named?: Record<string, unknown>) => i18n.global.t(key, named ?? {})

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
  ['DRIVE_STORE_MISMATCH', 'errors.driveStoreMismatch'],
  ['DRIVE_STORE_INVALID', 'errors.driveStoreInvalid'],
])

/** Le message que lit l'utilisateur pour un échec d'écriture, selon le code renvoyé par le back (ADR 0007, 0016). */
export function messageForFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return t('errors.generic')
  const code = driveCodes.get(error.message)
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
