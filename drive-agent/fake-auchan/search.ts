// La recherche du faux site d'Auchan (DRV-724, DRV-734) : des pages de résultats SYNTHÉTIQUES, de la FORME mesurée le 2026-10-30 (DRV-714, B-1 : `GET /recherche?text=…`
// rend une page HTML complète, les produits dans le DOM, plusieurs balises `data-product-id` par produit, des microdonnées schema.org, la pastille « 1kg »,
// le prix au kilo et la mention « Dans mon drive » ; DRV-734, B-7b et B-8 : titre « Votre recherche <terme> sur Auchan.fr » et `h1` « Votre recherche : <terme> »,
// la page « aucun résultat » dit « Oups, on n'a rien trouvé pour : » sans aucune carte, et les termes courants REDIRIGENT vers une page de rayon
// `/<rayon>/<sous-rayons…>/ca-n<chiffres>` — titre « <Catégorie> pas cher - Auchan.fr », `h1` la catégorie — qui porte les mêmes cartes) et des données
// entièrement INVENTÉES. Ce qui n'a pas été mesuré est une forme plausible, dite telle : l'élément qui porte chaque attribut, les valeurs « indisponible »,
// les produits d'un autre vendeur, la pagination, la fiche de produit atteinte par redirection.
//
// Des termes pilotent la réponse (sans toucher au `Behavior` du reste du faux site) :
//   - un mot qui ne rend rien              : la page « aucun résultat » (mesurée) ;
//   - `fiche`                              : le site REDIRIGE vers une fiche de produit (NON MESURÉ), qui porte elle aussi les balises et microdonnées du produit : elle reste NON LUE ;
//   - `rayon`                              : le site REDIRIGE vers une page de rayon (MESURÉ) qui porte plusieurs produits : lue comme des résultats ;
//   - `rayonvide`                          : le site REDIRIGE vers une page de rayon sans aucune carte (forme inventée) : page de forme inconnue ;
//   - `inconnu`                            : une page du site, sans produit ni phrase connue (une forme que l'adaptateur ne reconnaît pas) ;
//   - `illisible`                          : des balises de produit, mais plus aucune microdonnée (le site a renommé ses champs) ;
//   - `sansoffre`                          : des cartes dont les balises n'ont plus d'identifiant d'offre ;
//   - `enligne`                            : un produit que la page ne propose qu'en vente EN LIGNE (DRV-739, B-9, MESURÉ le 2026-10-30) : trois offres `data-seller-type="ONLINE"`,
//                                          aucune du drive (`GROCERY`) ; la page n'a aucun autre produit : la ligne est sans produit, sans erreur ;
//   - `mixte`                              : le même produit en vente en ligne ET au drive (une offre `ONLINE`, une `GROCERY`) à côté d'un produit en ligne seulement : seul le
//                                          produit du drive est lu, avec l'offre du drive (forme INVENTÉE d'après B-9).
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

/** Le produit « en ligne seulement » du faux site (DRV-739) : jamais au panier, absent du catalogue. Identifiants INVENTÉS. */
const ONLINE_PRODUCT = {
  productId: '3f4a5b6c-7d8e-4f90-8a1b-2c3d4e5f6a7b',
  label: 'Thé glacé vert de test',
  brand: 'Marque Test',
  net: '1,5L',
  priceCents: 189,
  photo: 'S00000000008G1GPRIMARY',
}
const ONLINE_OFFERS = [
  {
    offerId: '4a5b6c7d-8e9f-4a01-8b2c-3d4e5f6a7b8c',
    sellerId: '5b6c7d8e-9fa0-4b12-8c3d-4e5f6a7b8c9d',
  },
  {
    offerId: '6c7d8e9f-a0b1-4c23-8d4e-5f6a7b8c9d0e',
    sellerId: '7d8e9fa0-b1c2-4d34-8e5f-6a7b8c9d0e1f',
  },
  {
    offerId: '8e9fa0b1-c2d3-4e45-8f6a-7b8c9d0e1f20',
    sellerId: '9fa0b1c2-d3e4-4f56-8a7b-8c9d0e1f2031',
  },
] as const

