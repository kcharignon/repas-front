# Faux site d'Auchan (DRV-717)

Un serveur Node **sans dépendance** qui rejoue la **structure** du site d'Auchan telle que le spike du 2026-10-30 l'a mesurée (rapports `DRV-712` à `714` du dépôt
back, hypothèses `docs/drive/hypotheses-site-reel-auchan.md`), avec des données **entièrement inventées** : un magasin de test (UUID `0b5f8a2e-…`, libellé
`Drive Ville-Test`), des produits de test, des cookies de test. **Aucun HTML, nom de magasin, ville, identifiant ou jeton du vrai site n'est ici.** Il sert à
jouer l'agent de bout en bout sans jamais contacter Auchan.

Il n'écoute que sur `127.0.0.1` et refuse (403) toute connexion qui ne vient pas de la boucle locale ou qui vise un autre nom d'hôte que `localhost`,
`127.0.0.1` et `www.auchan.fr`. Le navigateur des tests résout `www.auchan.fr` vers `127.0.0.1` et **tout autre nom vers rien** (`--host-resolver-rules`,
`drive-agent/e2e/playwright.config.ts`) : aucune requête ne peut atteindre une enseigne.

## Ce qu'il rejoue

| Route                                                            | Forme (hypothèse du dépôt back)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /journey`                                                   | JSON `{activeContexts: [{type, context}], …}` : `GROCERY` (le drive choisi : `channels: ["PICK_UP"]`, `seller.id` UUID, `pointOfService.name`), `ONLINE` à contexte nul, `STORE` (A-2). Exige `X-Requested-With: XMLHttpRequest`.                                                                                                                                                                                                                             |
| `GET /courses`                                                   | La page d'accueil des courses : barre « Retrait : <drive> » avec un magasin, « Choisir vos courses » sans (A-4, A-5) ; le signal de connexion `sessionStorage.tracking_authenticated` (`"true"` / `"false"`, D-6).                                                                                                                                                                                                                                            |
| `GET /checkout/cart`                                             | Le panier vide et son « Commencer mes achats » (U4).                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GET /cart/config`, `GET /cart?consentId=…`, `POST /cart/update` | Un **squelette** pour DRV-725 : `cartId` accordé à `lark-cart` (visiteur) ou absent à la lecture (client connecté), quantité absolue, `0` retire, total en centimes (C-1 à C-4).                                                                                                                                                                                                                                                                              |
| `GET /recherche?text=…`                                          | Des pages de résultats **synthétiques** (`search.ts`, DRV-724) : cartes avec plusieurs balises `data-product-id` par produit et microdonnées (B-1) ; un produit indisponible, un sans prix, un lot de six ; « aucun résultat » (squelette + phrase, NON MESURÉ) ; les termes `fiche` et `rayon` REDIRIGENT (B-8, SUPPOSÉ) vers une fiche de produit et un rayon ; `inconnu`, `illisible` et `sansoffre` rendent des formes que l'adaptateur ne reconnaît pas. |
| toute autre adresse                                              | un **vrai `404`**, page « Erreur 404 » (B-6).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| cookies                                                          | `lark-consentId` toujours, `lark-cart` pour un visiteur seulement (C-3), `datadome` (D-1), `connect.sid` en `HttpOnly`.                                                                                                                                                                                                                                                                                                                                       |

Ce qui n'a **pas** été mesuré sur le vrai site est une forme _plausible_ ici, et le dit dans le code : l'élément exact de la barre du magasin, où mène « Commencer
mes achats », la page « introuvable » au-delà de son titre et de son texte.

## Le pilotage

`fake.setBehavior({…})` (ou `POST /__fake/behavior` sur `localhost`) change ce que le site répond : `store` (`chosen`, `none`, `null-context`), `storeId` (un autre
magasin que celui du plan), `bar` (une barre qui n'est pas d'accord avec le parcours), `session` (`member`, `visitor`, `unknown`), `entry` (`button`, `link`,
`external`, `none`), `datadome`, `latencyMs` et `journey` (`ok`, `not-json`, `no-contexts`, `no-seller`, `bad-id`, `not-found`, `server-error`, `forbidden`,
`challenge`, `login-redirect`, `hang`).

Il **surveille la cadence** : jamais deux requêtes de l'agent à la fois, jamais plus vite que `MIN_GAP_MS` (2 000 ms, la pause de départ d'Auchan, non
mesurée) ; les écarts sont dans `fake.violations()`. `fake.writes()` liste les `POST /cart/update` : un parcours sans magasin n'en a **aucun**.

`make agent-fake-auchan` le lance à la main sur `127.0.0.1:8098`. Il ne prouve ni DataDome ni le reCAPTCHA (recette réelle, DRV-726).
