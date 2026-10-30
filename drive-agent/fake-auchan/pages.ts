// Les pages et réponses du faux site d'Auchan (DRV-717), avec la FORME mesurée sur le vrai site le 2026-10-30 (rapports DRV-712 à 714, hypothèses
// `hypotheses-site-reel-auchan.md` du dépôt back) et des données entièrement INVENTÉES : un UUID de test, `Drive Ville-Test`, des produits de test. Aucun
// HTML, aucun nom de magasin, aucun identifiant ni aucune ville du vrai site n'est ici. Ce qui n'a pas été mesuré (la structure exacte de la barre du
// magasin, la page « introuvable » au-delà de son titre et de son texte, où mène « Commencer mes achats ») est une FORME PLAUSIBLE, marquée comme telle.
import { type FakeProduct, PRODUCTS } from './catalog.ts'

/** Le faux magasin : son identifiant (un UUID de test, celui de l'exemple `plan-auchan.json` du protocole), son libellé et son hôte. */
export const STORE = {
  id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
  host: 'www.auchan.fr',
  label: 'Drive Ville-Test',
} as const

/** L'hôte des photos (DRV-714 : `cdn.auchan.fr/media/…`), pour les liens des fiches de la recherche ; le faux site ne sert pas d'images. */
export const PHOTO_HOST = 'cdn.auchan.fr'

/** Les identifiants de session du panier : `lark-cart` (visiteur seulement) et `lark-consentId`, deux cookies lisibles par la page (DRV-714). */
export const VISITOR_CART_ID = 'c0000000-0000-4000-8000-0000000000a1'
export const MEMBER_CART_ID = 'c0000000-0000-4000-8000-0000000000b2'
export const CONSENT_ID = 'd0000000-0000-4000-8000-0000000000c3'

/** Ce que la barre du magasin dit : le drive choisi, ou « Choisir vos courses ». */
export type Bar = 'withdrawal' | 'choose' | 'none'
/** La connexion que la page annonce dans `sessionStorage.tracking_authenticated` : `unknown` n'écrit rien. */
export type SessionKind = 'member' | 'visitor' | 'unknown'
/** « Commencer mes achats » sur la page du panier vide : un bouton, un lien du site, un lien vers un autre site, ou rien. */
export type EntryForm = 'button' | 'link' | 'external' | 'none'

export interface PageOptions {
  bar: Bar
  session: SessionKind
  entry: EntryForm
}

const HTML_HEAD = (title: string): string =>
  `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head>`

/** Le script que la page exécute à son chargement : le signal de connexion (D-6). */
function sessionScript(session: SessionKind): string {
  if (session === 'unknown') return ''
  return `<script>sessionStorage.setItem('tracking_authenticated', '${session === 'member' ? 'true' : 'false'}')</script>`
}

/**
 * La barre du magasin en haut de la page. `withdrawal` : « Retrait : <le drive> » (A-4) ; `choose` : « Choisir vos courses » (A-5). PLAUSIBLE, non
 * mesuré : l'élément (ici un bouton-lien et un bloc) ; le texte, lui, est celui du rapport.
 */
function barHtml(bar: Bar): string {
  if (bar === 'none') return ''
  return bar === 'withdrawal'
    ? `<div class="store-bar"><span>Retrait : ${STORE.label}</span></div>`
    : '<a href="#" role="button" class="store-bar">Choisir vos courses</a>'
}

function nav(): string {
  return '<nav><a href="/courses">Courses</a> <a href="/recherche?text=farine">Recherche</a> <a href="/checkout/cart">Panier</a></nav>'
}

/** La page d'accueil des courses (`/courses`). */
export function coursesPage({ bar, session }: PageOptions): string {
  return `${HTML_HEAD('Courses en ligne (faux site de test)')}
<body>${sessionScript(session)}
<header>${barHtml(bar)}${nav()}</header>
<main><h1>Courses en ligne</h1><p>Faux site de test : aucune donnée réelle.</p></main>
</body></html>`
}

