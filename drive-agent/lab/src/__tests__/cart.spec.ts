import { describe, expect, it } from 'vitest'

import { cartBody, cartPayload, parseCartBody, summarizeCartResponse } from '../cart'

const ADD = { action: 1, productId: '1000001', quantity: 1, deliveryPoint: '123456' } as const

describe('cartPayload et cartBody', () => {
  it('construit la requête d’ajout décrite dans la recherche', () => {
    expect(JSON.parse(cartPayload(ADD))).toEqual({
      eTypeAction: 1,
      iIdProduit: 1000001,
      iQuantite: 1,
      sNoPointLivraison: '123456',
    })
  })

  it('construit le retrait : action 2, quantité 0', () => {
    expect(JSON.parse(cartPayload({ ...ADD, action: 2, quantity: 0 }))).toMatchObject({
      eTypeAction: 2,
      iQuantite: 0,
    })
  })

  it('joint l’objet d’analytique vide seulement sur demande', () => {
    expect(JSON.parse(cartPayload(ADD))).not.toHaveProperty('objContexteProvenanceArticle')
    expect(JSON.parse(cartPayload({ ...ADD, withContext: true }))).toHaveProperty(
      'objContexteProvenanceArticle',
      {},
    )
  })

  it('place le JSON encodé dans le champ de formulaire d', () => {
    const body = cartBody(ADD)

    expect(body.startsWith('d=')).toBe(true)
    expect(new URLSearchParams(body).get('d')).toBe(cartPayload(ADD))
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
    expect(summary.lines[1]).toBe(
      '- évènement 1 (type 1, panier) : eTypeEvenement=1 ; sNomEvenement=Panier123456 ; nrTotal=12.5 ; iNbArticles=3',
    )
    expect(summary.lines[2]).toContain('type 4')
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
