import { describe, expect, it } from 'vitest'

import { cartBody, cartPayload, parseCartBody, summarizeCartResponse } from '../cart'
import { ERROR_PAGE } from './fixtures'

const ADD = { action: 1, productId: '1000001', quantity: 1, deliveryPoint: '123456' } as const

/** L'ajout relevé sur le site (DRV-007), avec un point de livraison INVENTÉ. */
const SITE_ADD = {
  action: 1,
  productId: '1955',
  quantity: 1,
  deliveryPoint: '123456',
  searchText: 'farine',
} as const

const SITE_ADD_JSON =
  '{"eTypeAction":1,"iIdProduit":"1955","iQuantite":1,"sNoPointLivraison":"123456","objContexteProvenanceArticle":{"eOrigine":4,"eTypePage":3,"sTexteRecherche":"farine","eVue":0,"sInformationsComplementaires":"uni-2"}}'

const SITE_REMOVE_JSON =
  '{"eTypeAction":2,"iIdProduit":"1955","iQuantite":0,"sNoPointLivraison":"123456"}'

describe('cartPayload et cartBody', () => {
  it('reproduit champ par champ l’ajout du site : identifiant en texte, contexte joint, mêmes clés dans le même ordre', () => {
    // When
    const payload = cartPayload(SITE_ADD)

    // Then
    expect(payload).toBe(SITE_ADD_JSON)
    const decoded = JSON.parse(payload) as Record<string, unknown>
    expect(Object.keys(decoded)).toEqual([
      'eTypeAction',
      'iIdProduit',
      'iQuantite',
      'sNoPointLivraison',
      'objContexteProvenanceArticle',
    ])
    expect(decoded.iIdProduit).toBe('1955')
    expect(decoded.objContexteProvenanceArticle).toEqual({
      eOrigine: 4,
      eTypePage: 3,
      sTexteRecherche: 'farine',
      eVue: 0,
      sInformationsComplementaires: 'uni-2',
    })
  })

  it('reproduit le retrait du site : identifiant en texte, quantité 0, sans contexte', () => {
    const payload = cartPayload({ ...SITE_ADD, action: 2, quantity: 0 })

    expect(payload).toBe(SITE_REMOVE_JSON)
    expect(JSON.parse(payload)).not.toHaveProperty('objContexteProvenanceArticle')
  })

  it('donne les tailles de corps relevées sur le site : 317 octets à l’ajout, 124 au retrait', () => {
    expect(cartBody(SITE_ADD)).toHaveLength(317)
    expect(cartBody({ ...SITE_ADD, action: 2, quantity: 0 })).toHaveLength(124)
  })

  it('joint un texte de recherche vide quand rien n’a été cherché', () => {
    const { searchText: _unused, ...withoutSearch } = SITE_ADD

    expect(JSON.parse(cartPayload(withoutSearch)).objContexteProvenanceArticle).toMatchObject({
      sTexteRecherche: '',
    })
    expect(
      JSON.parse(cartPayload({ ...SITE_ADD, searchText: null })).objContexteProvenanceArticle,
    ).toMatchObject({ sTexteRecherche: '' })
  })

  it('n’envoie le contexte qu’à l’ajout (action 1), même pour une quantité de 2', () => {
    expect(JSON.parse(cartPayload({ ...SITE_ADD, quantity: 2 }))).toHaveProperty(
      'objContexteProvenanceArticle',
    )
    expect(JSON.parse(cartPayload({ ...SITE_ADD, action: 2, quantity: 2 }))).not.toHaveProperty(
      'objContexteProvenanceArticle',
    )
  })

  it('omet le contexte dans la variante de diagnostic', () => {
    expect(JSON.parse(cartPayload({ ...SITE_ADD, withoutContext: true }))).toEqual({
      eTypeAction: 1,
      iIdProduit: '1955',
      iQuantite: 1,
      sNoPointLivraison: '123456',
    })
  })

  it('place le JSON encodé dans le champ de formulaire d, avec des guillemets et des accents bien encodés', () => {
    const body = cartBody({ ...SITE_ADD, searchText: 'crème "fraîche"' })

    expect(body.startsWith('d=')).toBe(true)
    expect(body).not.toContain('"')
    expect(new URLSearchParams(body).get('d')).toBe(
      cartPayload({ ...SITE_ADD, searchText: 'crème "fraîche"' }),
    )
    expect(new URLSearchParams(cartBody(SITE_ADD)).get('d')).toBe(SITE_ADD_JSON)
  })
})

