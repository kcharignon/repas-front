// La recherche du faux site d'Auchan (DRV-724) : des pages de résultats SYNTHÉTIQUES, de la FORME mesurée le 2026-10-30 (DRV-714, B-1 : `GET /recherche?text=…`
// rend une page HTML complète, les produits dans le DOM, plusieurs balises `data-product-id` par produit, des microdonnées schema.org, la pastille « 1kg »,
// le prix au kilo et la mention « Dans mon drive ») et des données entièrement INVENTÉES. Ce qui n'a pas été mesuré est une forme plausible, dite telle :
// l'élément qui porte chaque attribut, la page « aucun résultat », les valeurs « indisponible », les produits d'un autre vendeur, la pagination.
//
// Des termes pilotent la réponse (sans toucher au `Behavior` du reste du faux site) :
//   - un mot qui ne rend rien              : la page « aucun résultat » (squelette du site + phrase) ;
//   - `fiche`                              : le site REDIRIGE vers une fiche de produit (B-8 : SUPPOSÉ), qui porte elle aussi les balises et microdonnées du produit ;
//   - `rayon`                              : le site REDIRIGE vers un rayon ;
//   - `inconnu`                            : une page du site, sans produit ni phrase connue (une forme que l'adaptateur ne reconnaît pas) ;
//   - `illisible`                          : des balises de produit, mais plus aucune microdonnée (le site a renommé ses champs) ;
//   - `sansoffre`                          : des cartes dont les balises n'ont plus d'identifiant d'offre.
// Les autres mots cherchent dans les libellés (sans casse ni accent).
import { type FakeProduct, PRODUCTS } from './catalog.ts'
import { barHtml, HTML_HEAD, nav, type PageOptions, PHOTO_HOST, sessionScript } from './pages.ts'

/** Un produit tel que la recherche le montre : le catalogue du faux site ou un produit réservé à la recherche (jamais dans le faux panier). */
export interface Listed {
  product: FakeProduct
  /** Les microdonnées `availability` : `InStock` (vu, B-1) ou `OutOfStock` (INVENTÉ : la valeur « indisponible » n'a pas été mesurée). */
  availability: 'InStock' | 'OutOfStock'
  /** La mention « Dans mon drive » (B-1) : absente d'un produit non disponible au drive choisi. */
  inDrive: boolean
  /** Le prix est affiché et dans les microdonnées. */
  showPrice: boolean
}

const listed = (product: FakeProduct): Listed => ({
  product,
  availability: 'InStock',
  inDrive: true,
  showPrice: true,
})

/** Des produits réservés à la recherche : un indisponible, un sans prix, un lot de six. Leurs identifiants sont inventés et inconnus du faux panier. */
const EXTRA: readonly Listed[] = [
  {
    product: {
      productId: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      offerId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e',
      label: 'Farine de seigle de test',
      brand: 'Marque Test',
      priceCents: 149,
      net: '1kg',
      ean: '0000000000055',
      maxQuantity: 0,
      photo: 'S00000000005G1GPRIMARY',
    },
    availability: 'OutOfStock',
    inDrive: false,
    showPrice: true,
  },
  {
    product: {
      productId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f',
      offerId: 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e70',
      label: 'Farine de maïs de test',
      brand: 'Marque Test',
      priceCents: 0,
      net: '500g',
      ean: '0000000000062',
      maxQuantity: 10,
      photo: 'S00000000006G1GPRIMARY',
    },
    availability: 'InStock',
    inDrive: true,
    showPrice: false,
  },
  {
    product: {
      productId: 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f81',
      offerId: 'e5f6a7b8-c9d0-4e1f-8a3b-4c5d6e7f8092',
      label: 'Lait UHT demi-écrémé lot de test',
      brand: 'Marque Test',
      priceCents: 630,
      net: '6 x 1L',
      ean: '0000000000079',
      maxQuantity: 40,
      photo: 'S00000000007G1GPRIMARY',
    },
    availability: 'InStock',
    inDrive: true,
    showPrice: true,
  },
]

/** Tout ce que la recherche peut montrer : le catalogue (un même produit se met au panier), puis les produits réservés à la recherche. */
export const LISTED: readonly Listed[] = [...PRODUCTS.map(listed), ...EXTRA]

/** Un texte comparable : minuscules, sans accent. */
const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Les produits dont le libellé contient le mot cherché. */
export function find(text: string): Listed[] {
  const wanted = fold(text)
  if (wanted === '') return []
  return LISTED.filter(({ product }) => fold(product.label).includes(wanted))
}

const euros = (cents: number): string => `${(cents / 100).toFixed(2).replace('.', ',')} €`

/** Le prix par kilo ou par litre, d'après le contenu net affiché (« 500g », « 1L », « 6 x 1L »). */
function perMeasure(product: FakeProduct): string | null {
  const found = /^(?:(\d+) x )?(\d+(?:[.,]\d+)?)\s*(kg|g|L|cl|ml)$/.exec(product.net)
  if (!found?.[2] || !found[3]) return null
  const count = Number(found[1] ?? 1)
  const amount = Number(found[2].replace(',', '.')) * count
  const base = { kg: 1, g: 0.001, L: 1, cl: 0.01, ml: 0.001 }[found[3]] ?? 1
  const unit = found[3] === 'kg' || found[3] === 'g' ? 'kg' : 'L'
  return `${euros(Math.round(product.priceCents / (amount * base)))} / ${unit}`
}

