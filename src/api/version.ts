/**
 * Version d'une ressource (ADR 0016 du back) : l'API renvoie `ETag: "3"` à la lecture d'une recette ou d'une liste de
 * courses, et accepte `If-Match: "3"` à l'écriture pour ne pas écraser le travail d'un autre onglet ou appareil.
 */
export function versionOf(response: Response): number | null {
  const match = /^"(\d+)"$/.exec(response.headers.get('ETag') ?? '')

  return match?.[1] === undefined ? null : Number(match[1])
}

/** En-têtes d'une écriture protégée par la version lue ; sans version, aucun contrôle (la dernière écriture gagne). */
export function ifMatch(version: number | null | undefined): Record<string, string> {
  return version === null || version === undefined ? {} : { 'If-Match': `"${version}"` }
}
