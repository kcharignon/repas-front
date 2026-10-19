// Les pages et réponses du faux site, avec la FORME relevée sur le vrai site (`recherche.md` du dépôt back) et des données inventées :
// page de recherche = HTML qui embarque un JSON d'initialisation (`widgets`), panier = tableau d'évènements dont `Panier<point>`
// porte `lstProduitsLight`. Les pages d'erreur et de défi sont minimales : seul compte ce que l'agent y reconnaît.
import { DELIVERY_POINT, findProduct, paidPrice, type FakeProduct } from './catalog.ts'
import { photoAddress } from './photos.ts'

/** Le panier : identifiant du produit, quantité. */
export type Cart = ReadonlyMap<number, number>

const euros = (cents: number): string => `${(cents / 100).toFixed(2).replace('.', ',')} €`
const cents = (euros: number): number => Math.round(euros * 100)

/** Le total à payer et le nombre d'articles du panier. */
export function totalsOf(cart: Cart): { items: number; totalCents: number; total: string } {
  let items = 0
  let totalCents = 0
  for (const [id, quantity] of cart) {
    const product = findProduct(id)
    if (!product) continue
    items += quantity
    totalCents += cents(paidPrice(product)) * quantity
  }
  return { items, totalCents, total: euros(totalCents) }
}

function productJson(product: FakeProduct, inCart: number): Record<string, unknown> {
  const { structured } = product
  return {
    iIdProduit: product.id,
    sLibelleLigne1: product.label1,
    sLibelleLigne2: product.label2,
    nrPVUnitaireTTC: product.price,
    sPrixUnitaire: euros(cents(product.price)),
    sPrixPromo: product.promo === undefined ? null : euros(cents(product.promo)),
    nrPVParUniteDeMesureTTC: product.noContent ? null : product.perMeasure,
    sPrixParUniteDeMesure: product.noContent
      ? ''
      : `${euros(cents(product.perMeasure))} / ${product.measure}`,
    iQteDisponible: product.stock,
    iQuantitePanier: inCart,
    sUrlVignetteProduit: photoAddress(product),
    iIdRayon: product.aisle,
    iIdFamille: product.family,
    ...(structured && {
      sUniteMesure: structured.unit,
      nrContenanceUnitaire: structured.each,
      nrContenanceTotale: structured.total,
      sUniteMesureTotale: structured.totalUnit,
    }),
  }
}

/** Les lignes du panier, au format `lstProduitsLight`. `asText` : identifiants et quantités en texte, comme sur un changement de quantité. */
function lightLines(cart: Cart, asText: boolean): Record<string, unknown>[] {
  return [...cart].flatMap(([id, quantity]) => {
    const product = findProduct(id)
    if (!product) return []
    return [
      {
        iIdProduit: asText ? String(id) : id,
        iQtePanier: asText ? String(quantity) : quantity,
        iQteDisponible: product.stock,
        fQuantiteMax: product.stock,
        rTotalAPayer: (cents(paidPrice(product)) * quantity) / 100,
      },
    ]
  })
}

// Pas de balise `viewport` : comme le site PC de l'enseigne (servi à l'application en mode ordinateur), la page est faite pour une fenêtre
// de bureau. Un navigateur de téléphone lui donne alors une fenêtre de 980 px CSS, affichée sur un écran d'environ 400 dp : texte et
// boutons y sont minuscules, ce que l'interface de l'agent doit compenser (échelle d'affichage). Avec `width=device-width`, le faux site
// cachait ce défaut.
const HEAD = '<meta charset="utf-8">'

/** Ce que la page montre de la connexion : un client connecté ou un visiteur (ticket G). Libellés inventés, plausibles, jamais mesurés. */
export type Session = 'member' | 'visitor'
const NAV: Record<Session, string> = {
  member:
    '<nav><a href="./">Accueil</a> <a href="panier.aspx">Panier</a> <a href="compte.aspx">Mon compte</a> <a href="deconnexion.aspx">Se déconnecter</a></nav>',
  visitor:
    '<nav><a href="./">Accueil</a> <a href="panier.aspx">Panier</a> <a href="connexion.aspx">Se connecter</a> <a href="inscription.aspx">Créer un compte</a></nav>',
}

/** La forme d'une page de recherche sans résultat (ticket C) : plusieurs formes plausibles du même squelette, aucune n'est mesurée. */
export type EmptyForm = 'list' | 'no-list' | 'encoded'

