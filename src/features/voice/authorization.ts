import type { LocationQuery } from 'vue-router'

import type { AlexaAuthorizationPayload } from '@/api'

/** Le corps de `POST /api/v1/voice/alexa/authorize` (VOX-202) : les cinq paramètres OAuth que l'application Alexa envoie à la page. */
export type AuthorizationRequest = AlexaAuthorizationPayload

/** Les noms des paramètres de la page `/alexa/lier` (OAuth 2.0 : `response_type` et `scope` sont ignorés). */
const PARAMETERS = {
  clientId: 'client_id',
  redirectUri: 'redirect_uri',
  state: 'state',
  codeChallenge: 'code_challenge',
  codeChallengeMethod: 'code_challenge_method',
} as const satisfies Record<keyof AuthorizationRequest, string>

const first = (value: LocationQuery[string] | undefined): string | null =>
  typeof value === 'string' && value !== '' ? value : null

/**
 * La demande d'autorisation lue dans l'adresse de la page, ou `null` s'il en manque un paramètre (ou s'il est répété) : la page ne
 * devine rien et n'appelle pas le back. Elle ne juge pas des valeurs, le back le fait (`422`).
 */
export function readAuthorizationRequest(query: LocationQuery): AuthorizationRequest | null {
  const read = (name: keyof AuthorizationRequest) => first(query[PARAMETERS[name]])
  const request = {
    clientId: read('clientId'),
    redirectUri: read('redirectUri'),
    state: read('state'),
    codeChallenge: read('codeChallenge'),
    codeChallengeMethod: read('codeChallengeMethod'),
  }

  return Object.values(request).includes(null) ? null : (request as AuthorizationRequest)
}

/**
 * L'adresse de retour reçue du back n'est suivie que si c'est une adresse web : jamais `javascript:` ni `data:`, même si le back se
 * trompait un jour (il ne renvoie qu'une adresse autorisée, `ALEXA_REDIRECT_URIS`).
 */
export function isWebAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const { protocol } = new URL(value)

    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
