// La VERSION MOBILE du faux site Leclerc (DRV-754) : les pages et réponses que le propriétaire a MESURÉES sur le vrai site mobile le 2026-11-01, aux données inventées.
//   - `www` : l'accueil adapté au téléphone (un champ « Où souhaitez-vous récupérer vos courses ? », une suggestion de ville à toucher, des cartes de magasins à flèche,
//     la présentation du magasin et « Commencer mes courses », un mur de cookies modal) ;
//   - `m-courses` : l'application du magasin (`/magasin-N-N-ville`, sans `.aspx`), en-tête avec menu (« Connexion / Inscription » pour un visiteur), pied de page dont les
//     liens portent l'hôte `fd<N>-courses` du serveur, barre basse « Dernière connexion le … » une fois connecté, et, juste après la connexion, la question de l'ancien panier ;
//   - `fd<N>-courses` : le SERVEUR du magasin, parlé en AJAX depuis `m-courses` (recherche JSON, écriture et lecture du panier, avec les en-têtes CORS d'un autre hôte de la
//     même enseigne) et la page HTML du panier (`mobile-detail-panier.aspx`) ;
//   - `fd<N>-espace-client` : la création de compte où mène d'abord « Connexion / Inscription », la connexion en deux temps (adresse, mot de passe, une case de vérification
//     que seule une personne coche, puis la fenêtre « code reçu par e-mail ») sur la MÊME adresse `authentification.aspx`, et le compte.
// Rien ici n'est copié du vrai site (le dépôt est public) : seules les FORMES sont celles du rapport.
import { DELIVERY_POINT, findProduct, paidPrice, type FakeProduct } from './catalog.ts'
import { photoAddress } from './photos.ts'

const HEAD =
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'

/** Le magasin d'essai de la version mobile : ses numéros, la ville telle que `m-courses` l'écrit (minuscules) et telle que le serveur l'écrit (capitale). */
export const MOBILE_STORE = {
  id: '000001',
  cityMobile: 'ville-test',
  cityServer: 'Ville-Test',
} as const
/**
 * Un SECOND magasin (DRV-755) : celui que la personne choisit quand le plan est fait pour `MOBILE_STORE` (`otherStore`). Il n'a que sa page `m-courses` : on n'y fait aucun passage.
 */
export const MOBILE_OTHER_STORE = {
  id: '000002',
  cityMobile: 'autre-ville',
  cityServer: 'Autre-Ville',
} as const
export const MOBILE_OTHER_PAGE_PATH = `/magasin-${MOBILE_OTHER_STORE.id}-${MOBILE_OTHER_STORE.id}-${MOBILE_OTHER_STORE.cityMobile}`
export const MOBILE_PAGE_PATH = `/magasin-${MOBILE_STORE.id}-${MOBILE_STORE.id}-${MOBILE_STORE.cityMobile}`
export const MOBILE_CART_PATH = `/magasin-${MOBILE_STORE.id}-${MOBILE_STORE.id}`
export const SERVER_PAGE_PATH = `/magasin-${MOBILE_STORE.id}-${MOBILE_STORE.id}-${MOBILE_STORE.cityServer}`
export const ACCOUNT_PATH = `/drive/magasin-${MOBILE_STORE.id}-${MOBILE_STORE.id}-${MOBILE_STORE.cityServer}`

/** Les cookies de la version mobile : posés pour TOUS les hôtes du faux site (`domain=leclercdrive.fr`), comme le vrai site partage la session entre ses hôtes. */
export const MOBILE_MEMBER_COOKIE = 'fake_m_member'
export const MOBILE_STORE_COOKIE = 'fake_m_store'
export const MOBILE_ANSWERED_COOKIE = 'fake_m_answered'
export const MOBILE_CONSENT_COOKIE = 'fake_m_consent'
/** Le magasin choisi sur l'accueil est le SECOND magasin (DRV-755) : posé avec `MOBILE_STORE_COOKIE`. */
export const MOBILE_OTHER_COOKIE = 'fake_m_other'
const setCookie = (name: string) => `document.cookie = '${name}=1; domain=leclercdrive.fr; path=/';`

