// @vitest-environment node
// L'analyse tolérante du JSON de produits embarqué dans la page de recherche (DRV-303). Pages INVENTÉES.
import { describe, expect, it } from 'vitest'

import { toCandidate } from '../src/leclerc/candidate'
import {
  decodeEntities,
  decodeJsString,
  extractProducts,
  parseLooseNumber,
} from '../src/leclerc/embedded'
import { BACK_FORBIDDEN } from './back-label-rules'
import { fixture } from './leclerc-helpers'

const FLOUR = {
  iIdProduit: 1000001,
  sLibelleLigne1: 'Farine de blé T55 Moulin Imaginaire',
  sLibelleLigne2: '1 kg',
  nrPVUnitaireTTC: 1.29,
  sPrixUnitaire: '1,29 €',
  nrPVParUniteDeMesureTTC: 1.29,
  sPrixParUniteDeMesure: '1,29 € / kg',
  iQteDisponible: 12,
  iQuantitePanier: 0,
}
const SUGAR = {
  iIdProduit: 1000002,
  sLibelleLigne1: 'Sucre en poudre Sucrerie Fictive',
  sLibelleLigne2: '750 g',
  nrPVUnitaireTTC: 1.5,
  sPrixPromo: '1,35 €',
  iQteDisponible: 0,
  iQuantitePanier: 0,
}

type Style = 'json' | 'entities' | 'escaped' | 'literal'

/** Une page où les produits sont donnés sous quatre formes : JSON, entités HTML, guillemets échappés, littéral JavaScript. */
function page(products: object[], style: Style): string {
  const json = JSON.stringify({
    widgets: [{ lstProduits: products }],
    lstProduitsLight: [{ iIdProduit: 424242, iQuantite: 1 }],
  })
  const literal = products
    .map(
      (p) =>
        `{${Object.entries(p)
          .map(
            ([k, v]) =>
              `${k}: ${typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v)}`,
          )
          .join(', ')}}`,
    )
    .join(', ')
  const body = {
    json: `<script>var widgets = ${json};</script>`,
    entities: `<div data-config="${json.replace(/"/g, '&quot;')}"></div>`,
    escaped: `<script>initialiser("${json.replace(/"/g, '\\"')}")</script>`,
    literal: `<script>var w = {lstProduits: [${literal}]}</script>`,
  }[style]
  return `<html><body><nav>Accueil</nav>${body}<footer>Bas</footer></body></html>`
}

describe('extractProducts', () => {
  it.each<Style>(['json', 'entities', 'escaped', 'literal'])(
    'lit les produits d’une page de forme « %s »',
    (style) => {
      // When
      const { products } = extractProducts(page([FLOUR, SUGAR], style))

      // Then
      expect(products.map((product) => product.id)).toEqual(['1000001', '1000002'])
      expect(products[0]).toEqual({
        id: '1000001',
        label1: 'Farine de blé T55 Moulin Imaginaire',
        label2: '1 kg',
        unitPrice: 1.29,
        promoText: null,
        measurePrice: 1.29,
        measureText: '1,29 € / kg',
        stock: 12,
        inCart: 0,
        thumbnail: null,
      })
      expect(products[1]).toMatchObject({ promoText: '1,35 €', stock: 0 })
    },
  )

  it('lit la fixture de la page de résultats : 5 produits, dont un indisponible et un en promotion', () => {
    // When
    const { products, ids } = extractProducts(fixture('recherche-farine.html'))

    // Then : la ligne du panier (1000003 sans libellé) ne compte pas comme un produit en plus
    expect(products.map((product) => product.id)).toEqual([
      '1000001',
      '1000002',
      '1000003',
      '1000004',
      '1000005',
    ])
    expect(ids).toBe(5)
    expect(products.find((product) => product.id === '1000002')?.stock).toBe(0)
    expect(products.find((product) => product.id === '1000003')).toMatchObject({
      promoText: '2,49 €',
      inCart: 2,
      label2: '2 x 500 g',
    })
    expect(products[0]?.thumbnail).toMatch(/^https:\/\//)
  })

  it('lit le contenu net structuré du produit qui en porte un, et lui seul', () => {
    const { products } = extractProducts(fixture('recherche-farine.html'))

    expect(products[4]?.structured).toEqual({
      unitMeasure: 'KG',
      unitContent: 1,
      totalContent: 1,
      totalUnit: 'kg',
    })
    expect(products[0]).not.toHaveProperty('structured')
  })

  it('lit un contenu structuré partiel ou donné en texte, sans confondre unité et unité totale', () => {
    const partial = extractProducts(
      '<script>{"iIdProduit":5,"sLibelleLigne1":"Lait","nrContenanceTotale":"6,0","sUniteMesureTotale":"L"}</script>',
    )
    const onlyTotalUnit = extractProducts(
      '<script>{"iIdProduit":5,"sLibelleLigne1":"Lait","sUniteMesureTotale":"L"}</script>',
    )

    expect(partial.products[0]?.structured).toEqual({
      unitMeasure: null,
      unitContent: null,
      totalContent: 6,
      totalUnit: 'L',
    })
    expect(onlyTotalUnit.products[0]?.structured?.unitMeasure).toBeNull()
  })

  it('ne trouve aucun produit dans une page vide, ni dans une page dont le format a changé', () => {
    expect(extractProducts(fixture('recherche-vide.html'))).toEqual({ products: [], ids: 0 })
    expect(extractProducts(fixture('recherche-changee.html'))).toEqual({ products: [], ids: 0 })
    expect(extractProducts('')).toEqual({ products: [], ids: 0 })
  })

  it('garde un produit une seule fois, en préférant la fiche avec libellé à la ligne du panier', () => {
    const page =
      '<script>{"panier":[{"iIdProduit":1000001,"iQuantite":1}],"produits":[{"iIdProduit":1000001,"sLibelleLigne1":"Farine A","iQteDisponible":3}]}</script>'

    const { products } = extractProducts(page)

    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ id: '1000001', label1: 'Farine A', stock: 3 })
  })

  it('ignore les champs inconnus et lit les libellés accentués ou échappés', () => {
    const page =
      '<script>{"iIdProduit":7,"sLibelleLigne1":"Cr\\u00e8me fra\\u00eeche d\\u0027\\u00e9t\\u00e9 &amp; lait","champInconnu":{"a":[1,2]},"iQteDisponible":4}</script>'

    expect(extractProducts(page).products[0]).toMatchObject({
      id: '7',
      label1: "Crème fraîche d'été & lait",
      stock: 4,
    })
  })

  it('lit un prix donné en texte seul quand le nombre manque', () => {
    const page =
      '<script>{"iIdProduit":8,"sLibelleLigne1":"Sel","sPrixUnitaire":"0,85 €","sPrixParUniteDeMesure":"0,85 € / kg"}</script>'

    expect(extractProducts(page).products[0]).toMatchObject({ unitPrice: 0.85, measurePrice: 0.85 })
  })
})