describe('parseCartBody', () => {
  it('relit un corps de formulaire', () => {
    expect(parseCartBody(cartBody(ADD))).toEqual({ productId: '1000001', action: 1, quantity: 1 })
  })

  it('relit un JSON brut, des paramètres d’URL et un FormData', () => {
    const view = { productId: '1000001', action: 1, quantity: 1 }

    expect(parseCartBody(cartPayload(ADD))).toEqual(view)
    expect(parseCartBody(new URLSearchParams(cartBody(ADD)))).toEqual(view)
    const form = new FormData()
    form.set('d', cartPayload(ADD))
    expect(parseCartBody(form)).toEqual(view)
  })

  it('accepte un identifiant donné en texte', () => {
    expect(parseCartBody('{"iIdProduit":"42","eTypeAction":2,"iQuantite":0}')).toEqual({
      productId: '42',
      action: 2,
      quantity: 0,
    })
  })

  it.each([
    [undefined],
    [null],
    [12],
    ['d=pas du json'],
    ['rien'],
    ['d=%5B1%5D'],
    [new FormData()],
  ])('rend null pour %j', (body) => {
    expect(parseCartBody(body)).toBeNull()
  })

  it('rend des valeurs nulles pour les champs absents', () => {
    expect(parseCartBody('{"autre":1}')).toEqual({ productId: null, action: null, quantity: null })
  })
})