const euros = (cents: number): string => `${(cents / 100).toFixed(2).replace('.', ',')} €`
const cents = (amount: number): number => Math.round(amount * 100)

function totals(cart: ReadonlyMap<number, number>): { items: number; total: string } {
  let items = 0
  let sum = 0
  for (const [id, quantity] of cart) {
    const product = findProduct(id)
    if (!product) continue
    items += quantity
    sum += cents(paidPrice(product)) * quantity
  }
  return { items, total: euros(sum) }
}

/** Le produit de `lstProduits.lstElements[].objElement` : les champs mesurés, libellés avec des ENTITÉS HTML (« Poireaux coup&#233;s »). */
function objElement(
  product: FakeProduct,
  inCart: number,
  availability: boolean,
): Record<string, unknown> {
  const entities = (text: string) =>
    text.replace(/[^\x20-\x7e]/g, (char) => `&#${char.codePointAt(0) ?? 0};`)
  const { structured } = product
  return {
    iIdProduit: product.id,
    sNoPointLivraison: DELIVERY_POINT,
    iIdRayon: product.aisle,
    iIdFamille: product.family,
    niIdSousFamille: 0,
    sLibelleLigne1: entities(product.label1),
    sLibelleLigne2: entities(product.label2 ?? ''),
    iQteDisponible: product.stock,
    sPrixUnitaire: euros(cents(product.price)),
    nrPVUnitaireTTC: product.price,
    sPrixPromo: product.promo === undefined ? '' : euros(cents(product.promo)),
    sPrixParUniteDeMesure: product.noContent
      ? ''
      : `${euros(cents(product.perMeasure))} / ${product.measure}`,
    nrPVParUniteDeMesureTTC: product.noContent ? null : product.perMeasure,
    iQuantitePanier: inCart,
    eDisponibilite: availability ? (product.stock === 0 ? 2 : 1) : 0,
    sUrlVignetteProduit: photoAddress(product),
    ...(structured && {
      sUniteMesure: structured.unit,
      nrContenanceUnitaire: structured.each,
      nrContenanceTotale: structured.total,
      sUniteMesureTotale: structured.totalUnit,
    }),
  }
}

/** La réponse de `recherche-ajax.aspx` (M1) : un objet JSON dont les produits sont dans `lstProduits.lstElements[].objElement`. */
export function searchJson(
  query: string,
  found: readonly FakeProduct[],
  cart: ReadonlyMap<number, number>,
  availability: boolean,
): string {
  return JSON.stringify({
    sTexteRecherche: query,
    iNbTotalProduits: found.length,
    lstFiltreBlocs: [],
    lstFiltresValeurs: [],
    lstProduits: {
      lstElements: found.map((product) => ({
        objElement: objElement(product, cart.get(product.id) ?? 0, availability),
      })),
    },
    lstProduitsMDD: { lstElements: [] },
    objStickers: {},
    lstTrade: [],
  })
}

function lines(cart: ReadonlyMap<number, number>): Record<string, unknown>[] {
  return [...cart].flatMap(([id, quantity]) => {
    const product = findProduct(id)
    return product === undefined
      ? []
      : [
          {
            iIdProduit: id,
            iQtePanier: quantity,
            iQteDisponible: product.stock,
            fQuantiteMax: product.stock,
            rTotalAPayer: (cents(paidPrice(product)) * quantity) / 100,
          },
        ]
  })
}

/** La lecture du panier (M5, `op=12`) : un tableau d'évènements dont le sixième type porte l'objet panier (`sType` « Panier », `lstProduitsLight`). */
export function listingJson(cart: ReadonlyMap<number, number>): string {
  const { items, total } = totals(cart)
  return JSON.stringify([
    {
      eTypeEvenement: 6,
      sIdUnique: `Panier${DELIVERY_POINT}`,
      objElement: {
        fEstPanierCourant: true,
        fEstVide: items === 0,
        sNoPointLivraison: DELIVERY_POINT,
        sType: 'Panier',
        sId: `Panier${DELIVERY_POINT}`,
        iQuantitePanier: items,
        sTotalAPayer: total,
        sTotalHorsReductions: total,
        lstProduitsLight: lines(cart),
        sDateProchainRetraitDisponible: '',
        fAfficherTexteProduitIndispo: false,
      },
    },
  ])
}

