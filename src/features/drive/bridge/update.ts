/**
 * La mise à jour de l'application par elle-même (DRV-639), vue de la page : l'application (variante hors Google Play) cherche une version
 * plus récente, la télécharge dans son espace privé, vérifie son empreinte SHA-256 et ouvre l'installateur d'Android. La page ne choisit
 * rien : ni adresse, ni version, ni empreinte. Elle demande (`update.check`, `update.start`) et lit l'état (`update.state`).
 *
 * Les mots de l'état sont ceux du protocole du pont (`android/README.md`), écrits par `UpdateState.wire` côté Kotlin.
 */
export const UPDATE_STATUSES = [
  'inconnu',
  'verification',
  'aJour',
  'miseAJourDisponible',
  'telechargement',
  'pretAInstaller',
  'erreur',
] as const

export type AppUpdateStatus = (typeof UPDATE_STATUSES)[number]

/** Un code d'erreur de la mise à jour : des majuscules, jamais un texte (la page choisit la phrase). */
export type AppUpdateErrorCode = string

/** L'état de la mise à jour, tel que l'application le dit. */
export type AppUpdateState =
  | { status: 'inconnu' }
  | { status: 'verification' }
  | { status: 'aJour' }
  | { status: 'miseAJourDisponible'; version: string }
  | { status: 'telechargement'; version: string; progress: number }
  | { status: 'pretAInstaller'; version: string }
  | { status: 'erreur'; code: AppUpdateErrorCode; version: string | null }

const VERSION = /^\d{1,4}\.\d{1,3}\.\d{1,3}$/
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/**
 * Lit le contenu d'un message `update.state`. `null` : mal formé (état inconnu, version ou progression hors forme, code qui n'est pas un mot en
 * majuscules). Rien n'est recopié tel quel : seuls les champs du protocole sortent, validés.
 */
export function parseUpdateState(message: unknown): AppUpdateState | null {
  const body = record(message)
  if (body === null) return null
  const status = body.state
  const version = body.version
  const hasVersion = typeof version === 'string' && VERSION.test(version)

  switch (status) {
    case 'inconnu':
    case 'verification':
    case 'aJour':
      return { status }
    case 'miseAJourDisponible':
    case 'pretAInstaller':
      return hasVersion ? { status, version } : null
    case 'telechargement': {
      const progress = body.progress
      return hasVersion &&
        typeof progress === 'number' &&
        Number.isInteger(progress) &&
        progress >= 0 &&
        progress <= 100
        ? { status, version, progress }
        : null
    }
    case 'erreur': {
      if (typeof body.code !== 'string' || !CODE.test(body.code)) return null
      if (version !== undefined && !hasVersion) return null

      return { status, code: body.code, version: hasVersion ? version : null }
    }
    default:
      return null
  }
}
