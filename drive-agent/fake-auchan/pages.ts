// Les pages et réponses du faux site d'Auchan (DRV-717), avec la FORME mesurée sur le vrai site le 2026-10-30 (rapports DRV-712 à 714, hypothèses
// `hypotheses-site-reel-auchan.md` du dépôt back) et des données entièrement INVENTÉES : un UUID de test, `Drive Ville-Test`, des produits de test. Aucun
// HTML, aucun nom de magasin, aucun identifiant ni aucune ville du vrai site n'est ici. Ce qui n'a pas été mesuré (la structure exacte de la barre du
// magasin, la page « introuvable » au-delà de son titre et de son texte, où mène « Commencer mes achats ») est une FORME PLAUSIBLE, marquée comme telle.

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

export const HTML_HEAD = (title: string): string =>
  `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head>`

/** Le script que la page exécute à son chargement : le signal de connexion (D-6). */
export function sessionScript(session: SessionKind): string {
  if (session === 'unknown') return ''
  return `<script>sessionStorage.setItem('tracking_authenticated', '${session === 'member' ? 'true' : 'false'}')</script>`
}

/**
 * La barre du magasin en haut de la page. `withdrawal` : « Retrait : <le drive> » (A-4) ; `choose` : « Choisir vos courses » (A-5). PLAUSIBLE, non
 * mesuré : l'élément (ici un bouton-lien et un bloc) ; le texte, lui, est celui du rapport.
 */
export function barHtml(bar: Bar): string {
  if (bar === 'none') return ''
  return bar === 'withdrawal'
    ? `<div class="store-bar"><span>Retrait : ${STORE.label}</span></div>`
    : '<a href="#" role="button" class="store-bar">Choisir vos courses</a>'
}

export function nav(): string {
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

/**
 * Une page de connexion INVENTÉE servie à la place du JSON du panier (DRV-752) : un formulaire vers l'adresse d'un serveur d'identité, un champ de mot de
 * passe et le script du reCAPTCHA invisible (D-4 : présent sur la page de connexion, mesuré). Ni la page réelle ni une forme mesurée sur la réponse du panier.
 */
export function loginPage(): string {
  return `${HTML_HEAD('Connexion (faux site de test)')}
<body><main><h1>Se connecter</h1>
<form action="/auth/realms/test/protocol/openid-connect/auth" method="post"><input type="email" name="username"><input type="password" name="password"><button>Se connecter</button></form>
<script src="https://www.google.com/recaptcha/enterprise.js"></script></main></body></html>`
}

/** Une page de consentement aux cookies INVENTÉE (DRV-752) : sans champ de mot de passe ni défi, elle ne change pas le verdict de l'agent. */
export function consentPage(): string {
  return `${HTML_HEAD('Cookies (faux site de test)')}
<body><main><h1>Vos choix</h1><p>Nous demandons votre consentement.</p><button>Tout accepter</button><button>Continuer sans accepter</button></main></body></html>`
}

/** Une page d'erreur INVENTÉE servie en `200` (DRV-752). */
export function errorPage(): string {
  return `${HTML_HEAD('Erreur (faux site de test)')}
<body><main><h1>Service temporairement indisponible</h1><p>Réessayez dans un instant.</p></main></body></html>`
}

/**
 * Une page ordinaire du site INVENTÉE (DRV-752) : un lien « Se connecter » et une bannière de cookies, sans champ de mot de passe. Ni connexion, ni défi, ni
 * erreur : l'agent ne la reconnaît pas (`CART_NOT_JSON`), il n'accuse ni la connexion ni l'anti-robot.
 */
export function sitePage(): string {
  return `${HTML_HEAD('Courses en ligne (faux site de test)')}
<body><header><a href="/auth/login">Se connecter</a></header><main><h1>Courses en ligne</h1></main><div>Gérer mes cookies : tout accepter ou refuser.</div></body></html>`
}
