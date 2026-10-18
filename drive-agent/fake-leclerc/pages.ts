// Les pages et réponses du faux site, avec la FORME relevée sur le vrai site (`recherche.md` du dépôt back) et des données inventées :
// page de recherche = HTML qui embarque un JSON d'initialisation (`widgets`), panier = tableau d'évènements dont `Panier<point>`
// porte `lstProduitsLight`. Les pages d'erreur et de défi sont minimales : seul compte ce que l'agent y reconnaît.
import { DELIVERY_POINT, findProduct, paidPrice, type FakeProduct } from './catalog.ts'

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
    sUrlVignetteProduit: `https://photos-test.leclercdrive.fr/image.ashx?id=${product.id - 999000}&use=l&cat=p`,
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

const HEAD =
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
const NAV = '<nav><a href="./">Accueil</a> <a href="panier.aspx">Panier</a></nav>'

/** Une page du faux magasin : un titre, une phrase, et le JSON d'initialisation (point de livraison, panier). */
function storePage(
  title: string,
  text: string,
  widgets: Record<string, unknown>,
  cart: Cart,
): string {
  const { items, total } = totalsOf(cart)
  const state = {
    sNoPointLivraison: DELIVERY_POINT,
    sTotalAPayer: total,
    iQuantitePanier: items,
    ...widgets,
    lstProduitsLight: lightLines(cart, false),
  }
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>${title} (faux site de test)</title></head>
<body>
${NAV}
<h1>${title}</h1>
<p>${text}</p>
<script>
var widgets = ${JSON.stringify(state, null, 2)};
</script>
<footer>Faux site Leclerc : données inventées.</footer>
</body>
</html>
`
}

/** La racine de l'hôte : le site ordinaire de l'enseigne, où l'on choisit son magasin (aucune adresse `/magasin-<id>-<id>`, donc pas une page de magasin). */
export function enseignePage(storePath: string): string {
  return `<!doctype html>
<html lang="fr">
<head>${HEAD}<title>Accueil de l'enseigne (faux site de test)</title></head>
<body>
<h1>Accueil de l'enseigne</h1>
<p>Bienvenue sur le faux site de l'enseigne : choisissez votre magasin pour commencer vos courses.</p>
<p><a id="choose-store" href="${storePath}/">Choisir mon magasin</a></p>
<footer>Faux site Leclerc : données inventées.</footer>
</body>
</html>
`
}

export function homePage(cart: Cart): string {
  return storePage('Accueil du magasin', 'Bienvenue dans le faux drive.', {}, cart)
}

/** La page de recherche : les produits trouvés, avec leur quantité déjà au panier. */
export function searchPage(query: string, found: readonly FakeProduct[], cart: Cart): string {
  const products = found.map((product) => productJson(product, cart.get(product.id) ?? 0))
  const text =
    found.length === 0 ? 'Aucun résultat pour votre recherche' : 'Résultats pour votre recherche'
  return storePage(
    `Recherche : ${query.replace(/[<>&"]/g, '')}`,
    text,
    {
      widgets: [{ nom: 'produits', lstProduits: products }],
    },
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