describe('summarizeCartResponse', () => {
  it('résume un tableau d’évènements dont le panier', () => {
    // Given : une réponse inventée au format décrit dans recherche.md
    const response = JSON.stringify([
      { eTypeEvenement: 1, sNomEvenement: 'Panier123456', nrTotal: 12.5, iNbArticles: 3 },
      { eTypeEvenement: 4, sMessage: 'Produit ajouté' },
    ])

    // When
    const summary = summarizeCartResponse(response, 200, '1000001')

    // Then
    expect(summary.blocked).toBe(false)
    expect(summary.lines[0]).toBe('Réponse JSON : 2 évènement(s).')
    expect(summary.lines).toContain(
      '- évènement 1 (type 1, panier) : eTypeEvenement=1 ; sNomEvenement=Panier123456 ; nrTotal=12.5 ; iNbArticles=3',
    )
    expect(summary.lines.some((line) => line.startsWith('- évènement 2 (type 4'))).toBe(true)
  })

  it('lit l’enveloppe d des services .NET, y compris en texte', () => {
    const inner = JSON.stringify([{ eTypeEvenement: 1, nrTotal: 3 }])

    expect(summarizeCartResponse(JSON.stringify({ d: JSON.parse(inner) }), 200, '1').lines[0]).toBe(
      'Réponse JSON : 1 évènement(s).',
    )
    expect(summarizeCartResponse(JSON.stringify({ d: inner }), 200, '1').lines[0]).toBe(
      'Réponse JSON : 1 évènement(s).',
    )
  })

  it('montre ce que la réponse dit du produit demandé (quantité obtenue)', () => {
    const response = JSON.stringify([
      {
        eTypeEvenement: 2,
        lstProduits: [{ iIdProduit: 1000002, iQuantite: 0, iQteDisponible: 0 }],
      },
    ])

    const summary = summarizeCartResponse(response, 200, '1000002')

    expect(summary.lines.at(-1)).toBe(
      'Produit 1000002 dans la réponse : iIdProduit=1000002 ; iQuantite=0 ; iQteDisponible=0',
    )
  })

  it('masque les valeurs sensibles et raccourcit les textes longs', () => {
    const response = JSON.stringify([
      {
        eTypeEvenement: 9,
        sEmailClient: 'prenom.nom@example.org',
        sJeton: 'secret',
        sTexte: 'x'.repeat(200),
      },
    ])

    const text = summarizeCartResponse(response, 200, '1').lines.join('\n')

    expect(text).toContain('sEmailClient=[masqué]')
    expect(text).toContain('sJeton=[masqué]')
    expect(text).not.toContain('example.org')
    expect(text).not.toContain('secret')
    expect(text).toContain(`sTexte=${'x'.repeat(60)}…`)
  })

  it('limite le nombre d’évènements détaillés', () => {
    const response = JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ eTypeEvenement: i })))

    const lines = summarizeCartResponse(response, 200, '1').lines

    expect(lines[0]).toBe('Réponse JSON : 12 évènement(s).')
    expect(lines.at(-1)).toBe('- … 4 évènement(s) de plus non détaillés.')
  })

  it('reconnaît un blocage par le code HTTP et par la page de contrôle', () => {
    expect(summarizeCartResponse('', 403, '1').blocked).toBe(true)
    expect(summarizeCartResponse('', 429, '1').blocked).toBe(true)
    expect(
      summarizeCartResponse(
        '<html><script src="https://geo.captcha-delivery.com/x.js"></script></html>',
        200,
        '1',
      ).blocked,
    ).toBe(true)
  })

  it('donne un début de texte lisible quand la réponse n’est pas du JSON', () => {
    const html =
      '<html><style>p{}</style><body><p>Une erreur   est survenue</p><script>var x</script></body></html>'

    const summary = summarizeCartResponse(html, 500, '1')

    expect(summary.lines[0]).toBe(`Réponse non JSON (${html.length} caractères).`)
    expect(summary.lines[1]).toBe('Début du texte : Une erreur est survenue')
  })

  it('traite une réponse vide ou un texte JSON qui n’est pas une liste', () => {
    expect(summarizeCartResponse('', 200, '1').lines).toEqual(['Réponse non JSON (0 caractères).'])
    expect(summarizeCartResponse('12', 200, '1').lines[0]).toBe('Réponse non JSON (2 caractères).')
    expect(summarizeCartResponse('{"autre":{"a":1}}', 200, '1').lines[0]).toBe(
      'Réponse JSON : 1 évènement(s).',
    )
  })

  it('suit une chaîne JSON imbriquée sans boucler', () => {
    const deep = [1, 2, 3, 4, 5, 6].reduce<string>(
      (text) => JSON.stringify(text),
      JSON.stringify([1]),
    )

    expect(summarizeCartResponse(deep, 200, '1').lines[0]).toBe(
      `Réponse non JSON (${deep.length} caractères).`,
    )
  })
})

/** Réponse d'écriture INVENTÉE, de la forme relevée (DRV-007) : produit, rayon, panier, paniers complets. */
function writeResponse(cartLines: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify([
    { eTypeEvenement: 101, sIdUnique: 'Produit1955', iIdProduit: '1955', iQuantitePanier: 2 },
    { eTypeEvenement: 501, sIdUnique: 'Rayon7' },
    {
      eTypeEvenement: 1,
      sIdUnique: 'Panier000000',
      lstProduitsLight: cartLines,
      iQuantitePanier: 5,
      sTotalAPayer: '12,34 €',
      iNbProduitIndisponible: 0,
      ...extra,
    },
    { eTypeEvenement: 4, sIdUnique: 'PaniersComplets' },
  ])
}

const IN_CART = [
  { iIdProduit: '2002', iQtePanier: 3, iQteDisponible: 8, fQuantiteMax: 10, rTotalAPayer: 3 },
  { iIdProduit: '1955', iQtePanier: 2, iQteDisponible: 12, fQuantiteMax: 20, rTotalAPayer: 2.58 },
]