/**
 * Une carte « en ligne seulement » (B-9, MESURÉ : les balises du produit portent trois identifiants d'offre, tous `data-seller-type="ONLINE"` ; certaines
 * balises, les boutons, n'ont aucune offre). PLAUSIBLE, non mesuré : quels éléments portent quoi.
 */
function onlineOnlyCard(offers: readonly (typeof ONLINE_OFFERS)[number][] = ONLINE_OFFERS): string {
  const { productId, label, brand, net, priceCents, photo } = ONLINE_PRODUCT
  const ids = (offer: (typeof ONLINE_OFFERS)[number], type = 'ONLINE'): string =>
    `data-product-id="${productId}" data-offer-id="${offer.offerId}" data-seller-type="${type}" data-offer-type="DEFAULT"`
  const first = offers[0]
  return `<article class="product" ${first ? ids(first) : `data-product-id="${productId}"`} itemscope itemtype="https://schema.org/Product">
<meta itemprop="image" content="https://${PHOTO_HOST}/media/${photo}">
<h3 itemprop="name">${label}</h3>
<span itemprop="brand">${brand}</span>
<span class="net">${net}</span>
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
<meta itemprop="price" content="${(priceCents / 100).toFixed(2)}">
<meta itemprop="priceCurrency" content="EUR">
<link itemprop="availability" href="https://schema.org/InStock">
<span class="price">${euros(priceCents)}</span>
</div>
${offers.map((offer) => `<footer class="offer" ${ids(offer)} data-seller-id="${offer.sellerId}"></footer>`).join('\n')}
<button type="button" data-product-id="${productId}">Ajouter</button> <button type="button" data-product-id="${productId}">Favori</button>
</article>`
}

/** Une carte dont les balises n'ont plus d'identifiant d'offre (le site a changé ses attributs). */
function withoutOffer(item: Listed): string {
  return card(item).replace(/ data-offer-id="[^"]*"/g, '')
}

/** Une page de recherche : titre et `h1` « Votre recherche… » (mesurés, DRV-734) pour le terme cherché. */
function resultsPage(options: PageOptions, term: string, body: string): string {
  const shown = escapeHtml(term)
  return `${HTML_HEAD(`Votre recherche ${shown} sur Auchan.fr`)}
<body>${sessionScript(options.session)}
<header>${barHtml(options.bar)}${nav()}</header>
<main><h1>Votre recherche : ${shown}</h1>${body}</main>
</body></html>`
}

/** Une page de rayon (MESURÉE, DRV-734, B-8) : titre « <Catégorie> pas cher - Auchan.fr », `h1` la catégorie, les mêmes cartes que la recherche. */
function aislePage(options: PageOptions, category: string, body: string): string {
  return `${HTML_HEAD(`${category} pas cher - Auchan.fr`)}
<body>${sessionScript(options.session)}
<header>${barHtml(options.bar)}${nav()}</header>
<main><h1>${category}</h1>${body}</main>
</body></html>`
}