/**
 * La page du panier VIDE (`/checkout/cart`, DRV-712 U4, mesuré) : « Commencer mes achats » et le lien pour se connecter. La forme de l'élément et où il
 * mène sont PLAUSIBLES, non mesurés.
 */
export function cartPage({ bar, session, entry }: PageOptions): string {
  const start = {
    button: `<button type="button" id="start-shopping" onclick="location.href='/courses'">Commencer mes achats</button>`,
    link: '<a id="start-shopping" href="/courses">Commencer mes achats</a>',
    external:
      '<a id="start-shopping" href="https://autre-site.invalid/courses">Commencer mes achats</a>',
    none: '',
  }[entry]
  return `${HTML_HEAD('Mon panier (faux site de test)')}
<body>${sessionScript(session)}
<header>${barHtml(bar)}${nav()}</header>
<main><h1>Mon panier</h1><p>Votre panier est vide.</p>${start}</main>
</body></html>`
}

/** La page « introuvable » : un VRAI 404 (DRV-712, B-6, mesuré : le titre et le texte ; le reste est plausible). */
export function notFoundPage(): string {
  return `${HTML_HEAD('404 Not Found Page')}
<body><main><h1>Erreur 404</h1><p>Erreur 404 : Cette page n'existe pas.</p></main></body></html>`
}

/** Une page de défi de l'anti-robot : minimale, comme chez Leclerc, seul compte ce que l'agent y reconnaît. */
export function challengePage(): string {
  return `${HTML_HEAD('Vérification (faux site de test)')}
<body><iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=test" title="Vérification"></iframe></body></html>`
}

// —— La recherche (un squelette pour DRV-724) ——————————————————————————————————————————————————————————————————————————————————

const euros = (cents: number): string => `${(cents / 100).toFixed(2).replace('.', ',')} €`

/**
 * Une carte de produit : les attributs `data-product-id`, `data-offer-id`, `data-seller-type`, `data-offer-type`, `data-seller-id` (vide) et les microdonnées
 * `name`, `image`, `brand`, `offers`, `price` (décimal), `priceCurrency`, `availability` (B-1, mesuré). La mention « Dans mon drive » et le contenu net
 * (« 1kg ») sont affichés (B-4). Le HTML autour est inventé.
 */
function card(product: FakeProduct): string {
  return `<article class="product" data-product-id="${product.productId}" data-offer-id="${product.offerId}" data-seller-type="GROCERY" data-offer-type="DEFAULT" data-seller-id="" itemscope itemtype="https://schema.org/Product">
<meta itemprop="image" content="https://${PHOTO_HOST}/media/${product.photo}">
<h3 itemprop="name">${product.label}</h3>
<span itemprop="brand">${product.brand}</span>
<span class="net">${product.net}</span>
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
<meta itemprop="price" content="${(product.priceCents / 100).toFixed(2)}">
<meta itemprop="priceCurrency" content="EUR">
<link itemprop="availability" href="https://schema.org/InStock">
<span>${euros(product.priceCents)}</span> <em>Dans mon drive</em>
</div>
</article>`
}

/** La page de résultats de `GET /recherche?text=…` : une page HTML complète, les produits dans le DOM (B-1). */
export function searchPage(options: PageOptions, products: readonly FakeProduct[]): string {
  return `${HTML_HEAD('Recherche (faux site de test)')}
<body>${sessionScript(options.session)}
<header>${barHtml(options.bar)}${nav()}</header>
<main><h1>Résultats</h1>${products.map(card).join('\n')}</main>
</body></html>`
}

// —— Le parcours (`GET /journey`, A-2) ———————————————————————————————————————————————————————————————————————————————————————

