// @vitest-environment node
// Le panier (DRV-303) : la requête telle que le site l'envoie (DRV-007) et la lecture de sa réponse. Données INVENTÉES.
import { describe, expect, it } from 'vitest'

import { CART_HEADERS, cartBody, cartPayload, readCartResponse } from '../src/leclerc/cart'
import { LeclercError } from '../src/leclerc'
import { fixture } from './leclerc-helpers'

/** L'ajout relevé sur le site (DRV-007), avec des valeurs inventées. */
const ADD = { productId: '1955', quantity: 1, deliveryPoint: '123456', searchText: 'farine' }
const ADD_JSON =
  '{"eTypeAction":1,"iIdProduit":"1955","iQuantite":1,"sNoPointLivraison":"123456","objContexteProvenanceArticle":{"eOrigine":4,"eTypePage":3,"sTexteRecherche":"farine","eVue":0,"sInformationsComplementaires":"uni-2"}}'
const REMOVE_JSON =
  '{"eTypeAction":2,"iIdProduit":"1955","iQuantite":0,"sNoPointLivraison":"123456"}'

describe('cartPayload et cartBody', () => {
  it('reproduit champ par champ l’ajout du site : identifiant en texte, contexte joint, mêmes clés dans le même ordre', () => {
    expect(cartPayload(ADD)).toBe(ADD_JSON)
    expect(Object.keys(JSON.parse(cartPayload(ADD)) as object)).toEqual([
      'eTypeAction',
      'iIdProduit',
      'iQuantite',
      'sNoPointLivraison',
      'objContexteProvenanceArticle',
    ])
  })

  it('reproduit le retrait du site : action 2, quantité 0, sans contexte', () => {
    expect(cartPayload({ ...ADD, quantity: 0 })).toBe(REMOVE_JSON)
  })

  it('envoie une quantité absolue avec l’action 1, aussi pour une quantité de 3', () => {
    expect(JSON.parse(cartPayload({ ...ADD, quantity: 3 }))).toMatchObject({
      eTypeAction: 1,
      iQuantite: 3,
    })
  })

  it('donne les tailles de corps relevées sur le site : 317 octets à l’ajout, 124 au retrait', () => {
    expect(cartBody(ADD)).toHaveLength(317)
    expect(cartBody({ ...ADD, quantity: 0 })).toHaveLength(124)
  })

  it('place le JSON encodé dans le champ de formulaire d, guillemets et accents bien encodés', () => {
    const request = { ...ADD, searchText: 'crème "fraîche"' }
    const body = cartBody(request)

    expect(body.startsWith('d=')).toBe(true)
    expect(body).not.toContain('"')
    expect(new URLSearchParams(body).get('d')).toBe(cartPayload(request))
  })

  it('envoie les en-têtes du site, zcwb compris', () => {
    expect(CART_HEADERS).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      zcwb: 'ajax-manager',
    })
  })
})

describe('readCartResponse', () => {
  it('lit la quantité obtenue et le nombre d’articles dans l’évènement panier d’un ajout', () => {
    expect(readCartResponse(fixture('panier-ajout.json'), '1000001')).toEqual({
      obtained: 3,
      items: 5,
    })
    expect(readCartResponse(fixture('panier-ajout.json'), '1000003')).toEqual({
      obtained: 2,
      items: 5,
    })
  })

  it('lit un changement de quantité dont les identifiants et quantités sont en texte', () => {
    expect(readCartResponse(fixture('panier-changement.json'), '1000001')).toEqual({
      obtained: 2,
      items: 2,
    })
  })

  it('compte 0 pour un produit qui n’est plus dans lstProduitsLight (retrait)', () => {
    expect(readCartResponse(fixture('panier-retrait.json'), '1000001')).toEqual({
      obtained: 0,
      items: 0,
    })
    expect(readCartResponse(fixture('panier-ajout.json'), '9999999')).toEqual({
      obtained: 0,
      items: 5,
    })
  })

  it('lit l’enveloppe {d: …} de .NET, y compris quand elle contient du JSON en texte', () => {
    const events = fixture('panier-ajout.json')

    expect(readCartResponse(JSON.stringify({ d: JSON.parse(events) }), '1000001').obtained).toBe(3)
    expect(readCartResponse(JSON.stringify({ d: events }), '1000001').obtained).toBe(3)
  })

  it('trouve l’évènement panier même sans identifiant « Panier… », par sa liste de produits', () => {
    const events = [
      {
        eTypeEvenement: 1,
        sIdUnique: 'Autre',
        lstProduitsLight: [{ iIdProduit: 5, iQtePanier: 4 }],
      },
    ]

    expect(readCartResponse(JSON.stringify(events), '5')).toEqual({ obtained: 4, items: null })
  })

  it.each([
    ['une réponse sans évènement panier', fixture('panier-invalide.json')],
    ['du texte qui n’est pas du JSON', '<html>Erreur</html>'],
    ['un objet inattendu', '{"erreur":"inattendu"}'],
    ['un JSON vide', 'null'],
    [
      'une quantité illisible',
      '[{"eTypeEvenement":1,"sIdUnique":"Panier1","lstProduitsLight":[{"iIdProduit":5,"iQtePanier":"beaucoup"}]}]',
    ],
  ])('refuse %s : CONTRACT_CHANGED', (_name, text) => {
    expect(() => readCartResponse(text, '5')).toThrow(LeclercError)
    expect(() => readCartResponse(text, '5')).toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED' }),
    )
  })
})