/** Un texte sûr dans du HTML : le terme cherché vient de l'adresse, le faux site ne le recopie jamais tel quel. */
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * La page où le site dit qu'il n'a rien trouvé (MESURÉE le 2026-10-30, DRV-734, B-7b : `200`, non redirigée, titre « Votre recherche <terme> sur Auchan.fr »,
 * `h1` « Votre recherche : <terme> », la phrase « Oups, on n'a rien trouvé pour : », aucune carte). Le détail des éléments est plausible.
 */
function noResultPage(options: PageOptions, term: string): string {
  return resultsPage(
    options,
    term,
    `<p>Oups, on n’a rien trouvé pour :</p><p>${escapeHtml(term)}</p><p>…ou à trouver votre bonheur dans nos rayons</p>`,
  )
}

export interface SearchReply {
  status: number
  body: string
  /** Pour une redirection (`302`). */
  location?: string
}

/**
 * Où mènent les termes `fiche`, `rayon` et `rayonvide` : une fiche de produit (`/<libellé>/pr-C<7 chiffres>`, B-2 ; la redirection vers elle n'est pas mesurée),
 * une page de rayon (`/<rayon>/<sous-rayons…>/ca-n<chiffres>`, B-8 MESURÉ) et une page de rayon sans carte (INVENTÉE).
 */
export const PRODUCT_PAGE_PATH = '/lait-uht-demi-ecreme-de-test/pr-C0000001'
export const AISLE_PAGE_PATH = '/epicerie-de-test/farines-de-test/ca-n0000001'
export const EMPTY_AISLE_PAGE_PATH = '/epicerie-de-test/vide-de-test/ca-n0000002'

/** La réponse de `GET /recherche?text=<terme>`. */
export function searchReply(text: string, options: PageOptions): SearchReply {
  switch (fold(text)) {
    case 'fiche':
      return { status: 302, body: '', location: PRODUCT_PAGE_PATH }
    case 'rayon':
      return { status: 302, body: '', location: AISLE_PAGE_PATH }
    case 'rayonvide':
      return { status: 302, body: '', location: EMPTY_AISLE_PAGE_PATH }
    case 'inconnu':
      return {
        status: 200,
        body: resultsPage(options, text, '<p>Une page que l’agent ne connaît pas.</p>'),
      }
    case 'illisible':
      return {
        status: 200,
        body: resultsPage(
          options,
          text,
          find('farine')
            .map((item) => card(item, true))
            .join('\n'),
        ),
      }
    case 'sansoffre':
      return {
        status: 200,
        body: resultsPage(options, text, find('farine').map(withoutOffer).join('\n')),
      }
    case 'enligne':
      return { status: 200, body: resultsPage(options, text, onlineOnlyCard()) }
    case 'mixte': {
      // Le produit de la farine en vente aussi en ligne (une offre `ONLINE` de plus sur ses balises), à côté d'un produit en ligne seulement.
      const [farine] = find('farine de blé')
      const mixed = farine
        ? card(farine).replace(
            '</article>',
            `<footer class="offer" data-product-id="${farine.product.productId}" data-offer-id="${ONLINE_OFFERS[0].offerId}" data-seller-type="ONLINE" data-offer-type="DEFAULT"></footer>\n</article>`,
          )
        : ''
      return { status: 200, body: resultsPage(options, text, `${mixed}\n${onlineOnlyCard()}`) }
    }
    default: {
      const found = find(text)
      return {
        status: 200,
        body:
          found.length === 0
            ? noResultPage(options, text)
            : resultsPage(options, text, found.map((item) => card(item)).join('\n')),
      }
    }
  }
}

/**
 * Les pages où `fiche`, `rayon` et `rayonvide` mènent. La page de rayon porte plusieurs produits avec les mêmes cartes que la recherche (MESURÉ) : l'agent la
 * lit comme des résultats. La fiche porte les balises et les microdonnées du produit, comme une vraie fiche le ferait (SUPPOSÉ) : l'agent ne doit PAS la lire
 * comme une page de résultats.
 */
export function landingPage(path: string, options: PageOptions): string | null {
  if (path === PRODUCT_PAGE_PATH) {
    const [item] = find('lait uht')
    return `${HTML_HEAD('Lait UHT demi-écrémé de test - Auchan.fr')}
<body>${sessionScript(options.session)}
<header>${barHtml(options.bar)}${nav()}</header>
<main><h1>Lait UHT demi-écrémé de test</h1>${item ? card(item) : ''}</main>
</body></html>`
  }
  if (path === AISLE_PAGE_PATH)
    return aislePage(
      options,
      'Farines de test',
      find('farine')
        .map((item) => card(item))
        .join('\n'),
    )
  if (path === EMPTY_AISLE_PAGE_PATH)
    return aislePage(options, 'Rayon vide de test', '<p>Bientôt de nouveaux produits.</p>')
  return null
}
