// La FORME de la réponse du panier d'Auchan et son classement (DRV-752) : une réponse qui n'est pas du JSON est une connexion, un défi, une page d'erreur, un
// corps vide ou un JSON vide, et `CART_NOT_JSON` seulement quand rien d'autre ne l'explique. Les pages sont INVENTÉES (aucune n'a été vue sur le vrai panier).
// La forme ne porte jamais une valeur du site ni du compte.
import { describe, expect, it } from 'vitest'

import { describeCartReply, verdictOf } from '../src/auchan/cart-reply'
import type { Reply } from '../src/retailers/pacer'

const LOGIN_PAGE =
  '<html><body><form action="/x"><input type="email" name="u"><input type="password" name="p"></form></body></html>'
const KEYCLOAK_PAGE =
  '<html><body><form action="/auth/realms/r/protocol/openid-connect/auth"><button>Entrer</button></form></body></html>'
const RECAPTCHA_SCRIPT = '<script src="https://www.google.com/recaptcha/enterprise.js"></script>'

function reply(text: string, patch: Partial<Reply> = {}): Reply {
  return {
    status: 200,
    text,
    url: 'https://www.auchan.fr/cart?consentId=SECRET-CONSENT&cartId=SECRET-CART',
    redirected: false,
    headers: ['content-type', 'x-datadome'],
    contentType: 'text/html; charset=utf-8',
    ...patch,
  }
}

const verdict = (text: string, patch: Partial<Reply> = {}) =>
  verdictOf(describeCartReply(reply(text, patch)))

describe('le classement d’une réponse du panier qui n’est pas du JSON', () => {
  it.each([
    ['une page de connexion (champ de mot de passe)', LOGIN_PAGE, 'NOT_LOGGED_IN', 'LOGIN_FORM'],
    [
      'une page du serveur d’identité sans champ de mot de passe',
      KEYCLOAK_PAGE,
      'NOT_LOGGED_IN',
      'LOGIN_FORM',
    ],
    [
      'une page de connexion qui charge le reCAPTCHA invisible (ce n’est pas un défi)',
      `${LOGIN_PAGE}${RECAPTCHA_SCRIPT}`,
      'NOT_LOGGED_IN',
      'LOGIN_FORM',
    ],
    [
      'la page de vérification de DataDome',
      '<html><body><iframe src="https://geo.captcha-delivery.com/captcha/?x=1"></iframe></body></html>',
      'BLOCKED',
      'CHALLENGE',
    ],
    [
      'une page reCAPTCHA sans formulaire de connexion',
      `<html><body>${RECAPTCHA_SCRIPT}</body></html>`,
      'BLOCKED',
      'CHALLENGE',
    ],
    [
      'une page qui demande de prouver qu’on n’est pas un robot',
      '<html><body><p>Cochez : Je ne suis pas un robot</p></body></html>',
      'BLOCKED',
      'CHALLENGE',
    ],
    [
      'une page d’erreur du site',
      '<html><body><h1>Service temporairement indisponible</h1></body></html>',
      'CONTRACT_CHANGED',
      'CART_ERROR_PAGE',
    ],
    ['un corps vide', '', 'CONTRACT_CHANGED', 'CART_EMPTY'],
    ['un corps de blancs', ' \n\t ', 'CONTRACT_CHANGED', 'CART_EMPTY'],
    ['un objet JSON vide', '{}', 'CONTRACT_CHANGED', 'CART_JSON_EMPTY'],
    ['un tableau JSON vide', ' [] ', 'CONTRACT_CHANGED', 'CART_JSON_EMPTY'],
    ['null', 'null', 'CONTRACT_CHANGED', 'CART_JSON_EMPTY'],
  ] as const)('%s : %s %s', (_name, text, code, cause) => {
    const error = verdict(text)

    expect(error).toMatchObject({ code, cause, status: 200 })
    expect(error?.reply).toMatchObject({ status: 200 })
  })

  it('du JSON n’est jamais jugé ici : le panier le lit (ou dit CART_NO_CART)', () => {
    expect(
      verdict('{"cart":{"id":"x","items":[]}}', { contentType: 'application/json' }),
    ).toBeNull()
    expect(verdict('{"errors":[{"code":"99001"}]}', { contentType: 'application/json' })).toBeNull()
  })

  it.each([
    [
      'une page de cookies',
      '<html><body><p>Votre consentement</p><button>Tout accepter</button></body></html>',
    ],
    [
      'une page ordinaire avec un lien « Se connecter » et une bannière de cookies',
      '<html><body><a href="/auth/login">Se connecter</a><div>Gérer mes cookies</div></body></html>',
    ],
    ['une page sans aucun mot connu', '<html><body>Bienvenue</body></html>'],
    ['un texte simple', 'OK'],
  ])('%s : ni connexion, ni défi (CART_NOT_JSON : le panier le dira)', (_name, text) => {
    expect(verdict(text)).toBeNull()
  })

  it('un mot dans un script, un style ou un commentaire ne compte pas (la page ne le dit pas)', () => {
    const page =
      '<html><head><script>var m = "indisponible erreur"</script><style>.erreur{}</style></head><body><!-- erreur indisponible -->Bienvenue</body></html>'

    const facts = describeCartReply(reply(page))

    expect(facts.words).toEqual([])
  })
})

