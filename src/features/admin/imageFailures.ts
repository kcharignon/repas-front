import { ApiError } from '@/api'
import { i18n } from '@/i18n'
import { messageForFailure } from '@/notifications/failures'

/** Ce que le back répond à un envoi d'image (ADR 0039 du back) : chaque code a sa phrase, jamais le code à l'écran. */
const CODES = new Map([
  ['IMAGE_TOO_LARGE', 'admin.image.errors.tooLarge'],
  ['IMAGE_NOT_AN_IMAGE', 'admin.image.errors.notAnImage'],
  ['IMAGE_UNSUPPORTED', 'admin.image.errors.notAnImage'],
  ['IMAGE_URL_REFUSED', 'admin.image.errors.linkRefused'],
  ['IMAGE_DOWNLOAD_FAILED', 'admin.image.errors.downloadFailed'],
  ['IMAGE_DOWNLOAD_RATE_LIMITED', 'admin.image.errors.rateLimited'],
  ['WRITE_RATE_LIMITED', 'admin.image.errors.rateLimited'],
  // Un envoi interrompu, ou une panne du serveur : on ne sait rien de plus que « ça n'a pas marché »
  ['IMAGE_FILE_MISSING', 'admin.image.errors.sendFailed'],
  ['IMAGE_PROCESSING_FAILED', 'admin.image.errors.sendFailed'],
  ['IMAGE_STORAGE_FAILED', 'admin.image.errors.sendFailed'],
])

/**
 * Le texte d'un envoi d'image refusé. Un `413` de la bordure arrive SANS corps JSON (le message est alors le texte du statut) : c'est « trop
 * lourde ». Réseau coupé : « pas de connexion ». Session perdue ou droits : les phrases habituelles.
 */
export function messageForImageFailure(error: unknown): string {
  const t = (key: string) => i18n.global.t(key)
  if (!(error instanceof ApiError)) return t('admin.image.errors.sendFailed')
  const code = CODES.get(error.message)
  if (code !== undefined) return t(code)
  switch (error.status) {
    case 0:
      return t('admin.image.errors.offline')
    case 413:
      return t('admin.image.errors.tooLarge')
    case 429:
      return t('admin.image.errors.rateLimited')
    case 401:
    case 403:
      return messageForFailure(error)
    default:
      return t('admin.image.errors.sendFailed')
  }
}
