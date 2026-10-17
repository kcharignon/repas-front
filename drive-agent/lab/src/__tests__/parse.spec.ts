import { describe, expect, it } from 'vitest'

import {
  decodeEntities,
  decodeJsString,
  extractProducts,
  findEanKeys,
  keywordExcerpt,
  parseLooseNumber,
} from '../parse'
import { FLOUR, MILK, PRODUCTS, SUGAR, searchPage, type PageStyle } from './fixtures'

describe('extractProducts', () => {
  it.each<[PageStyle, string]>([
    ['json', 'texte brut'],
    ['entities', 'entités HTML décodées'],
    ['escaped', 'guillemets échappés'],
    ['literal', 'texte brut'],
  ])('lit les produits d’une page de forme « %s »', (style, view) => {
    // Given
    const page = searchPage(PRODUCTS, style)

    // When
    const result = extractProducts(page)

    // Then
    expect(result.view).toBe(view)
    expect(result.products.map((product) => product.id)).toEqual(['1000001', '1000002', '1000003'])
    expect(result.products[0]).toEqual({
      id: '1000001',
      label1: 'Farine de blé T55 Moulin Imaginaire',
      label2: '1 kg',
      unitPrice: 1.29,
      unitPriceText: '1,29 €',
      promoText: null,
      measurePrice: 1.29,
      measurePriceText: '1,29 € / kg',
      stock: 12,
      inCart: 0,
    })
  })

  it('lit le prix promo, le stock à zéro et la quantité déjà au panier', () => {
    const result = extractProducts(searchPage(PRODUCTS))

    expect(result.products[1]).toMatchObject({
      id: '1000002',
      promoText: '1,35 €',
      stock: 0,
      inCart: 0,
    })
    expect(result.products[2]).toMatchObject({ id: '1000003', stock: 40, inCart: 2 })
  })

  it('compte les identifiants sans libellé (lignes du panier) mais ne les prend pas pour des produits', () => {
    // Given : une ligne de panier dont l’identifiant n’est dans aucune fiche
    const page = searchPage([FLOUR, SUGAR, MILK]).replace(
      '</body>',
      '<script>var panier = {"lstProduitsLight":[{"iIdProduit":424242,"iQuantite":1}]}</script></body>',
    )

    // When
    const result = extractProducts(page)

    // Then
    expect(result.ids).toBe(4)
    expect(result.products.map((product) => product.id)).toEqual(['1000001', '1000002', '1000003'])
  })

  it('garde un produit une seule fois quand il apparaît deux fois, en préférant la version avec libellé', () => {
    // Given : la ligne du panier (sans libellé) vient avant la fiche complète
    const page = `<script>{"panier":[{"iIdProduit":1000001,"iQuantite":1}],"produits":[{"iIdProduit":1000001,"sLibelleLigne1":"Farine A","iQteDisponible":3}]}</script>`

    // When
    const result = extractProducts(page)

    // Then
    expect(result.ids).toBe(1)
    expect(result.products).toHaveLength(1)
    expect(result.products[0]).toMatchObject({ id: '1000001', label1: 'Farine A', stock: 3 })
  })

  it('remonte à l’objet parent quand les champs ne sont pas tous à côté de l’identifiant', () => {
    // Given : l’identifiant est dans un sous-objet, le libellé et le stock dans l’objet qui l’entoure
    const page = `<script>{"fiche":{"ref":{"iIdProduit":777777},"sLibelleLigne1":"Riz long","iQteDisponible":5,"nrPVUnitaireTTC":"2,10"}}</script>`

    // When
    const result = extractProducts(page)

    // Then
    expect(result.products).toEqual([
      expect.objectContaining({ id: '777777', label1: 'Riz long', stock: 5, unitPrice: 2.1 }),
    ])
  })

  it('n’emprunte pas le libellé d’un voisin quand l’objet parent contient plusieurs produits', () => {
    // Given : un identifiant sans libellé à côté d’un produit complet
    const page = `<script>[{"iIdProduit":1,"iQteDisponible":1},{"iIdProduit":2,"sLibelleLigne1":"Deux"}]</script>`

    // When
    const result = extractProducts(page)

    // Then
    expect(result.products).toEqual([
      expect.objectContaining({ id: '2', label1: 'Deux', stock: null }),
    ])
  })

  it('décode les échappements et les entités d’un libellé', () => {
    const page = `<script>{"iIdProduit":5,"sLibelleLigne1":"Cr\\u00e8me &amp; l\\u0027amande\\/bio"}</script>`

    expect(extractProducts(page).products[0]?.label1).toBe("Crème & l'amande/bio")
  })

  it('lit un prix donné seulement en texte', () => {
    const page = `<script>{"iIdProduit":9,"sLibelleLigne1":"Pâtes","sPrixUnitaire":"1 234,56 €","sPrixParUniteDeMesure":"2,50 € / kg"}</script>`

    expect(extractProducts(page).products[0]).toMatchObject({
      unitPrice: 1234.56,
      measurePrice: 2.5,
    })
  })

  it('ne trouve rien dans une page sans produits', () => {
    expect(extractProducts('<html><body>Aucun résultat</body></html>')).toEqual({
      products: [],
      ids: 0,
      view: 'texte brut',
    })
  })

  it('ne se perd pas dans un objet jamais refermé', () => {
    const result = extractProducts(`{"iIdProduit":12,"sLibelleLigne1":"Ouvert`)

    expect(result.products).toEqual([])
    expect(result.ids).toBe(1)
  })
})

