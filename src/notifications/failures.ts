import { ApiError } from '@/api'
import { i18n } from '@/i18n'

import { useNotificationsStore } from './store'

const t = (key: string, named?: Record<string, unknown>) => i18n.global.t(key, named ?? {})

/** Le message que lit l'utilisateur pour un échec d'écriture, selon le code renvoyé par le back (ADR 0007, 0016). */
export function messageForFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return t('errors.generic')

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

/** 412 et 409 disent que la ressource a changé ailleurs : l'écran doit se relire. */
export const isStale = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 412 || error.status === 409)

export function notifyFailure(error: unknown) {
  useNotificationsStore().push('error', messageForFailure(error))
}
