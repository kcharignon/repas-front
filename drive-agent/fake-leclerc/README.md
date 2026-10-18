# Faux site Leclerc (DRV-309)

Un petit serveur Node, sans dépendance, qui imite la **structure** du drive E.Leclerc avec des données **entièrement inventées** : produits, marques, libellés, prix, identifiants. Rien n'est copié du vrai site ; le dépôt est public. Il sert à jouer l'agent (`drive-agent/src`) de bout en bout, sans jamais contacter l'enseigne (ni DataDome, qu'il ne prouve pas : la recette réelle est DRV-505).

## Ce qu'il sert

| Chemin                                                      | Réponse                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/magasin-000001-000001-Ville-Test/`                        | accueil du faux magasin (`sNoPointLivraison` `123456`, différent de l'identifiant du magasin, comme sur le vrai site)                                                                                                                                                                                                             |
| `…/recherche.aspx?TexteRecherche=`                          | page HTML qui embarque le JSON d'initialisation (`widgets.lstProduits` : `iIdProduit`, `sLibelleLigne1/2`, `nrPVUnitaireTTC`, `sPrixPromo`, `nrPVParUniteDeMesureTTC`, `iQteDisponible`, `iQuantitePanier`…), 31 produits dans `catalog.ts` dont des ruptures, des promotions, un contenu net structuré, un contenu net illisible |
| `/magasin-000001-000001/panier.aspx?op=1` (POST, champ `d`) | quantité **absolue**, état du panier en mémoire, réponse en évènements (101/104/102, rayon, `Panier123456` avec `lstProduitsLight`, paniers complets) et `X-DataDome: protected`                                                                                                                                                  |
| `…/connexion.aspx`                                          | page de connexion simulée (où redirige le défaut « non connecté »)                                                                                                                                                                                                                                                                |
| `/drive/retour`                                             | le **faux Repas** : affiche le fragment `#result=` reçu, décodé, dans `<pre id="resultat">`                                                                                                                                                                                                                                       |

Toutes les réponses du faux magasin portent `X-Frame-Options: DENY`. La requête du panier est vérifiée **à la lettre** (en-tête `zcwb: ajax-manager`, `X-Requested-With`, adresse **sans** suffixe de ville, identifiant de produit en texte, objet `objContexteProvenanceArticle` à l'ajout seulement, point de livraison) : tout écart reçoit la page d'erreur générique 404, comme le vrai site, et `rejected` le dit dans le journal.

## Accès local seulement

Il n'écoute que sur `127.0.0.1`, refuse (403) toute connexion qui ne vient pas de la boucle locale, et tout nom d'hôte qui n'est pas `localhost`, `127.0.0.1`, `courses-test.leclercdrive.fr` (ou un nom ajouté par `hosts` / `FAKE_LECLERC_HOSTS`). Le pilotage `/__fake/*` n'est offert qu'aux noms de la boucle locale. `courses-test.leclercdrive.fr` n'est pas un vrai magasin : le navigateur de test le résout vers `127.0.0.1` (règle `--host-resolver-rules`, voir `e2e/playwright.config.ts`) et **tout autre nom d'hôte n'a pas d'adresse** dans ce navigateur.

## Comportements activables

`startFakeLeclerc({ behavior })`, `fake.setBehavior(patch)` ou, d'un autre processus, `POST /__fake/behavior` (JSON) :

- `latencyMs` : délai ajouté à chaque recherche et chaque écriture du panier ;
- `fault: { kind, after?, on? }` : `after` requêtes passent d'abord, `on` (`search`, `cart`, `all`) dit lesquelles sont touchées. `kind` : `forbidden` (403), `too-many-requests` (429), `challenge` (page de défi `captcha-delivery.com`, 200), `contract-changed` (champs renommés ; panier sans évènement `Panier`), `not-found` (404 générique), `logged-out` (redirection vers la connexion) ;
- panier déjà garni : `fake.seedCart({ 1000001: 2 })` ou `POST /__fake/cart` ; produit en rupture, promotion, page sans résultat : dans le catalogue (`farine` : `1000002` en rupture, `1000003` en promotion ; `gnocchis` : aucun résultat) ;
- magasin différent : ouvrir `/magasin-000002-000002-Ville-Test/` alors que le plan vise `000001`.

## Cadence

Le serveur note chaque recherche et écriture du panier (début, fin, code) et signale dans `violations()` toute requête **en parallèle** ou qui suit la précédente à **moins de 800 ms** (valeur de `architecture.md` § 8, écrite ici et non lue dans l'agent). `GET /__fake/state` rend le panier, les requêtes et les violations.

## Lancer

- Les tests (`make agent-e2e`, voir `../e2e/`) démarrent chacun leur propre faux site sur un port libre.
- À la main : `make agent-fake` (Node 24 de la machine, `FAKE_LECLERC_PORT`, 8099 par défaut). Le client doit résoudre `courses-test.leclercdrive.fr` vers `127.0.0.1`.

## Réemploi (DRV-319, émulateur)

Le faux site sert tel quel à l'émulateur Android : même catalogue, mêmes défauts, pilotage par HTTP (`/__fake/*`). Restent à ajouter côté DRV-319 : HTTPS avec l'autorité de certification de test (le serveur est en HTTP) et l'atteindre depuis l'émulateur (`10.0.2.2` arrive en boucle locale si le faux site tourne sur la machine hôte ; l'émulateur en conteneur, ou Docker Desktop, demande un réseau partagé et donc une décision sur le « local seulement »).