/** Une page du faux magasin : un titre, une phrase, et le JSON d'initialisation (point de livraison, panier). */
function storePage(
  title: string,
  text: string,
  widgets: Record<string, unknown>,
  cart: Cart,
  session: Session = 'member',
  encoded = false,
): string {
  const { items, total } = totalsOf(cart)
  const state = {
    sNoPointLivraison: DELIVERY_POINT,
    sTotalAPayer: total,
    iQuantitePanier: items,
    ...widgets,
    lstProduitsLight: lightLines(cart, false),
  }
  // L'état embarqué : dans un script, ou (forme \`encoded\`) dans un attribut dont les guillemets sont des entités HTML.
  const embedded = encoded
    ? `<div id="etat" data-init="${JSON.stringify(state).replaceAll('"', '&quot;')}"></div>`
    : `<script>
var widgets = ${JSON.stringify(state, null, 2)};
</script>`
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>${title} (faux site de test)</title></head>
<body>
${NAV[session]}
<h1>${title}</h1>
<p>${text}</p>
${embedded}
<footer>Faux site Leclerc : données inventées.</footer>
</body>
</html>
`
}

/**
 * La racine de l'enseigne (`www.leclercdrive.fr`), session ouverte : l'accueil du magasin de l'utilisateur, que le vrai site affiche à cette
 * adresse (recette réelle du 2026-10-18 : nom du magasin, « Je peux retirer ma commande », bouton « Commencer mes courses »). La racine de
 * l'hôte du magasin, elle, est une page 404. Ce n'est pas une page de magasin pour l'agent (aucune adresse `/magasin-<id>-<id>-<ville>`) : le
 * bouton mène aux vraies pages du magasin (`storeUrl`, avec la ville, sur l'hôte du magasin), et `otherStoreUrl` à un autre magasin.
 */
export function accueilPage(
  storeUrl: string,
  otherStoreUrl?: string,
  form: HomeForm = 'link',
): string {
  const button = form === 'button' || form === 'button-human' || form === 'button-inert'
  // Le clic ouvre le magasin ; `button-human` ignore un clic de programme, `button-inert` n'ouvre rien.
  const onClick =
    form === 'button-inert'
      ? ''
      : `${form === 'button-human' ? 'if (!event.isTrusted) return;' : ''} location.assign('${storeUrl}');`
  const start = button
    ? `<p><a id="start-shopping" class="btn" role="button">Commencer mes courses</a></p>
<script>
document.getElementById('start-shopping').addEventListener('click', function (event) {${onClick}});
</script>`
    : form === 'no-link'
      ? '<p><a href="/connexion.aspx">Se connecter</a></p>'
      : `<p><a id="start-shopping" href="${storeUrl}">Commencer mes courses</a></p>`
  const challenge =
    form === 'challenge'
      ? '<iframe title="Vérification" src="https://geo.captcha-delivery.com/captcha/"></iframe>\n'
      : ''
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Accueil du magasin (faux site de test)</title></head>
<body>
<h1>Faux Leclerc Ville-Test</h1>
<p>Je peux retirer ma commande</p>
${start}
${challenge}${otherStoreUrl === undefined ? '' : `<p><a id="other-store" href="${otherStoreUrl}">Changer de magasin</a></p>\n`}<footer>Faux site Leclerc : données inventées.</footer>
</body>
</html>
`
}

/**
 * La page du panier (DRV-629) : `<chemin du magasin avec la ville>/detail-panier.aspx`, la page que « Finaliser sur Leclerc » ouvre. Les lignes du
 * panier en mémoire du faux site, leur total ; données inventées.
 */
export function basketPage(cart: Cart, session: Session = 'member'): string {
  const { items, total } = totalsOf(cart)
  const lines = [...cart]
    .flatMap(([id, quantity]) => {
      const product = findProduct(id)
      return product ? [`<li>${quantity} × ${product.label1}</li>`] : []
    })
    .join('\n')
  return storePage(
    'Mon panier',
    items === 0 ? 'Votre panier est vide' : `${items} articles, total ${total}`,
    {},
    cart,
    session,
  ).replace('<footer>', `<ul id="lignes">\n${lines}\n</ul>\n<footer>`)
}

export function homePage(cart: Cart, session: Session = 'member'): string {
  return storePage('Accueil du magasin', 'Bienvenue dans le faux drive.', {}, cart, session)
}

/**
 * La page de recherche : les produits trouvés, avec leur quantité déjà au panier. Sans produit, la page prend la forme \`empty\` : liste vide
 * avec le message du site (\`list\`), squelette seul, sans conteneur de produits ni message (\`no-list\`), ou état encodé en entités HTML
 * (\`encoded\`). \`session\` : l'en-tête d'un client connecté ou d'un visiteur (les produits sont les mêmes : le catalogue est public).
 */
export function searchPage(
  query: string,
  found: readonly FakeProduct[],
  cart: Cart,
  session: Session = 'member',
  empty: EmptyForm = 'list',
): string {
  const title = `Recherche : ${query.replace(/[<>&"]/g, '')}`
  if (found.length === 0 && empty === 'no-list') return storePage(title, '', {}, cart, session)
  const products = found.map((product) => productJson(product, cart.get(product.id) ?? 0))
  const text =
    found.length === 0 ? 'Aucun résultat pour votre recherche' : 'Résultats pour votre recherche'
  return storePage(
    title,
    text,
    { widgets: [{ nom: 'produits', lstProduits: products }] },
    cart,
    session,
    found.length === 0 && empty === 'encoded',
  )
}

