// @vitest-environment node
// Le panier (DRV-303) : la requête telle que le site l'envoie (DRV-007) et la lecture de sa réponse. Données INVENTÉES.
import { describe, expect, it } from 'vitest'

import {
  CART_HEADERS,
  cartBody,
  cartPayload,
  parseTotal,
  readCartResponse,
  readPageTotal,
} from '../src/leclerc/cart'
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
      totalCents: 947,
    })
    expect(readCartResponse(fixture('panier-ajout.json'), '1000003')).toEqual({
      obtained: 2,
      items: 5,
      totalCents: 947,
    })
  })

  it('lit un changement de quantité dont les identifiants et quantités sont en texte', () => {
    expect(readCartResponse(fixture('panier-changement.json'), '1000001')).toEqual({
      obtained: 2,
      items: 2,
      totalCents: 258,
    })
  })

  it('compte 0 pour un produit qui n’est plus dans lstProduitsLight (retrait)', () => {
    expect(readCartResponse(fixture('panier-retrait.json'), '1000001')).toEqual({
      obtained: 0,
      items: 0,
      totalCents: 0,
    })
    expect(readCartResponse(fixture('panier-ajout.json'), '9999999')).toEqual({
      obtained: 0,
      items: 5,
      totalCents: 947,
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

    expect(readCartResponse(JSON.stringify(events), '5')).toEqual({
      obtained: 4,
      items: null,
      totalCents: null,
    })
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

describe('readCartResponse : la vérification qui a échoué (ticket A)', () => {
  const NO_LIST = '[{"eTypeEvenement":1,"sIdUnique":"Panier1","iQuantitePanier":2}]'
  const NO_QUANTITY =
    '[{"eTypeEvenement":1,"sIdUnique":"Panier1","lstProduitsLight":[{"iIdProduit":5,"iQtePanier":"beaucoup"}]}]'

  it.each([
    ['du texte qui n’est pas du JSON', '<html>Erreur</html>', 'CART_NOT_JSON'],
    ['un JSON vide', 'null', 'CART_NO_EVENTS'],
    ['un nombre', '42', 'CART_NO_EVENTS'],
    ['une liste d’évènements vide', '[]', 'CART_NO_CART_EVENT'],
    ['un objet inattendu', '{"erreur":"inattendu"}', 'CART_NO_CART_EVENT'],
    ['des évènements sans évènement panier', fixture('panier-invalide.json'), 'CART_NO_CART_EVENT'],
    ['un évènement panier sans liste de produits', NO_LIST, 'CART_NO_PRODUCT_LIST'],
    ['une quantité illisible', NO_QUANTITY, 'CART_QUANTITY_UNREADABLE'],
  ])('%s : %s', (_name, text, cause) => {
    expect(() => readCartResponse(text, '5')).toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED', cause }),
    )
  })
})

describe('parseTotal', () => {
  it.each([
    ['9,47 €', 947],
    ['0,00 €', 0],
    ['1 234,56 €', 123456],
    ['12 €', 1200],
    ['3,5 €', 350],
    ['12.30', 1230],
    [2.58, 258],
  ])('lit « %s » comme %d centimes', (value, cents) => {
    expect(parseTotal(value)).toBe(cents)
  })

  it.each([['beaucoup'], [''], ['12,345 €'], ['-3 €'], [null], [undefined], [Number.NaN], [-1]])(
    'ne devine rien de %j',
    (value) => {
      expect(parseTotal(value)).toBeNull()
    },
  )
})

describe('readPageTotal', () => {
  it('lit le total du panier dans le JSON embarqué d’une page, entités comprises', () => {
    expect(
      readPageTotal('<script>var p = {"iQuantitePanier":2,"sTotalAPayer":"4,10 €"}</script>'),
    ).toBe(410)
    expect(readPageTotal('data-x="{&quot;sTotalAPayer&quot;:&quot;0,00 €&quot;}"')).toBe(0)
  })

  it('rend null quand la page n’en porte pas, ou quand ce n’est pas un montant', () => {
    expect(readPageTotal('<html>Aucun panier</html>')).toBeNull()
    expect(readPageTotal('{"sTotalAPayer":"voir le panier"}')).toBeNull()
  })
})