/** La réponse d'une écriture de la version mobile (M13, M14), la FORME relevée le 2026-11-01 : produit, rayon, panier, paniers complets ; un refus : 102 puis 106. */
export function writeJson(
  cart: ReadonlyMap<number, number>,
  productId: number,
  kind: 'add' | 'change' | 'remove' | 'refused',
): string {
  const product = findProduct(productId)
  const { items, total } = totals(cart)
  const quantity = cart.get(productId) ?? 0
  const element = (
    extra: Record<string, unknown>,
    type: number,
    id: string,
  ): Record<string, unknown> => ({ eTypeEvenement: type, sIdUnique: id, ...extra })
  const productEvent = (type: number): Record<string, unknown> =>
    element(
      {
        objElement: {
          sType: 'Produit',
          iIdProduit: productId,
          sLibelleLigne1: product?.label1 ?? '',
          sPrixUnitaire: product === undefined ? '' : euros(cents(product.price)),
          nrPVUnitaireTTC: product?.price ?? 0,
          iQuantitePanier: quantity,
          sTotalAPayer:
            product === undefined ? '0,00 €' : euros(cents(paidPrice(product)) * quantity),
          iQteDisponible: product?.stock ?? 0,
        },
      },
      type,
      `Produit${productId}`,
    )
  const first =
    kind === 'refused'
      ? [productEvent(102), productEvent(106)]
      : [productEvent({ add: 101, change: 103, remove: 102 }[kind])]
  return JSON.stringify([
    ...first,
    {
      eTypeEvenement: 503,
      sIdUnique: `Rayon${product?.aisle ?? 0}`,
      objElement: { sType: 'Rayon', iQuantitePanier: quantity },
    },
    {
      eTypeEvenement: 1,
      sIdUnique: `Panier${DELIVERY_POINT}`,
      objElement: {
        sType: 'Panier',
        fEstVide: items === 0,
        iQuantitePanier: items,
        sTotalAPayer: total,
        lstProduitsLight: lines(cart),
      },
    },
    {
      eTypeEvenement: 4,
      sIdUnique: 'pPaniers',
      sType: 'PaniersComplets',
      iQuantitePanier: items,
      sTotalAPayer: total,
    },
  ])
}

/**
 * Ce que la requête d'une écriture de la version mobile doit être (M11, M12) : le champ `d` EXACTEMENT de la forme relevée (l'identifiant est un NOMBRE, le contexte
 * `eOrigine` 9, `eTypePage` 3, `niIdElement` et `lIdDemande` nuls, `sTexteRecherche` un texte), la quantité absolue. `null` si tout est conforme.
 */
export function mobileCartProblem(d: unknown): string | null {
  if (typeof d !== 'object' || d === null) return 'champ d illisible'
  const body = d as Record<string, unknown>
  const keys = Object.keys(body).join(',')
  if (keys !== 'eTypeAction,iIdProduit,iQuantite,sNoPointLivraison,objContexteProvenanceArticle')
    return 'clés de d inattendues'
  if (body.eTypeAction !== 1) return 'eTypeAction inattendu'
  if (typeof body.iIdProduit !== 'number' || !Number.isInteger(body.iIdProduit))
    return 'iIdProduit doit être un nombre'
  if (body.sNoPointLivraison !== DELIVERY_POINT) return 'point de livraison inconnu'
  const quantity = body.iQuantite
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0 || quantity > 99)
    return 'iQuantite invalide'
  const context = body.objContexteProvenanceArticle as Record<string, unknown> | null
  const valid =
    typeof context === 'object' &&
    context !== null &&
    Object.keys(context).join(',') ===
      'eOrigine,eTypePage,niIdElement,eVue,sTexteRecherche,lIdDemande' &&
    context.eOrigine === 9 &&
    context.eTypePage === 3 &&
    context.niIdElement === null &&
    context.eVue === 0 &&
    typeof context.sTexteRecherche === 'string' &&
    context.lIdDemande === null
  return valid ? null : 'objContexteProvenanceArticle inattendu'
}