describe('keywordExcerpt', () => {
  it('donne 300 caractères au plus autour du premier mot-clé, sans la page entière', () => {
    // Given
    const page = `${'a'.repeat(1000)} "iQteDisponible" ${'b'.repeat(1000)}`

    // When
    const { keyword, excerpt } = keywordExcerpt(page)

    // Then
    expect(keyword).toBe('iQteDisponible')
    expect(excerpt.length).toBeLessThanOrEqual(300)
    expect(excerpt).toContain('iQteDisponible')
  })

  it('préfère le mot-clé le plus précis', () => {
    expect(keywordExcerpt('un produit puis sLibelleLigne1 ici').keyword).toBe('sLibelleLigne1')
  })

  it('masque une adresse e-mail dans l’extrait', () => {
    const { excerpt } = keywordExcerpt('contact jean.dupont@example.org iIdProduit 12')

    expect(excerpt).not.toContain('@')
    expect(excerpt).toContain('[adresse e-mail masquée]')
  })

  it('dit qu’aucun mot-clé n’est trouvé', () => {
    expect(keywordExcerpt('rien à voir')).toEqual({ keyword: null, excerpt: '' })
  })
})

describe('findEanKeys', () => {
  it('repère un champ EAN dans les données', () => {
    expect(findEanKeys('{"iIdProduit":1,"sCodeEAN":"123"}')).toEqual(['sCodeEAN'])
    expect(findEanKeys('{"iIdProduit":1,"sEAN":"123","gtin13":"456"}')).toEqual(['sEAN', 'gtin13'])
  })

  it('repère un attribut data-ean', () => {
    expect(findEanKeys('<div data-ean="3000000000000">')).toEqual(['data-ean'])
  })

  it('ne confond pas un mot qui contient « ean » avec un champ', () => {
    expect(findEanKeys('var clean = 1; {"mean": 2, "sLibelleLigne1": "x"}')).toEqual([])
  })

  it('n’en cite pas plus de cinq', () => {
    const page = Array.from({ length: 9 }, (_, i) => `"ean${i}": 1`).join(',')

    expect(findEanKeys(page)).toHaveLength(5)
  })
})

describe('petites fonctions de lecture', () => {
  it.each([
    [12, 12],
    ['1 234,56 €', 1234.56],
    ['0,5', 0.5],
    ['-3', -3],
    ['abc', null],
    [null, null],
    [Number.NaN, null],
  ])('parseLooseNumber(%j) donne %j', (input, expected) => {
    expect(parseLooseNumber(input)).toBe(expected)
  })

  it('décode des entités HTML, y compris numériques, et laisse les inconnues', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#233; &#x41; &inconnue; &#99999999;')).toBe(
      'a & b <c> é A &inconnue; &#99999999;',
    )
  })

  it('décode une chaîne JavaScript', () => {
    expect(decodeJsString('l\\u00e9g\\xe8re\\nligne \\"deux\\" \\\\ fin')).toBe(
      'légère ligne "deux" \\ fin',
    )
  })
})
