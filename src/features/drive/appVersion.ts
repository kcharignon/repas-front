/**
 * La version de l'application Android « Repas » sans laquelle l'envoi au drive ne marche pas (DRV-640). Le site se met à jour tout seul
 * (il est chargé en direct dans l'application), l'application non : une ancienne version échoue en silence (« Finaliser » sans page,
 * libellés refusés…). En dessous, l'écran d'envoi n'ouvre ni Leclerc ni l'agent et mène à la mise à jour.
 *
 * UN SEUL ENDROIT. À relever quand une version de l'application devient nécessaire au drive (un changement du pont natif, de l'agent
 * embarqué ou de l'ouverture de Leclerc que l'ancienne version ne sait pas suivre) ; jamais pour un changement du seul site.
 */
export const MIN_DRIVE_APP_VERSION = '0.1.10'

/** Le nom des constructions de développement (`AppVersion.DEV_NAME`, côté Android) : le code courant, jamais une ancienne version. */
const DEV_BUILD = '0.0.0-dev'

const SEMVER = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:[-+].*)?$/

/** Les trois nombres d'une version `X.Y.Z` (un suffixe `-…` ou `+…` est ignoré) ; `null` si elle est absente ou mal formée. */
function parts(version: string | null | undefined): [number, number, number] | null {
  const match = typeof version === 'string' ? SEMVER.exec(version.trim()) : null

  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Compare deux versions NUMÉRIQUEMENT, nombre par nombre (0.1.10 est au-dessus de 0.1.9, jamais l'ordre des lettres) : négatif si `a` est
 * avant `b`, 0 si elles sont égales, positif sinon ; `null` si l'une des deux est absente ou mal formée.
 */
export function compareVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const left = parts(a)
  const right = parts(b)
  if (left === null || right === null) return null

  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

/** L'application est-elle assez récente pour le drive ? Une version inconnue ou mal formée ne l'est pas (les plus anciennes ne la disent pas). */
export function isDriveAppVersionEnough(version: string | null | undefined): boolean {
  if (version === DEV_BUILD) return true

  const order = compareVersions(version, MIN_DRIVE_APP_VERSION)

  return order !== null && order >= 0
}