/** La page du panier de la version mobile : du HTML rendu par le SERVEUR (`mobile-detail-panier.aspx`), sur l'hôte `fd<N>-courses`. */
export function mobileBasketPage(cart: ReadonlyMap<number, number>): string {
  const { items, total } = totals(cart)
  const rows = [...cart]
    .flatMap(([id, quantity]) => {
      const product = findProduct(id)
      return product === undefined ? [] : [`<li>${quantity} × ${product.label1}</li>`]
    })
    .join('')
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Mon panier (faux site mobile de test)</title></head>
<body>
<h1>Mon panier</h1>
<p>${items} article(s), ${total}</p>
<ul>${rows}</ul>
<footer>Faux site Leclerc : données inventées.</footer>
</body>
</html>
`
}

/** Où sont les autres hôtes du faux site, pour les liens : des origines complètes (`http://hôte:port`) ou, dans l'émulateur, du schéma de la page. */
export interface MobileOrigins {
  www: string
  courses: string
  server: string
  account: string
  repas: string
}

export type FooterForm = 'normal' | 'none' | 'two-hosts'

const wallHtml = (wall: boolean | 'tall' | 'banner' | undefined, consent: boolean): string =>
  wall && !consent
    ? `<div id="cookie-wall" role="dialog" aria-modal="true" aria-label="Cookies" style="${wall === 'banner' ? 'position:fixed;left:0;right:0;bottom:700px;' : 'position:fixed;inset:0;'}z-index:2147483000;background:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:16px">
<div><a href="#" class="wall-btn" role="button">Continuer sans accepter →</a><h2>Respect de votre vie privée</h2><p>Nous utilisons des cookies pour améliorer votre expérience.</p></div>
<div style="display:flex;flex-direction:column;gap:12px;padding-bottom:${wall === 'tall' ? 600 : 24}px">
<button type="button" class="wall-btn">Paramétrer les cookies</button>
<button type="button" class="wall-btn">Tout accepter</button>
</div></div>
<script>
for (const b of document.querySelectorAll('.wall-btn')) b.addEventListener('click', function (e) { e.preventDefault(); ${setCookie(MOBILE_CONSENT_COOKIE)} document.getElementById('cookie-wall').remove(); });
</script>`
    : ''

/**
 * L'accueil de la version mobile (`www`), sans magasin choisi : le champ « Où souhaitez-vous récupérer vos courses ? », la suggestion de ville à toucher, les cartes
 * de magasins à flèche ; une fois le magasin choisi, sa présentation et « Commencer mes courses », qui mène à `m-courses`. Le mur de cookies est modal.
 */
export function mobileAccueilPage(
  origins: MobileOrigins,
  state: {
    chosen: boolean
    consent: boolean
    wall?: boolean | 'tall' | 'banner'
    /** Le magasin qu'on choisit (ou a choisi) est le second (DRV-755). */
    other?: boolean
  },
): string {
  const target = state.other === true ? MOBILE_OTHER_PAGE_PATH : MOBILE_PAGE_PATH
  const body = state.chosen
    ? `<h1>Faux Leclerc Ville-Test</h1>
<p>Retrait de vos courses en drive</p>
<p><button id="start-shopping" type="button" class="btn">Commencer mes courses</button></p>
<script>
document.getElementById('start-shopping').addEventListener('click', function () { location.assign('${origins.courses}${target}'); });
</script>`
    : `<h1>Mes courses en ligne en drive</h1>
<form id="search" onsubmit="return false">
<input id="postal" type="text" inputmode="numeric" placeholder="Où souhaitez-vous récupérer vos courses ?" aria-label="Où souhaitez-vous récupérer vos courses ?">
</form>
<div id="suggestions"></div>
<div id="results"></div>
<script>
const field = document.getElementById('postal');
field.addEventListener('input', function () {
  document.getElementById('suggestions').innerHTML = field.value.length >= 5
    ? '<button id="suggestion" type="button">Saint-Bonnet-de-Mure, Rhône (' + field.value + ')</button>'
    : '';
  const suggestion = document.getElementById('suggestion');
  if (suggestion) suggestion.addEventListener('click', function () {
    document.getElementById('results').innerHTML = '<h2>Choisissez votre service autour du ' + field.value + '</h2><div class="card"><p>Faux Leclerc Ville-Test</p><button id="pick" type="button" aria-label="Choisir ce magasin">→</button></div>';
    document.getElementById('pick').addEventListener('click', function () { ${setCookie(MOBILE_STORE_COOKIE)} ${state.other === true ? setCookie(MOBILE_OTHER_COOKIE) : ''} location.reload(); });
  });
});
</script>`
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Accueil Leclerc Drive (faux site mobile de test)</title></head>
<body>
<nav><a href="${origins.account}${ACCOUNT_PATH}/authentification.aspx">Se connecter</a></nav>
${body}
${wallHtml(state.wall, state.consent)}
<footer>Faux site Leclerc : données inventées.</footer>
</body>
</html>
`
}

/**
 * La page du magasin de la version mobile (`m-courses`, application Angular simulée) : en-tête avec le menu, champ de recherche, pied de page aux liens vers l'hôte du
 * serveur ; visiteur : « Connexion / Inscription » dans le menu ; connecté : la barre basse « Dernière connexion le … » ; juste après la connexion et tant que la
 * personne n'a pas répondu : la question de l'ancien panier, sur une page d'information, avec ses deux boutons.
 */
export function mobileStorePage(
  origins: MobileOrigins,
  cart: ReadonlyMap<number, number>,
  state: { member: boolean; question: boolean; footer: FooterForm; other?: boolean },
): string {
  const { items, total } = totals(cart)
  // Le second magasin (DRV-755) a ses propres liens : ses numéros, sa ville, le même serveur
  const serverPath =
    state.other === true
      ? `/magasin-${MOBILE_OTHER_STORE.id}-${MOBILE_OTHER_STORE.id}-${MOBILE_OTHER_STORE.cityServer}`
      : SERVER_PAGE_PATH
  const links: Record<FooterForm, string> = {
    normal: `<a href="${origins.server}${serverPath}/plan-du-site">Plan du site</a> <a href="${origins.server}${serverPath}/mentions-legales">Mentions légales</a>`,
    none: '<a href="/aide">Aide</a>',
    'two-hosts': `<a href="${origins.server}${serverPath}/plan-du-site">Plan du site</a> <a href="${origins.server.replace('fd8-', 'fd9-')}${serverPath}/mentions-legales">Mentions légales</a>`,
  }
  if (state.member && state.question) {
    return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Information (faux site mobile de test)</title></head>
<body>
<h1>Information</h1>
<p>Vous aviez commencé un panier le 30/10/2026. Souhaitez-vous compléter le panier en cours avec les articles du panier du 30/10/2026 ?</p>
<p><button id="merge-yes" type="button">Oui je souhaite compléter mon panier</button></p>
<p><button id="merge-no" type="button">Non je ne souhaite pas compléter mon panier</button></p>
<script>
for (const id of ['merge-yes', 'merge-no']) document.getElementById(id).addEventListener('click', function () { ${setCookie(MOBILE_ANSWERED_COOKIE)} location.reload(); });
</script>
<footer>${links[state.footer]}</footer>
</body>
</html>
`
  }
  // L'icône du panier ouvre la page du SERVEUR (mesuré) : un lien de plus vers son hôte, sauf dans les pages qui n'en ont aucun (défaut simulé)
  const basketLink =
    state.footer === 'none'
      ? '/panier'
      : `${origins.server}${serverPath}/mobile-detail-panier.aspx?sProvenance=SM`
  const menu = state.member
    ? '<li><a href="#">Mon compte</a></li>'
    : `<li><a id="login-link" href="${origins.account}${ACCOUNT_PATH}/creation-compte-ccc.aspx?s=16000&amp;v=&amp;u=&amp;r=%2Fdrive">Connexion / Inscription</a></li>`
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Faux Leclerc Ville-Test (faux site mobile de test)</title></head>
<body>
<header>
<button id="menu" type="button" aria-label="Menu" onclick="document.getElementById('menu-list').style.display = 'block'">Menu</button>
<span>Faux Leclerc Ville-Test</span>
<span id="cart">${items} · ${total}</span>
<input type="search" placeholder="Produit, marque, …" aria-label="Produit, marque, …">
</header>
<ul id="menu-list" style="display:none"><li><a href="/">Accueil</a></li>${menu}</ul>
<main><h1>Mes produits habituels</h1><p>Rayons, promotions…</p>
<p><a id="basket-link" href="${basketLink}">Mon panier</a></p></main>
${state.member ? '<div id="last-login">Dernière connexion le 01/11/2026 à 12:00</div>' : ''}
<footer>${links[state.footer]}</footer>
</body>
</html>
`
}

/** La création de compte, où « Connexion / Inscription » mène d'abord : la connexion est un lien « Me connecter ». */
export function creationPage(origins: MobileOrigins): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Créer un compte (faux site mobile de test)</title></head>
<body>
<h1>Créer mon compte</h1>
<p>Déjà client ? <a id="to-login" href="${origins.account}${ACCOUNT_PATH}/authentification.aspx?s=600">Me connecter</a></p>
</body>
</html>
`
}

