// Les sondes du site réel (ticket B de l'audit du 2026-10-18) : ce que l'agent peut dire d'une adresse, d'une réponse et d'une page SANS en
// rapporter la moindre valeur. Chaque fonction ne rend que des formes (`N`, `V`), des noms de clés ou d'en-têtes et des nombres. Données inventées.
import { describe, expect, it } from 'vitest'

import {
  addressShape,
  cookieFacts,
  deliveryFacts,
  headerNames,
  KNOWN_KEYS,
  stateKeys,
} from '../src/leclerc/probe'

describe('la forme d’une adresse : des motifs, jamais les nombres, la ville ni les noms de page inconnus', () => {
  it.each([
    ['/magasin-123456-123456-Ville-Test/accueil.aspx', '/magasin-N-N-V/accueil.aspx'],
    ['/magasin-123456-123456-Ville-Test/recherche.aspx', '/magasin-N-N-V/recherche.aspx'],
    ['/magasin-123456-123456-Ville-Test/', '/magasin-N-N-V/'],
    ['/magasin-123456-123456-Ville-Test', '/magasin-N-N-V'],
    ['/magasin-123456-123456/', '/magasin-N-N/'],
    ['/magasin-123456-123456', '/magasin-N-N'],
    ['/magasin-123456-654321/panier.aspx', '/magasin-N-N/panier.aspx'],
    ['/MAGASIN-123456-123456-Ville-Test/Accueil.aspx', '/magasin-N-N-V/Accueil.aspx'],
  ])('%s donne %s', (path, shape) => {
    expect(addressShape(path)).toBe(shape)
  })

  it.each([
    ['/', '/'],
    ['', '/'],
    ['/connexion.aspx', '/connexion.aspx'],
    ['/produit-4242424.aspx', '/produit-N.aspx'],
  ])('%s, hors d’un magasin, donne %s', (path, shape) => {
    expect(addressShape(path)).toBe(shape)
  })

  it('une page au nom inconnu, long, accentué ou encodé est cachée, et ce qui suit n’est jamais détaillé', () => {
    expect(addressShape('/magasin-123456-123456-Ville-Test/rayon/fruits/legumes')).toBe(
      '/magasin-N-N-V/rayon/…',
    )
    expect(addressShape('/magasin-123456-123456-Ville-Test/jean.dupont@exemple.fr')).toBe(
      '/magasin-N-N-V/…',
    )
    expect(addressShape('/magasin-123456-123456-Ville-Test/%C3%A9t%C3%A9')).toBe('/magasin-N-N-V/…')
    expect(addressShape(`/magasin-123456-123456-Ville-Test/${'a'.repeat(80)}`)).toBe(
      '/magasin-N-N-V/…',
    )
    expect(addressShape('/jean.dupont@exemple.fr/profil')).toBe('/…/…')
  })

  it('le nom de la ville, redit dans une page, est caché aussi', () => {
    expect(addressShape('/magasin-123456-123456-Zorglub/Zorglub')).toBe('/magasin-N-N-V/V')
  })

  it('une requête et un fragment ne sont jamais lus', () => {
    expect(
      addressShape('/magasin-123456-123456-Ville-Test/recherche.aspx?TexteRecherche=farine#x'),
    ).toBe('/magasin-N-N-V/recherche.aspx')
  })

  it('une adresse hostile ne laisse passer ni chiffre, ni ville, ni adresse', () => {
    const shape = addressShape(
      '/magasin-999111-999111-Zorglub-Sur-Mer/produit-4242424.aspx?mail=a@b.fr',
    )
    expect(shape).toBe('/magasin-N-N-V/produit-N.aspx')
    expect(shape).not.toMatch(/\d|Zorglub|@/)
  })
})

describe('les noms des en-têtes de réponse : des noms seulement, sans les en-têtes de cookie', () => {
  it('garde les noms propres, en minuscules, sans doublon, triés', () => {
    expect(
      headerNames(['Content-Type', 'x-datadome', 'CACHE-CONTROL', 'content-type', 'Server']),
    ).toEqual(['cache-control', 'content-type', 'server', 'x-datadome'])
  })

  it('écarte les cookies, l’autorisation et tout ce qui n’a pas la forme d’un nom d’en-tête', () => {
    expect(
      headerNames([
        'set-cookie',
        'Set-Cookie2',
        'cookie',
        'authorization',
        'proxy-authorization',
        'x-ok',
        'a',
        'nom avec espace',
        'x-é',
        'x'.repeat(60),
        '1abc',
      ]),
    ).toEqual(['x-ok'])
  })

  it('borne le nombre de noms', () => {
    const many = Array.from(
      { length: 100 },
      (_, index) =>
        `x-h${String.fromCharCode(97 + (index % 26))}${'b'.repeat(Math.floor(index / 26) + 1)}`,
    )
    expect(headerNames(many).length).toBeLessThanOrEqual(40)
  })
})