/**
 * Une carte de produit. Les attributs `data-product-id`, `data-offer-id`, `data-seller-type` (`GROCERY`), `data-offer-type` (`DEFAULT`) et `data-seller-id`
 * (vide) sont répétés sur la carte, le bouton d'ajout et le lien de la liste d'envies : PLUSIEURS balises par produit (B-1, mesuré). PLAUSIBLE, non mesuré :
 * quels éléments les portent, et la forme du bouton et du lien.
 */
function card({ product, availability, inDrive, showPrice }: Listed, bare = false): string {
  const ids = `data-product-id="${product.productId}" data-offer-id="${product.offerId}" data-seller-type="GROCERY" data-offer-type="DEFAULT" data-seller-id=""`
  const measure = showPrice ? perMeasure(product) : null
  if (bare) {
    // Les champs ont été renommés : des balises de produit, mais aucune microdonnée.
    return `<article class="product" ${ids}><p>${product.label}</p><button type="button" ${ids}>Ajouter</button></article>`
  }
  return `<article class="product" ${ids} itemscope itemtype="https://schema.org/Product">
<meta itemprop="image" content="https://${PHOTO_HOST}/media/${product.photo}">
<h3 itemprop="name">${product.label}</h3>
<span itemprop="brand">${product.brand}</span>
<span class="net">${product.net}</span>
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
${showPrice ? `<meta itemprop="price" content="${(product.priceCents / 100).toFixed(2)}">\n<meta itemprop="priceCurrency" content="EUR">` : ''}
<link itemprop="availability" href="https://schema.org/${availability}">
${showPrice ? `<span class="price">${euros(product.priceCents)}</span>` : ''}${measure ? ` <span class="unit-price">${measure}</span>` : ''}${inDrive ? ' <em>Dans mon drive</em>' : ''}
</div>
<button type="button" ${ids}>Ajouter</button> <a class="wish" href="#" ${ids}>Favori</a>
</article>`
}

/** Une carte dont les balises n'ont plus d'identifiant d'offre (le site a changé ses attributs). */
function withoutOffer(item: Listed): string {
  return card(item).replace(/ data-offer-id="[^"]*"/g, '')
}

function resultsPage(options: PageOptions, body: string): string {
  return `${HTML_HEAD('Recherche (faux site de test)')}
<body>${sessionScript(options.session)}
<header>${barHtml(options.bar)}${nav()}</header>
<main><h1>Résultats</h1>${body}</main>
</body></html>`
}

/** La page où le site dit qu'il n'a rien trouvé (PLAUSIBLE, non mesurée : le squelette du site et une phrase). */
function noResultPage(options: PageOptions): string {
  return resultsPage(options, '<p>Aucun résultat pour votre recherche.</p>')
}

export interface SearchReply {
  status: number
  body: string
  /** Pour une redirection (`302`). */
  location?: string
}

/** Où mènent les termes `fiche` et `rayon` (B-8 : SUPPOSÉ) : une fiche de produit (`/<libellé>/pr-C<7 chiffres>`, B-2) et un rayon (`/<libellé>/ca-…`). */
export const PRODUCT_PAGE_PATH = '/lait-uht-demi-ecreme-de-test/pr-C0000001'
export const AISLE_PAGE_PATH = '/fruits-et-legumes-de-test/ca-0000001'

/** La réponse de `GET /recherche?text=<terme>`. */
export function searchReply(text: string, options: PageOptions): SearchReply {
  switch (fold(text)) {
    case 'fiche':
      return { status: 302, body: '', location: PRODUCT_PAGE_PATH }
    case 'rayon':
      return { status: 302, body: '', location: AISLE_PAGE_PATH }
    case 'inconnu':
      return {
        status: 200,
        body: resultsPage(options, '<p>Une page que l’agent ne connaît pas.</p>'),
      }
    case 'illisible':
      return {
        status: 200,
        body: resultsPage(
          options,
          find('farine')
            .map((item) => card(item, true))
            .join('\n'),
        ),
      }
    case 'sansoffre':
      return {
        status: 200,
        body: resultsPage(options, find('farine').map(withoutOffer).join('\n')),
      }
    default: {
      const found = find(text)
      return {
        status: 200,
        body:
          found.length === 0
            ? noResultPage(options)
            : resultsPage(options, found.map((item) => card(item)).join('\n')),
      }
    }
  }
}

/**
 * Les pages où `fiche` et `rayon` mènent. La fiche porte les balises et les microdonnées du produit, comme une vraie fiche le ferait (SUPPOSÉ) : l'agent
 * ne doit PAS la lire comme une page de résultats.
 */
export function landingPage(path: string, options: PageOptions): string | null {
  if (path === PRODUCT_PAGE_PATH) {
    const [item] = find('lait uht')
    return resultsPage(options, item ? card(item) : '')
  }
  if (path === AISLE_PAGE_PATH) return resultsPage(options, '<h2>Fruits et légumes de test</h2>')
  return null
}