/** Une page de recherche dont les produits ont des champs renommés : le squelette est là, mais l'agent ne sait plus lire les produits. */
export function renamedProductsPage(found: readonly FakeProduct[], cart: Cart): string {
  const products = found.map((product) => ({
    id: String(product.id),
    intitule: product.label1,
    prix: product.price,
  }))
  return storePage(
    'Recherche',
    'Résultats pour votre recherche',
    { widgets: [{ nom: 'produits', lstProduits: products }] },
    cart,
  )
}

/** Une page « que le site aurait refaite » : plus aucun des champs connus (le contrat a changé). */
export function changedSearchPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Résultats (faux site de test)</title></head>
<body>
${NAV}
<p>Résultats</p>
<script>
var donnees = { "items": [ { "id": "A1", "nom": "Farine de test", "prix": 1.29 }, { "id": "A2", "nom": "Sucre de test", "prix": 1.5 } ] };
</script>
</body>
</html>
`
}

/** La page de connexion, où le faux site redirige quand on n'est pas connecté. */
export function loginPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Connexion (faux site de test)</title></head>
<body><h1>Connexion</h1><p>Identifiez-vous pour continuer (page simulée).</p></body>
</html>
`
}

/** La page d'erreur générique du site (404) : elle contient le mot « datadome » sans être un défi. */
export function errorPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Erreur (faux site de test)</title></head>
<body><h1>Ce service est momentanément indisponible</h1><p>Page d'erreur simulée. Protégé par datadome (mot seul, ce n'est pas un défi).</p></body>
</html>
`
}

/** La page de défi de l'anti-robot : elle renvoie vers `captcha-delivery.com` (adresse jamais jointe par le navigateur de test). */
export function challengePage(): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Vérification (faux site de test)</title></head>
<body><script>var dd = {"host":"https://geo.captcha-delivery.com/captcha/"};</script><p>Veuillez résoudre ce défi (page simulée).</p></body>
</html>
`
}

/**
 * Ce que l'accueil de l'enseigne montre (DRV-625, DRV-629) : le lien « Commencer mes courses » (`link`, par défaut), la page d'un visiteur qui n'a
 * que « Se connecter » (`no-link`), ou le lien accompagné d'un défi de l'anti-robot (`challenge`) : dans les deux derniers cas l'agent ne suit
 * rien. Le vrai site (constat du 2026-10-19) a un BOUTON sans adresse : `button` (un élément sans `href` dont un script ouvre le magasin au clic,
 * quel qu'il soit), `button-human` (idem, mais le script ignore tout clic qui n'est pas un vrai toucher : `event.isTrusted`, comme le site
 * qui distingue un clic programmé), `button-inert` (le bouton est là et ne fait rien).
 */
export type HomeForm = 'link' | 'no-link' | 'challenge' | 'button' | 'button-human' | 'button-inert'

/** Le faux Repas : la page de retour, qui affiche le fragment `#result=` reçu (décodé) pour que les tests le lisent. */
export function repasReturnPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Repas (faux)</title></head>
<body>
<h1>Repas (faux)</h1>
<p>Page de retour de test : le résultat reçu de l'agent s'affiche ci-dessous.</p>
<pre id="resultat" data-ready="false"></pre>
<script>
(function () {
  var raw = location.hash.replace(/^#result=/, '').replace(/-/g, '+').replace(/_/g, '/');
  var pre = document.getElementById('resultat');
  try {
    var binary = atob(raw + '==='.slice((raw.length + 3) % 4));
    var bytes = Uint8Array.from(binary, function (c) { return c.charCodeAt(0); });
    pre.textContent = new TextDecoder().decode(bytes);
  } catch (e) {
    pre.textContent = 'fragment illisible';
  }
  pre.setAttribute('data-ready', 'true');
})();
</script>
</body>
</html>
`
}

export type CartAction = 'add' | 'change' | 'remove'

/**
 * La réponse du panier après une écriture : un tableau d'évènements (produit 101 ajout / 104 changement / 102 retrait, rayon 501 / 502,
 * panier 1, paniers complets 4). L'état du panier est dans `Panier<point>` (`lstProduitsLight`, `iQuantitePanier`, `sTotalAPayer`).
 */
export function cartResponse(cart: Cart, product: FakeProduct, action: CartAction): unknown[] {
  const { items, total } = totalsOf(cart)
  const type = { add: 101, change: 104, remove: 102 }[action]
  return [
    {
      eTypeEvenement: type,
      sIdUnique: `Produit${product.id}`,
      iQuantitePanier: cart.get(product.id) ?? 0,
      iQteDisponible: product.stock,
    },
    { eTypeEvenement: action === 'remove' ? 502 : 501, sIdUnique: `Rayon${product.aisle}` },
    {
      eTypeEvenement: 1,
      sIdUnique: `Panier${DELIVERY_POINT}`,
      iQuantitePanier: items,
      sTotalAPayer: total,
      iNbProduitIndisponible: 0,
      lstProduitsLight: lightLines(cart, action === 'change'),
    },
    { eTypeEvenement: 4, sIdUnique: 'PaniersComplets' },
  ]
}