/**
 * La connexion en deux temps, sur UNE seule adresse (`authentification.aspx`) : l'adresse e-mail puis « Continuer », le mot de passe avec la case de vérification que
 * seule une personne coche, et, si `code`, la fenêtre « Saisissez le code reçu par e-mail » (six cases, une case « plus de code sur cet appareil », « Valider »). Rien n'est
 * saisi par l'agent : la personne seule remplit ces champs. « Valider » pose le cookie de connexion et ouvre le compte.
 */
export function authenticationPage(origins: MobileOrigins, code: boolean): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Connexion (faux site mobile de test)</title></head>
<body>
<h1>Connexion</h1>
<section id="step1">
<label for="email">Adresse email</label><input id="email" type="email" autocomplete="username">
<button id="continue" type="button">Continuer</button>
</section>
<section id="step2" style="display:none">
<label for="secret">Mot de passe unique</label><input id="secret" type="password" autocomplete="current-password">
<label><input id="stay" type="checkbox"> Rester connecté</label>
<label><input id="hcaptcha" type="checkbox"> Je suis un humain</label>
<button id="next" type="button">Me connecter</button>
</section>
<section id="step3" role="dialog" aria-label="Saisissez le code reçu par e-mail" style="display:none">
<h2>Saisissez le code reçu par e-mail</h2>
<p>Afin de confirmer votre identité, veuillez saisir le code de sécurité à 6 chiffres envoyé à l'adresse indiquée.</p>
<div>${'<input class="digit" inputmode="numeric" maxlength="1" size="1"> '.repeat(6)}</div>
<label><input id="trust" type="checkbox"> En cochant cette case, vous n'aurez plus à saisir de code de sécurité sur cet appareil pendant un certain temps</label>
<button id="validate" type="button">Valider</button>
</section>
<script>
const show = (id) => { for (const s of ['step1', 'step2', 'step3']) document.getElementById(s).style.display = s === id ? 'block' : 'none'; };
const done = () => { ${setCookie(MOBILE_MEMBER_COOKIE)} location.assign('${origins.account}${ACCOUNT_PATH}/home-espace-client-ccc.aspx'); };
document.getElementById('continue').addEventListener('click', () => show('step2'));
document.getElementById('next').addEventListener('click', () => { if (document.getElementById('hcaptcha').checked) { ${code ? "show('step3')" : 'done()'}; } });
document.getElementById('validate').addEventListener('click', done);
</script>
</body>
</html>
`
}

/** Le compte, où la connexion mène : un lien pour revenir aux courses. */
export function accountPage(origins: MobileOrigins): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Mon compte (faux site mobile de test)</title></head>
<body>
<h1>Mon compte</h1>
<p><a id="back-to-shop" href="${origins.courses}${MOBILE_PAGE_PATH}">Retour aux courses</a></p>
</body>
</html>
`
}