describe('la forme relevée', () => {
  it('un panier en JSON : code, type, taille, adresse en motif, corps, aucun mot', () => {
    const text = '{"cart":{"id":"x","items":[]}}'

    const facts = describeCartReply(reply(text, { contentType: 'application/json;charset=UTF-8' }))

    expect(facts).toEqual({
      status: 200,
      mime: 'application/json',
      length: text.length,
      redirected: false,
      address: '/cart',
      headers: ['content-type', 'x-datadome'],
      body: 'JSON',
      words: [],
    })
  })

  it('les mots sont dans l’ordre de la liste fermée, et seulement pour du HTML ou du texte', () => {
    const page = `<html><body>${LOGIN_PAGE}<p>Erreur</p><p>Tout accepter</p></body></html>`

    expect(describeCartReply(reply(page)).words).toEqual(['LOGIN', 'CONSENT', 'ERROR'])
    expect(describeCartReply(reply('{"error":"Erreur indisponible"}')).words).toEqual([])
  })

  it('une redirection est dite, avec le motif de l’adresse finale (liste fermée), jamais l’adresse', () => {
    const facts = describeCartReply(
      reply(LOGIN_PAGE, {
        redirected: true,
        url: 'https://www.auchan.fr/auth/realms/SECRET-REALM/protocol?code=SECRET-CODE',
      }),
    )

    expect(facts).toMatchObject({ redirected: true, address: '/auth/…' })
    expect(JSON.stringify(facts)).not.toMatch(/SECRET/)
  })

  it('une adresse qui n’est pas d’une page connue est cachée', () => {
    const facts = describeCartReply(
      reply('x', { url: 'https://www.auchan.fr/jean-dupont/pr-C123' }),
    )

    expect(facts.address).toBe('/…/…')
  })

  it('un type de média absent, ou qui n’a pas la forme d’un type, est dit tel quel', () => {
    expect(describeCartReply(reply('x', { contentType: null })).mime).toBeNull()
    expect(describeCartReply(reply('x', { contentType: 'jean.dupont@exemple.invalid' })).mime).toBe(
      'autre',
    )
  })

  it('aucune valeur du site ni du compte : ni le texte de la page, ni un cookie, ni une valeur d’en-tête, ni la requête de l’adresse', () => {
    const page =
      '<html><body><p>jean.dupont@exemple.invalid : Erreur de lark-cart=VALEUR-DE-COOKIE</p><input type="password"></body></html>'

    const facts = describeCartReply(
      reply(page, {
        headers: ['content-type', 'set-cookie', 'x-datadome', 'authorization', 'cookie'],
      }),
    )

    const text = JSON.stringify(facts)
    expect(text).not.toMatch(/jean|dupont|exemple|VALEUR|lark|SECRET|password|https:/)
    expect(facts.headers).toEqual(['content-type', 'x-datadome'])
  })
})