describe('le point de livraison : lu ou non, égal ou non au numéro de l’adresse, jamais sa valeur', () => {
  it('lu et différent du numéro de l’adresse', () => {
    expect(deliveryFacts('var page = {"sNoPointLivraison":"555123"}', '123456')).toEqual({
      read: true,
      sameAsAddress: false,
    })
  })

  it('lu et égal au numéro de l’adresse', () => {
    expect(deliveryFacts('var page = {"sNoPointLivraison":"123456"}', '123456')).toEqual({
      read: true,
      sameAsAddress: true,
    })
  })

  it('absent de la page : non lu, et rien à comparer', () => {
    expect(deliveryFacts('<p>rien</p>', '123456')).toEqual({ read: false, sameAsAddress: null })
  })

  it('sans numéro d’adresse (hors d’un magasin) : lu, mais rien à comparer', () => {
    expect(deliveryFacts('{"sNoPointLivraison":"555123"}', null)).toEqual({
      read: true,
      sameAsAddress: null,
    })
  })

  it('lit aussi la page dont les guillemets sont codés en entités', () => {
    expect(
      deliveryFacts('{&quot;sNoPointLivraison&quot;:&quot;555123&quot;}', '123456'),
    ).toMatchObject({
      read: true,
    })
  })
})

describe('les clés de l’état embarqué : celles que l’agent connaît, celles de la connexion, un compte des autres', () => {
  const page = `<script>var state = {
    "sNoPointLivraison":"PL424242","lstProduits":[],"lstProduitsLight":[],
    "bClientConnecte":true,"sNomClientSecret":"Jean Dupont","recentSearch":{"saintEtienne":1,"farine":2},
    "iIdUtilisateurCourant":42,"autre":{"x":1}
  };</script>`

  it('dit lesquelles des clés connues sont présentes et lesquelles manquent', () => {
    const keys = stateKeys(page)

    expect(keys.present).toEqual(
      expect.arrayContaining(['lstProduits', 'lstProduitsLight', 'sNoPointLivraison']),
    )
    expect(keys.absent).toEqual(expect.arrayContaining(['iQuantitePanier', 'sTotalAPayer']))
    expect([...keys.present, ...keys.absent].sort()).toEqual([...KNOWN_KEYS].sort())
  })

  it('nomme les clés qui parlent de la connexion ou du compte (pour trouver le marqueur « connecté »), et seulement celles-là', () => {
    const keys = stateKeys(page)

    expect(keys.session).toEqual(['bClientConnecte', 'iIdUtilisateurCourant', 'sNomClientSecret'])
  })

  it('ne nomme jamais une autre clé : elle peut être une donnée de l’utilisateur (recherche récente, ville)', () => {
    const keys = stateKeys(page)

    for (const secret of ['recentSearch', 'saintEtienne', 'farine', 'autre']) {
      expect(JSON.stringify(keys)).not.toContain(secret)
    }
  })

  it('compte les clés distinctes, nommées ou non', () => {
    expect(stateKeys(page).total).toBe(11)
    expect(stateKeys('<p>aucune clé</p>').total).toBe(0)
  })

  it('une valeur n’est jamais prise pour une clé : un libellé qui imite une clé reste caché', () => {
    const tricky = `{"sLibelleLigne1":"Produit, \\"bClientConnecteFaux\\": oui","sNoPointLivraison":"1"}`
    const keys = stateKeys(tricky)

    expect(keys.session).toEqual([])
    expect(JSON.stringify(keys)).not.toContain('bClientConnecteFaux')
  })

  it('lit l’état dont les guillemets sont codés en entités', () => {
    expect(stateKeys('{&quot;bClientConnecte&quot;:true}').session).toEqual(['bClientConnecte'])
  })

  it('ne lit pas l’état échappé dans une chaîne : un libellé aux guillemets échappés pourrait imiter une clé', () => {
    expect(stateKeys('JSON.parse("{\\"bClientConnecte\\":true}")').session).toEqual([])
    expect(stateKeys('{"sLibelleLigne1":"A,\\"bClientConnecteFaux\\":b"}').session).toEqual([])
  })

  it('borne le nombre de noms rendus', () => {
    const many = Array.from(
      { length: 80 },
      (_, index) =>
        `"bClient${String.fromCharCode(65 + (index % 26))}${'x'.repeat(1 + Math.floor(index / 26))}":1`,
    ).join(',')
    expect(stateKeys(`{${many}}`).session.length).toBeLessThanOrEqual(20)
  })
})

describe('les cookies : un nombre et un oui/non, jamais un nom ni une valeur', () => {
  it('compte les cookies lisibles par la page et dit si l’un d’eux est celui d’une protection anti-robot', () => {
    expect(cookieFacts('datadome=SECRETVALUE; sid=ABC123; theme=dark')).toEqual({
      count: 3,
      antiBot: true,
    })
    expect(cookieFacts('sid=ABC123; theme=dark')).toEqual({ count: 2, antiBot: false })
  })

  it('reconnaît les noms usuels des protections anti-robot, sans tenir compte de la casse', () => {
    for (const name of [
      'datadome',
      'DataDome',
      'incap_ses_123_456',
      'visid_incap_789',
      '_abck',
      'cf_clearance',
    ]) {
      expect(cookieFacts(`${name}=x`).antiBot).toBe(true)
    }
    expect(cookieFacts('mon_datadome_perso=x').antiBot).toBe(false)
  })

  it('aucun cookie : zéro, non', () => {
    expect(cookieFacts('')).toEqual({ count: 0, antiBot: false })
    expect(cookieFacts('  ;  ; ')).toEqual({ count: 0, antiBot: false })
  })

  it('ne rend jamais une valeur ni un nom', () => {
    const facts = cookieFacts('datadome=SECRETVALUE; sid=ABC123')

    expect(JSON.stringify(facts)).not.toMatch(/SECRET|ABC123|datadome|sid/i)
  })
})
