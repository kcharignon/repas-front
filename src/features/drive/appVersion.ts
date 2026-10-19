/**
 * La version de l'application Android « Repas » sans laquelle l'envoi au drive ne marche pas (DRV-640). Le site se met à jour tout seul
 * (il est chargé en direct dans l'application), l'application non : une ancienne version échoue en silence (« Finaliser » sans page,
 * libellés refusés…). En dessous, l'écran d'envoi n'ouvre ni Leclerc ni l'agent et mène à la mise à jour.
 *
 * UN SEUL ENDROIT. À relever quand une version de l'application devient nécessaire au drive (un changement du pont natif, de l'agent
 * embarqué ou de l'ouverture de Leclerc que l'ancienne version ne sait pas suivre) ; jamais pour un changement du seul site.
 */
export const MIN_DRIVE_APP_VERSION = '0.1.10'

/**
 * La première version de l'application dont l'agent embarqué connaît `rayonHints` (DRV-642, agent 0.31.0). Un agent plus ancien refuse en bloc un
 * plan qui porte une clé qu'il ne connaît pas : le site n'envoie les rayons conseillés qu'à partir de cette version (en dessous, la liste garde l'ordre
 * du site). À fixer sur la première version Android publiée avec l'agent 0.31.0 ou plus (`android/agent.js.sha384`) ; jamais plus bas.
 */
export const RAYON_HINTS_APP_VERSION = '0.1.15'

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

/**
 * La forme que le serveur retient (DRV-637, `PUT /api/v1/users/me/app-version`) : trois nombres, rien d'autre, 20 caractères au plus. Une
 * construction de développement (`0.0.0-dev`) ou une version mal formée n'est pas envoyée (le serveur la refuserait par un `422`).
 */
const REPORTABLE = /^[0-9]+\.[0-9]+\.[0-9]+$/

/** Cette version peut-elle être envoyée au serveur ? */
export function isReportableAppVersion(version: string | null | undefined): version is string {
  return typeof version === 'string' && version.length <= 20 && REPORTABLE.test(version)
}

/** Ce que le serveur sait des versions publiées (`appUpdate` de `GET /api/v1/me`, DRV-637). */
export interface AppUpdateFacts {
  latest?: string | null
  minimum?: string | null
  /** Calculé par le serveur pour la version ENREGISTRÉE du compte, pas pour celle qui tourne. */
  outdated: boolean
}

/**
 * Faut-il inviter à mettre à jour l'application (DRV-637) ? À appeler seulement dans l'application. `running` : la version donnée par le pont
 * (`null` si elle n'a pas répondu). Elle est comparée NUMÉRIQUEMENT à `latest` et à `minimum` : juste après une mise à jour, le serveur peut
 * encore croire l'ancienne version (il ne l'apprend qu'au démarrage, au plus une fois par minute). Version du pont inconnue ou mal formée :
 * le calcul du serveur (`outdated`) sert de repli. Le serveur ne connaît ni `latest` ni `minimum` : jamais d'invitation. Une construction de
 * développement est le code courant : jamais d'invitation.
 */
export function offersAppUpdate(
  running: string | null | undefined,
  facts: AppUpdateFacts | null | undefined,
): boolean {
  if (facts === null || facts === undefined) return false
  const targets = [facts.latest, facts.minimum].filter(
    (target): target is string => typeof target === 'string',
  )
  if (targets.length === 0 || running === DEV_BUILD) return false
  if (parts(running) === null) return facts.outdated

  return targets.some((target) => (compareVersions(running, target) ?? 0) < 0)
}

/** L'agent de cette application connaît-il les rayons conseillés ? Une version inconnue ou mal formée ne les connaît pas. */
export function isRayonHintsAppVersion(version: string | null | undefined): boolean {
  if (version === DEV_BUILD) return true

  const order = compareVersions(version, RAYON_HINTS_APP_VERSION)

  return order !== null && order >= 0
}
