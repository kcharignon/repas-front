// Données SYNTHÉTIQUES du banc d'essai : tout est inventé. Elles reproduisent seulement les noms de champs décrits dans
// recherche.md § 2 (jamais une page, un produit ou un magasin réels de Leclerc : le dépôt est public).

export interface FakeProduct {
  id: number
  line1: string
  line2?: string
  price?: number
  priceText?: string
  promo?: string
  measurePrice?: number
  measureText?: string
  stock?: number
  inCart?: number
  extra?: Record<string, unknown>
}

export const FLOUR: FakeProduct = {
  id: 1000001,
  line1: 'Farine de blé T55 Moulin Imaginaire',
  line2: '1 kg',
  price: 1.29,
  priceText: '1,29 €',
  measurePrice: 1.29,
  measureText: '1,29 € / kg',
  stock: 12,
  inCart: 0,
}

export const SUGAR: FakeProduct = {
  id: 1000002,
  line1: 'Sucre en poudre Sucrerie Fictive',
  line2: '750 g',
  price: 1.5,
  priceText: '1,50 €',
  promo: '1,35 €',
  measurePrice: 2,
  measureText: '2,00 € le kg',
  stock: 0,
  inCart: 0,
}

export const MILK: FakeProduct = {
  id: 1000003,
  line1: 'Lait demi-écrémé Laiterie Inventée',
  line2: '6 x 1 L',
  price: 6.6,
  priceText: '6,60 €',
  measurePrice: 1.1,
  measureText: '1,10 € / L',
  stock: 40,
  inCart: 2,
}

export const PRODUCTS: FakeProduct[] = [FLOUR, SUGAR, MILK]

export function productFields(product: FakeProduct): Record<string, unknown> {
  return {
    iIdProduit: product.id,
    sLibelleLigne1: product.line1,
    sLibelleLigne2: product.line2 ?? null,
    nrPVUnitaireTTC: product.price ?? null,
    sPrixUnitaire: product.priceText ?? null,
    sPrixPromo: product.promo ?? null,
    nrPVParUniteDeMesureTTC: product.measurePrice ?? null,
    sPrixParUniteDeMesure: product.measureText ?? null,
    iQteDisponible: product.stock ?? null,
    iQuantitePanier: product.inCart ?? 0,
    iIdRayon: 12,
    iIdFamille: 345,
    ...product.extra,
  }
}

export type PageStyle = 'json' | 'entities' | 'escaped' | 'literal'

const NAVIGATION =
  '<nav><a href="/accueil">Accueil</a> <a href="/panier">Panier</a></nav><p>Résultats pour votre recherche</p>'

/** Une page de recherche inventée, avec les produits dans le JSON d'initialisation de widgets sous quatre formes. */
export function searchPage(products: readonly FakeProduct[], style: PageStyle = 'json'): string {
  const list = products.map(productFields)
  const cartLines = products
    .slice(0, 2)
    .map((product) => ({ iIdProduit: product.id, iQuantite: 1 }))
  const config = { widgets: [{ nom: 'produits', lstProduits: list }], lstProduitsLight: cartLines }
  const json = JSON.stringify(config)
  let body: string
  switch (style) {
    case 'entities':
      body = `<div data-config="${json.replace(/"/g, '&quot;')}"></div>`
      break
    case 'escaped':
      body = `<script>initialiser("${json.replace(/"/g, '\\"')}")</script>`
      break
    case 'literal':
      body = `<script>var w = {lstProduits: [${list
        .map(
          (item) =>
            `{${Object.entries(item)
              .map(([key, value]) =>
                typeof value === 'string'
                  ? `${key}: '${value.replace(/'/g, "\\'")}'`
                  : `${key}: ${String(value)}`,
              )
              .join(', ')}}`,
        )
        .join(', ')}]}</script>`
      break
    default:
      body = `<script>var widgets = ${json};</script>`
  }
  return `<html><head><title>Recherche</title></head><body>${NAVIGATION}${body}<footer>Bas de page</footer></body></html>`
}
