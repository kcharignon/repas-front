import { describe, expect, it } from 'vitest'

import { isWebAddress, readAuthorizationRequest } from '../authorization'

const complete = {
  client_id: 'repas-alexa',
  redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA',
  state: 'etat-1',
  code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  code_challenge_method: 'S256',
}

describe('readAuthorizationRequest', () => {
  it('lit les cinq paramètres et ignore response_type et scope', () => {
    expect(
      readAuthorizationRequest({ ...complete, response_type: 'code', scope: 'voice' }),
    ).toEqual({
      clientId: 'repas-alexa',
      redirectUri: 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA',
      state: 'etat-1',
      codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      codeChallengeMethod: 'S256',
    })
  })

  it.each(Object.keys(complete))('rend null quand %s manque', (name) => {
    const { [name]: _removed, ...rest } = complete as Record<string, string>

    expect(readAuthorizationRequest(rest)).toBeNull()
  })

  it('rend null pour un paramètre vide ou répété', () => {
    expect(readAuthorizationRequest({ ...complete, state: '' })).toBeNull()
    expect(readAuthorizationRequest({ ...complete, state: ['a', 'b'] })).toBeNull()
    expect(readAuthorizationRequest({ ...complete, state: null })).toBeNull()
  })
})

describe('isWebAddress', () => {
  it.each(['https://pitangui.amazon.com/x?state=a&code=b', 'http://localhost:8080/x'])(
    'accepte %s',
    (value) => expect(isWebAddress(value)).toBe(true),
  )

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '/chemin',
    'pas une adresse',
    '',
    undefined,
    3,
  ])('refuse %s', (value) => expect(isWebAddress(value)).toBe(false))
})