describe('summarizeCartResponse : la quantité obtenue', () => {
  it('lit la quantité du produit testé, son stock, son maximum, le nombre d’articles et le total', () => {
    // When
    const summary = summarizeCartResponse(writeResponse(IN_CART), 200, '1955')

    // Then
    expect(summary.obtained).toBe(2)
    expect(summary.obtainedByAbsence).toBe(false)
    expect(summary.lines).toContain(
      'Quantité obtenue du produit 1955 (iQtePanier) : 2 ; iQteDisponible 12 ; fQuantiteMax 20',
    )
    expect(summary.lines).toContain('Panier : iQuantitePanier 5 ; sTotalAPayer 12,34 €')
    expect(summary.blocked).toBe(false)
    expect(summary.rejected).toBe(false)
  })

  it('compare les identifiants en texte et en nombre', () => {
    const asNumbers = IN_CART.map((line) => ({ ...line, iIdProduit: Number(line.iIdProduit) }))

    expect(summarizeCartResponse(writeResponse(asNumbers), 200, '1955').obtained).toBe(2)
    expect(summarizeCartResponse(writeResponse(IN_CART), 200, '2002').obtained).toBe(3)
  })

  it('compte 0 un produit absent de la liste du panier, et le dit', () => {
    const summary = summarizeCartResponse(writeResponse(IN_CART.slice(0, 1)), 200, '1955')

    expect(summary.obtained).toBe(0)
    expect(summary.obtainedByAbsence).toBe(true)
    expect(summary.lines).toContain(
      'Produit 1955 absent de lstProduitsLight (1 au panier) : quantité obtenue 0',
    )
  })

  it('trouve la liste et les totaux même rangés plus profond dans l’évènement', () => {
    const response = JSON.stringify([
      {
        eTypeEvenement: 1,
        sIdUnique: 'Panier000000',
        objPanier: {
          lstProduitsLight: IN_CART,
          iQuantitePanier: 5,
          sTotalAPayer: '12,34 €',
        },
      },
    ])

    const summary = summarizeCartResponse(response, 200, '1955')

    expect(summary.obtained).toBe(2)
    expect(summary.lines).toContain('Panier : iQuantitePanier 5 ; sTotalAPayer 12,34 €')
  })

  it('prend l’évènement Panier même quand un autre évènement de type 1 le précède', () => {
    const response = JSON.stringify([
      {
        eTypeEvenement: 1,
        sIdUnique: 'Autre',
        lstProduitsLight: [{ iIdProduit: '1955', iQtePanier: 9 }],
      },
      { eTypeEvenement: 1, sIdUnique: 'Panier000000', lstProduitsLight: IN_CART },
    ])

    expect(summarizeCartResponse(response, 200, '1955').obtained).toBe(2)
  })

  it('à défaut de sIdUnique « Panier… », prend l’évènement de type 1 qui porte la liste', () => {
    const response = JSON.stringify([{ eTypeEvenement: 1, lstProduitsLight: IN_CART }])

    expect(summarizeCartResponse(response, 200, '1955').obtained).toBe(2)
  })

  it('ne lit pas la quantité de l’évènement produit pour celle du panier', () => {
    const response = JSON.stringify([
      { eTypeEvenement: 101, iIdProduit: '1955', iQuantitePanier: 2 },
    ])

    const summary = summarizeCartResponse(response, 200, '1955')

    expect(summary.obtained).toBeNull()
    expect(summary.lines).toContain(
      "Panier : pas d'évènement « Panier… », quantité obtenue non lue.",
    )
  })

  it('dit quand la liste du panier manque dans l’évènement', () => {
    const response = JSON.stringify([{ eTypeEvenement: 1, sIdUnique: 'Panier000000' }])

    const summary = summarizeCartResponse(response, 200, '1955')

    expect(summary.obtained).toBeNull()
    expect(summary.lines).toContain(
      'Panier : lstProduitsLight introuvable, quantité obtenue non lue.',
    )
    expect(summary.lines).toContain('Panier : iQuantitePanier ? ; sTotalAPayer ?')
  })

  it('dit « non lue » quand le produit est dans la liste sans quantité', () => {
    const summary = summarizeCartResponse(writeResponse([{ iIdProduit: '1955' }]), 200, '1955')

    expect(summary.obtained).toBeNull()
    expect(summary.lines).toContain(
      'Quantité obtenue du produit 1955 (iQtePanier) : non lue ; iQteDisponible ? ; fQuantiteMax ?',
    )
  })

  it('lit des quantités données en texte', () => {
    const summary = summarizeCartResponse(
      writeResponse([{ iIdProduit: '1955', iQtePanier: '3', iQteDisponible: '4,5' }]),
      200,
      '1955',
    )

    expect(summary.obtained).toBe(3)
    expect(summary.lines.join('\n')).toContain('iQteDisponible 4.5')
  })

  it('ne recopie jamais le point de livraison que la réponse répéterait', () => {
    const response = writeResponse(IN_CART, { sNoPointLivraison: '123456' })

    const text = summarizeCartResponse(response, 200, '1955').lines.join('\n')

    expect(text).toContain('sNoPointLivraison=[masqué]')
    expect(text).not.toContain('123456')
  })
})