/** Le parcours de la session : le drive choisi (type `GROCERY`), `ONLINE` à contexte nul, `STORE` (l'hypermarché rattaché). Tout est inventé. */
export function journeyBody(
  store: 'chosen' | 'none' | 'null-context',
  storeId: string = STORE.id,
): Record<string, unknown> {
  const grocery = {
    channels: ['PICK_UP'],
    seller: {
      id: storeId,
      name: 'Drive Ville-Test',
      type: 'DRIVE',
      storeReference: { id: '123' },
      functionalReferences: { storeId: '123', warehouseId: '456' },
    },
    pointOfService: {
      id: 'e0000000-0000-4000-8000-0000000000d4',
      name: STORE.label,
      type: 'DRIVE',
      url: '/magasins/drive-ville-test',
      enabled: true,
      open: true,
    },
  }
  const hypermarket = {
    channels: ['SELF', 'PICK_UP'],
    seller: { id: 'f0000000-0000-4000-8000-0000000000e5', storeReference: { id: '12' } },
  }
  const activeContexts =
    store === 'chosen'
      ? [
          { type: 'GROCERY', context: grocery },
          { type: 'ONLINE', context: null },
          { type: 'STORE', context: hypermarket },
        ]
      : store === 'null-context'
        ? [
            { type: 'GROCERY', context: null },
            { type: 'ONLINE', context: null },
          ]
        : [{ type: 'ONLINE', context: null }]
  return {
    id: 'a0000000-0000-4000-8000-0000000000f6',
    address: { postalCode: '00000', city: 'Ville-Test' },
    location: { longitude: 0, latitude: 0 },
    accuracy: 'CITY',
    activeContexts,
    contextHistory: [],
    metadata: {},
  }
}

// —— Le panier (`/cart/config`, `/cart`, `/cart/update`, C-1 à C-4) ———————————————————————————————————————————————————————————

/** Une ligne du faux panier. */
export interface CartLine {
  /** L'identifiant de la ligne de panier (`id`), posé au premier ajout. */
  id: string
  quantity: number
}

export type FakeCart = ReadonlyMap<string, CartLine>

/** La configuration que le site lit avant d'utiliser son panier (B-2 du rapport DRV-714) : les adresses, la reprise, le délai et les codes d'erreur. */
export function cartConfig(): Record<string, unknown> {
  return {
    updateCartEndpoint: '/cart/update',
    getCartEndpoint: '/cart',
    cartRetry: 2,
    timeout: 15_000,
    // Les CLÉS ont été relevées, pas les messages (C-7) : ils restent vides.
    errors: Object.fromEntries(
      [
        '401',
        '99001',
        '99002',
        '99003',
        '99004',
        '99005',
        '99006',
        '99007',
        'default',
        'mba-notification',
        'use-by-date-notification',
      ].map((code) => [code, '']),
    ),
  }
}

/** Le panier tel que le site le rend : les lignes, `cart.version`, le total EN CENTIMES (`cart.prices.totalPrice.amount`). */
export function cartResponse(
  cartId: string,
  version: number,
  cart: FakeCart,
): Record<string, unknown> {
  const items = [...cart.entries()].flatMap(([productId, line]) => {
    const product = PRODUCTS.find((candidate) => candidate.productId === productId)
    if (product === undefined) return []
    return [
      {
        cartItem: { id: line.id, desiredQuantity: line.quantity, actualQuantity: line.quantity },
        product: { id: product.productId, name: product.label, eans: [product.ean] },
        offer: {
          id: product.offerId,
          price: { amount: product.priceCents, currency: 'EUR' },
          availability: 'AVAILABLE',
          state: 'IMMEDIATE',
        },
        offering: { actualQuantity: line.quantity, maxQuantity: product.maxQuantity },
        deltaQuantity: 0,
      },
    ]
  })
  const total = [...cart.entries()].reduce((sum, [productId, line]) => {
    const product = PRODUCTS.find((candidate) => candidate.productId === productId)
    return sum + (product?.priceCents ?? 0) * line.quantity
  }, 0)
  return {
    revisedItems: [],
    cart: {
      id: cartId,
      version,
      items,
      prices: { totalPrice: { amount: total, currency: 'EUR' } },
      changes: [],
      contentWarnings: [],
    },
    itemsSortedByMostRecent: [],
  }
}
