// Une page de recherche reconnue par sa STRUCTURE (ticket C) : le squelette que le site embarque dans toutes ses pages de magasin
// (point de livraison, total et lignes du panier, conteneur de produits), et l'absence de tout produit. Aucune page « aucun résultat »
// réelle n'a jamais été relevée : les formes ci-dessous sont plausibles, dérivées du squelette mesuré (DRV-002, DRV-011), pas mesurées.
// Une structure vraiment inconnue reste `CONTRACT_CHANGED`, avec la cause précise (ticket A).
import { describe, expect, it } from 'vitest'

import { LeclercError } from '../src/leclerc'
import { readSearchPage } from '../src/leclerc/search-page'
import { fixture } from './leclerc-helpers'

const reply = (text: string, extra: { status?: number; redirected?: boolean } = {}) => ({
  text,
  status: extra.status ?? 200,
  redirected: extra.redirected ?? false,
})

/** Le squelette habituel d'une page de magasin, sans produit. */
const SKELETON =
  '"sNoPointLivraison":"123456","sTotalAPayer":"0,00 €","iQuantitePanier":0,"lstProduitsLight":[]'
const script = (state: string) =>
  `<html><body><script>var widgets = {${state}}</script></body></html>`

const EMPTY_FORMS: [string, string][] = [
  [
    'une liste de produits vide',
    script(`${SKELETON},"widgets":[{"nom":"produits","lstProduits":[]}]`),
  ],
  [
    'une liste de produits vide, écrite avec des espaces et des retours à la ligne',
    script(`${SKELETON},\n"widgets": [ { "nom": "produits",\n "lstProduits" : [ \n ] } ]`),
  ],
  ['une liste de produits nulle', script(`${SKELETON},"widgets":[{"lstProduits":null}]`)],
  ['aucun conteneur de produits', script(SKELETON)],
  [
    'un état dont les guillemets sont écrits \\u0022',
    `<script>var s = "{\\u0022sNoPointLivraison\\u0022:\\u0022123456\\u0022,\\u0022sTotalAPayer\\u0022:\\u00220,00 €\\u0022,\\u0022lstProduits\\u0022:[]}"</script>`,
  ],
  [
    'un état encodé en entités HTML dans un attribut',
    `<div data-init="{&quot;sNoPointLivraison&quot;:&quot;123456&quot;,&quot;sTotalAPayer&quot;:&quot;0,00 €&quot;,&quot;lstProduits&quot;:[]}"></div>`,
  ],
  [
    'des lignes de panier sans libellé et aucun produit',
    script(
      `"sNoPointLivraison":"123456","sTotalAPayer":"3,87 €","lstProduits":null,"lstProduitsLight":[{"iIdProduit":1000001,"iQtePanier":3,"iQteDisponible":12}]`,
    ),
  ],
  [
    'un seul repère d’état, avec le message du site hors des scripts',
    `<p>Aucun résultat pour votre recherche</p>${script('"sNoPointLivraison":"123456"')}`,
  ],
  [
    'un seul repère d’état, avec le message du site en entités HTML',
    `<p>Nous n&#39;avons trouvé aucun produit.</p>${script('"sTotalAPayer":"0,00 €"')}`,
  ],
]

describe('une page sans produit mais au squelette du magasin est une liste vide', () => {
  it.each(EMPTY_FORMS)('reconnaît %s', (_name, page) => {
    expect(readSearchPage(reply(page))).toEqual([])
  })

  it.each([
    'recherche-vide.html',
    'recherche-vide-sans-liste.html',
    'recherche-vide-encodee.html',
    'recherche-vide-panier-garni.html',
  ])('reconnaît la fixture %s', (name) => {
    expect(readSearchPage(reply(fixture(name)))).toEqual([])
  })

  it('une page qui porte des produits rend ces produits, jamais une liste vide', () => {
    const products = readSearchPage(reply(fixture('recherche-farine.html')))

    expect(products.map((product) => product.id)).toEqual([
      '1000001',
      '1000002',
      '1000003',
      '1000004',
      '1000005',
    ])
  })

  it('une page redirigée qui garde le squelette du magasin reste une liste vide', () => {
    expect(
      readSearchPage(reply(fixture('recherche-vide-sans-liste.html'), { redirected: true })),
    ).toEqual([])
  })
})

describe('une structure inconnue reste CONTRACT_CHANGED, avec sa cause', () => {
  const causeOf = (page: string, extra: { status?: number; redirected?: boolean } = {}) => {
    try {
      readSearchPage(reply(page, extra))
    } catch (error) {
      expect(error).toBeInstanceOf(LeclercError)
      return error as LeclercError
    }
    throw new Error('Aucune erreur levée.')
  }

  it.each([
    ['une page vide', ''],
    ['une page sans état embarqué', fixture('recherche-changee.html')],
    ['la page d’erreur du site servie en 200', fixture('erreur-404.html')],
    ['un seul repère d’état et aucun message', script('"sNoPointLivraison":"123456"')],
    ['le message « aucun résultat » sans aucun repère d’état', '<p>Aucun résultat</p>'],
    [
      'des repères d’état qui ne sont que du texte de page',
      '<p>sNoPointLivraison sTotalAPayer lstProduits</p>',
    ],
  ])('%s : SEARCH_NO_STATE', (_name, page) => {
    const error = causeOf(page)

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_NO_STATE', status: 200 })
  })

  it('une page redirigée dont on ne reconnaît rien : SEARCH_REDIRECTED', () => {
    expect(causeOf(fixture('erreur-404.html'), { redirected: true })).toMatchObject({
      code: 'CONTRACT_CHANGED',
      cause: 'SEARCH_REDIRECTED',
    })
  })

  it.each([
    [
      'une liste non vide dont les champs ont été renommés',
      fixture('recherche-liste-illisible.html'),
    ],
    [
      'des libellés de produits sans identifiant lisible',
      script(
        `${SKELETON},"lstProduits":[{"sLibelleLigne1":"Farine de test","nrPVUnitaireTTC":1.29}]`,
      ),
    ],
    [
      'des prix de produits sans rien d’autre',
      script(`${SKELETON},"widgets":[{"sPrixUnitaire":"1,29 €"}]`),
    ],
    [
      'une liste non vide d’éléments non reconnus',
      script(`${SKELETON},"lstProduits":[[1,"Farine",1.29]]`),
    ],
  ])('%s : SEARCH_PRODUCTS_UNREADABLE (jamais « aucun produit »)', (_name, page) => {
    expect(causeOf(page)).toMatchObject({
      code: 'CONTRACT_CHANGED',
      cause: 'SEARCH_PRODUCTS_UNREADABLE',
    })
  })

  it('porte le code HTTP de la réponse, jamais un morceau de la page', () => {
    const error = causeOf('<p>secret=abc cookie=def</p>', { status: 200 })

    expect(error.status).toBe(200)
    expect(error.message).not.toContain('secret')
    expect(JSON.stringify(error)).not.toContain('cookie')
  })
})

describe('une page de connexion servie à la place des résultats', () => {
  it('est NOT_LOGGED_IN (LOGIN_FORM) quand elle n’a pas le squelette du magasin', () => {
    expect(() => readSearchPage(reply(fixture('connexion.html')))).toThrow(
      expect.objectContaining({ code: 'NOT_LOGGED_IN', cause: 'LOGIN_FORM' }),
    )
  })

  it('n’en est pas une quand le squelette du magasin est là (le bandeau d’un visiteur a un champ de mot de passe)', () => {
    const page = `<form><input type="password" name="p"></form>${script(SKELETON)}`

    expect(readSearchPage(reply(page))).toEqual([])
  })
})