describe('summarizeCartResponse : blocage ou requête non comprise', () => {
  const html404 = '<html><body><h1>Ce service est momentanément indisponible</h1></body></html>'

  it('classe en requête non comprise une page d’erreur 404 qui contient le mot datadome', () => {
    const summary = summarizeCartResponse(ERROR_PAGE, 404, '1955')

    expect(summary.blocked).toBe(false)
    expect(summary.rejected).toBe(true)
  })

  it('classe en blocage une réponse JSON de défi de l’anti-robot, avec ou sans code 403', () => {
    const challenge = '{"url":"https://geo.captcha-delivery.com/captcha/?initialCid=abc"}'

    expect(summarizeCartResponse(challenge, 403, '1').blocked).toBe(true)
    expect(summarizeCartResponse(challenge, 200, '1')).toMatchObject({
      blocked: true,
      rejected: false,
    })
  })

  it('classe un 404 HTML en requête non comprise, pas en blocage', () => {
    const summary = summarizeCartResponse(html404, 404, '1955')

    expect(summary.blocked).toBe(false)
    expect(summary.rejected).toBe(true)
    expect(summary.obtained).toBeNull()
  })

  it('classe un 403 et un 429 en blocage, pas en requête non comprise', () => {
    for (const status of [403, 429]) {
      const summary = summarizeCartResponse(html404, status, '1955')
      expect(summary.blocked).toBe(true)
      expect(summary.rejected).toBe(false)
    }
  })

  it('classe en blocage la page de contrôle de l’anti-robot, même avec un code 200', () => {
    const summary = summarizeCartResponse(
      '<script src="https://x.captcha-delivery.com/c.js">',
      200,
      '1',
    )

    expect(summary.blocked).toBe(true)
    expect(summary.rejected).toBe(false)
  })

  it('classe en requête non comprise toute réponse qui n’est pas du JSON, même avec un code 200', () => {
    expect(summarizeCartResponse('<html>accueil</html>', 200, '1').rejected).toBe(true)
    expect(summarizeCartResponse('', 200, '1').rejected).toBe(true)
  })

  it('classe en requête non comprise un code hors 2xx, même avec du JSON', () => {
    expect(summarizeCartResponse('[]', 500, '1').rejected).toBe(true)
    expect(summarizeCartResponse('[]', 404, '1').rejected).toBe(true)
  })

  it('ne classe pas en requête non comprise une réponse JSON en 200', () => {
    expect(summarizeCartResponse('[]', 200, '1').rejected).toBe(false)
  })
})
