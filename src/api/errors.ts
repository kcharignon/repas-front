/**
 * Erreur renvoyée par l'API (`{"error":{"message":"…"}}`, ADR 0007 du back) ou impossibilité de la joindre (`status` 0).
 * Les codes utiles au front : 401 (session), 403 (droits), 404, 409 (conflit, relire et recommencer), 412 (la ressource a
 * été modifiée depuis sa lecture), 422 (corps invalide), 429 (`retryAfter` en secondes).
 */
export class ApiError extends Error {
  readonly status: number
  readonly retryAfter: number | null

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
  }

  static fromResponse(response: Response, body: unknown): ApiError {
    const retryAfter = Number(response.headers.get('Retry-After'))
    return new ApiError(
      response.status,
      messageOf(body) ?? response.statusText ?? `HTTP ${response.status}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    )
  }

  static network(cause: unknown): ApiError {
    return new ApiError(0, cause instanceof Error ? cause.message : 'Réseau indisponible')
  }
}

function messageOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null
  const error = body.error
  if (typeof error !== 'object' || error === null || !('message' in error)) return null

  return typeof error.message === 'string' ? error.message : null
}