describe('decodeEntities, decodeJsString et parseLooseNumber', () => {
  it('décode les entités HTML nommées et numériques', () => {
    expect(decodeEntities('a &amp; b &quot;c&quot; &#233; &#x41; &inconnue; &#99999999;')).toBe(
      'a & b "c" é A &inconnue; &#99999999;',
    )
  })

  it('décode les échappements JavaScript puis les entités, et resserre les espaces', () => {
    expect(decodeJsString('l\\u00e9ger \\"bio\\"\\n\\/ &amp;  x')).toBe('léger "bio" / & x')
  })

  it.each([
    ['1 234,56 €', 1234.56],
    ['2,5', 2.5],
    [3, 3],
    ['abc', null],
    [Number.NaN, null],
    [null, null],
  ])('lit le nombre de %j', (value, expected) => {
    expect(parseLooseNumber(value)).toBe(expected)
  })
})

describe('les caractères invisibles et de contrôle d’un libellé de l’enseigne', () => {
  // Le back refuse en bloc (`422 DRIVE_CHOICE_INVALID`) un libellé qui en porte un : l'agent les retire dès la lecture de la page.
  // Le motif est celui du back, copié dans back-label-rules.ts.
  it('les retire de tous les textes lus : libellés, seconde ligne, prix par mesure, unités du contenu structuré', () => {
    // When : la fixture écrit les caractères en `\uXXXX` du JSON, en entités HTML et en caractères de contrôle
    const { products } = extractProducts(fixture('recherche-invisibles.html'))

    // Then
    expect(products.map((product) => product.id)).toEqual(['1000101', '1000102'])
    expect(products[0]).toMatchObject({
      label1: 'Vinaigre de cidre Verger Imaginaire',
      label2: '75 cl',
      measureText: '3,20 € / L',
    })
    expect(products[1]).toMatchObject({
      label1: 'Moutarde forte Pot Fictif des Tests',
      label2: '200 g',
      structured: { unitMeasure: 'KG', totalUnit: 'kg' },
    })
    for (const product of products) {
      for (const text of [product.label1, product.label2, product.measureText]) {
        expect(BACK_FORBIDDEN.test(text ?? '')).toBe(false)
      }
    }
  })

  it('lit encore le contenu net d’un libellé que des invisibles coupaient (« 75 cl » coupé par un joint de mots)', () => {
    const { products } = extractProducts(fixture('recherche-invisibles.html'))

    const contents = products.map((product) => toCandidate(product).content)

    expect(contents).toEqual([
      { value: 750, unit: 'ml' },
      { value: 200, unit: 'g' },
    ])
  })

  it('traite un libellé fait seulement d’invisibles comme un libellé absent : ce n’est pas un produit', () => {
    const page = '<script>{"iIdProduit":7,"sLibelleLigne1":"\\u200B\\u202E\\uFEFF"}</script>'

    const { products, ids } = extractProducts(page)

    expect(products).toEqual([])
    expect(ids).toBe(1)
  })

  it('decodeJsString les retire, qu’ils viennent d’un échappement JSON, d’une entité ou d’un caractère brut', () => {
    expect(decodeJsString('a\\u200Bb\\u202Ec\\uFEFFd')).toBe('abcd')
    expect(decodeJsString('a&#8203;b&#x202E;c&#xFEFF;d&#8206;e')).toBe('abcde')
    expect(decodeJsString('a\u200Bb\u2066c\u2069d\u0007e')).toBe('abcde')
    expect(decodeJsString('a\\n b\\u0085c')).toBe('a b c')
    expect(decodeJsString('a\\u2028b')).toBe('a b')
  })
})
