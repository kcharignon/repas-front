// Le visiteur non connecté (ticket G) : jamais mesuré sur le vrai site (DRV-002 et DRV-011 ont été faits compte connecté), donc lu par
// PLUSIEURS signes cumulés dans les liens et boutons de la page, et seulement quand ils s'accordent. Les libellés ci-dessous sont
// plausibles, pas mesurés ; en cas de doute, l'état est « inconnu » et l'agent n'arrête rien (les détections de redirection et de 401
// restent). Les signes lus sont montrés dans le diagnostic, pour que la recette confirme ou corrige cette liste.
import { describe, expect, it } from 'vitest'

import { describeSession, readSession } from '../src/leclerc/session'
import { fixture } from './leclerc-helpers'

const page = (body: string) => `<html><body>${body}</body></html>`

describe('un visiteur', () => {
  it.each([
    [
      'un lien « Se connecter » et un lien « Créer un compte »',
      '<a href="/connexion">Se connecter</a> <a href="/inscription">Créer un compte</a>',
      ['LOGIN_LINK', 'REGISTER_LINK'],
    ],
    [
      'un seul lien « Connexion / Inscription »',
      '<a href="/compte">Connexion / Inscription</a>',
      ['LOGIN_LINK', 'REGISTER_LINK'],
    ],
    [
      'un bouton « Identifiez-vous » et un champ de mot de passe',
      '<button type="button">Identifiez-vous</button><form><input type="password" name="p"></form>',
      ['LOGIN_LINK', 'PASSWORD_FIELD'],
    ],
    [
      'des libellés en majuscules, accentués ou aux espaces insécables',
      '<a>SE&nbsp;CONNECTER</a><a><span>S’inscrire</span></a>',
      ['LOGIN_LINK', 'REGISTER_LINK'],
    ],
    [
      'un indicateur d’état à faux et un lien « Se connecter »',
      '<a>Se connecter</a><script>var s = {"bConnecte": false}</script>',
      ['LOGIN_LINK', 'STATE_FLAG_OFF'],
    ],
  ])('est reconnu à %s', (_name, body, signs) => {
    const reading = readSession(page(body))

    expect(reading.state).toBe('VISITOR')
    expect(reading.signs).toEqual(signs)
  })
})

describe('un client connecté', () => {
  it.each([
    ['un lien « Se déconnecter »', '<a href="/sortie">Se déconnecter</a>', ['LOGOUT_LINK']],
    ['un lien « Déconnexion »', '<a>Déconnexion</a> <a>Mon compte</a>', ['LOGOUT_LINK']],
    ['un lien « Mes commandes »', '<a>Mes commandes</a>', ['ORDERS_LINK']],
    [
      'un indicateur d’état à vrai',
      '<script>var s = {"bClientConnecte":true}</script>',
      ['STATE_FLAG_ON'],
    ],
  ])('est reconnu à %s', (_name, body, signs) => {
    const reading = readSession(page(body))

    expect(reading.state).toBe('MEMBER')
    expect(reading.signs).toEqual(signs)
  })

  it('« Déconnexion » n’est pas lu comme « Connexion »', () => {
    expect(readSession(page('<a>Déconnexion</a>')).signs).toEqual(['LOGOUT_LINK'])
  })
})

describe('dans le doute, l’état est inconnu (l’agent ne bloque jamais sur un seul signe)', () => {
  it.each([
    ['une page vide', ''],
    ['la page d’un magasin sans aucun des libellés', fixture('recherche-farine.html')],
    ['un seul lien « Se connecter »', page('<a>Se connecter</a>')],
    ['un seul champ de mot de passe', page('<input type="password">')],
    ['un lien « Mon compte » seul', page('<a>Mon compte</a>')],
    [
      'des signes de visiteur ET de client',
      page('<a>Se connecter</a><a>Créer un compte</a><a>Se déconnecter</a>'),
    ],
    [
      'des libellés qui ne sont que dans les scripts',
      page(
        '<script>var t = {"a":"Se connecter","b":"Créer un compte","c":"Se déconnecter"}</script>',
      ),
    ],
    [
      'des libellés dans un commentaire ou un style',
      page('<!-- Se connecter Créer un compte --><style>.x::after{content:"Se connecter"}</style>'),
    ],
    [
      'un long paragraphe qui parle de connexion et d’inscription',
      page(
        '<a href="/aide">Pour vous connecter à votre compte ou vous inscrire, consultez notre page d’aide complète sur les comptes clients</a>',
      ),
    ],
  ])('%s', (_name, html) => {
    expect(readSession(html).state).toBe('UNKNOWN')
  })

  it('les signes d’un état inconnu restent listés (pour le rapport)', () => {
    expect(readSession(page('<a>Se connecter</a>')).signs).toEqual(['LOGIN_LINK'])
  })
})

describe('la description du rapport', () => {
  it('ne contient que des mots fixes et des noms de signes', () => {
    expect(describeSession(readSession(page('<a>Se connecter</a><a>Créer un compte</a>')))).toBe(
      'visiteur (signes : LOGIN_LINK, REGISTER_LINK)',
    )
    expect(describeSession(readSession(page('<a>Se déconnecter</a>')))).toBe(
      'connecté (signes : LOGOUT_LINK)',
    )
    expect(describeSession(readSession(page('')))).toBe('indéterminé (aucun signe)')
    expect(describeSession(readSession(page('<a>Se connecter</a>')))).toBe(
      'indéterminé (signes : LOGIN_LINK)',
    )
  })
})
