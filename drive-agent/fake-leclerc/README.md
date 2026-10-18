# Faux site Leclerc (DRV-309)

Un petit serveur Node, sans dépendance, qui imite la **structure** du drive E.Leclerc avec des données **entièrement inventées** : produits, marques, libellés, prix, identifiants. Rien n'est copié du vrai site ; le dépôt est public. Il sert à jouer l'agent (`drive-agent/src`) de bout en bout, sans jamais contacter l'enseigne (ni DataDome, qu'il ne prouve pas : la recette réelle est DRV-505).

## Ce qu'il sert

| Chemin                                                      | Réponse                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` (l'hôte du magasin)                                     | redirection `302` vers l'accueil du faux magasin : c'est l'adresse que l'application Android ouvre pour un plan (DRV-314, DRV-319)                                                                                                                                                                                                |
| `/magasin-000001-000001-Ville-Test/`                        | accueil du faux magasin (`sNoPointLivraison` `123456`, différent de l'identifiant du magasin, comme sur le vrai site)                                                                                                                                                                                                             |
| `…/recherche.aspx?TexteRecherche=`                          | page HTML qui embarque le JSON d'initialisation (`widgets.lstProduits` : `iIdProduit`, `sLibelleLigne1/2`, `nrPVUnitaireTTC`, `sPrixPromo`, `nrPVParUniteDeMesureTTC`, `iQteDisponible`, `iQuantitePanier`…), 32 produits dans `catalog.ts` dont des ruptures, des promotions, un contenu net structuré, un contenu net illisible |
| `/magasin-000001-000001/panier.aspx?op=1` (POST, champ `d`) | quantité **absolue**, état du panier en mémoire, réponse en évènements (101/104/102, rayon, `Panier123456` avec `lstProduitsLight`, paniers complets) et `X-DataDome: protected`                                                                                                                                                  |
| `…/connexion.aspx`                                          | page de connexion simulée (où redirige le défaut « non connecté »)                                                                                                                                                                                                                                                                |
| `/drive/retour`                                             | le **faux Repas** : affiche le fragment `#result=` reçu, décodé, dans `<pre id="resultat">`                                                                                                                                                                                                                                       |

Le dernier produit du catalogue (`1000032`, « Vinaigre de cidre… ») porte dans ses deux libellés des caractères invisibles (largeur nulle, sens de lecture, marque d'ordre des octets, joint de mots) que le back refuse : l'agent doit les retirer à la lecture (`e2e/choix.spec.ts`, `test/fake-leclerc.spec.ts`).

Toutes les réponses du faux magasin portent `X-Frame-Options: DENY`. La requête du panier est vérifiée **à la lettre** (en-tête `zcwb: ajax-manager`, `X-Requested-With`, adresse **sans** suffixe de ville, identifiant de produit en texte, objet `objContexteProvenanceArticle` à l'ajout seulement, point de livraison) : tout écart reçoit la page d'erreur générique 404, comme le vrai site, et `rejected` le dit dans le journal.

## Accès local seulement

Il n'écoute que sur `127.0.0.1`, refuse (403) toute connexion qui ne vient pas de la boucle locale, et tout nom d'hôte qui n'est pas `localhost`, `127.0.0.1`, `courses-test.leclercdrive.fr` (ou un nom ajouté par `hosts` / `FAKE_LECLERC_HOSTS`). Le pilotage `/__fake/*` n'est offert qu'aux noms de la boucle locale. `courses-test.leclercdrive.fr` n'est pas un vrai magasin : le navigateur de test le résout vers `127.0.0.1` (règle `--host-resolver-rules`, voir `e2e/playwright.config.ts`) et **tout autre nom d'hôte n'a pas d'adresse** dans ce navigateur.

## Comportements activables

`startFakeLeclerc({ behavior })`, `fake.setBehavior(patch)` ou, d'un autre processus, `POST /__fake/behavior` (JSON) :

- `latencyMs` : délai ajouté à chaque recherche et chaque écriture du panier ;
- `fault: { kind, after?, on? }` : `after` requêtes passent d'abord, `on` (`search`, `cart`, `all`) dit lesquelles sont touchées. `kind` : `forbidden` (403), `too-many-requests` (429), `challenge` (page de défi `captcha-delivery.com`, 200), `contract-changed` (champs renommés ; panier sans évènement `Panier`), `not-found` (404 générique), `logged-out` (redirection vers la connexion) ;
- remise à neuf : `fake.reset()` ou `POST /__fake/reset` (panier vide, journal et violations effacés, cadence repartie de zéro, comportement par défaut) ;
- panier déjà garni : `fake.seedCart({ 1000001: 2 })` ou `POST /__fake/cart` ; produit en rupture, promotion, page sans résultat : dans le catalogue (`farine` : `1000002` en rupture, `1000003` en promotion ; `gnocchis` : aucun résultat) ;
- magasin différent : ouvrir `/magasin-000002-000002-Ville-Test/` alors que le plan vise `000001`.

## Cadence

Le serveur note chaque recherche et écriture du panier (début, fin, code) et signale dans `violations()` toute requête **en parallèle** ou qui suit la précédente à **moins de 800 ms** (valeur de `architecture.md` § 8, écrite ici et non lue dans l'agent). `GET /__fake/state` rend le panier, les requêtes et les violations.

## Lancer

- Les tests (`make agent-e2e`, voir `../e2e/`) démarrent chacun leur propre faux site sur un port libre.
- À la main : `make agent-fake` (Node 24 de la machine, `FAKE_LECLERC_PORT`, 8099 par défaut). Le client doit résoudre `courses-test.leclercdrive.fr` vers `127.0.0.1`.

## Réemploi (DRV-319, émulateur Android)

Le faux site sert tel quel à l'émulateur Android (`make android-e2e`, `android/README.md`) : même catalogue, mêmes défauts, même cadence jugée, même pilotage par HTTP (`/__fake/*`). Il tourne **dans le conteneur de l'émulateur** (Node, ce dossier monté en lecture seule sur `/opt/fake-leclerc`, `127.0.0.1:8099`), derrière un relais HTTPS de `android/emulator/testsite.py` qui ne lui transmet que le nom `courses-test.leclercdrive.fr` (certificat jetable, accepté seulement par la WebView de l'émulateur de test). Le « local seulement » tient : le faux site n'écoute toujours que sur la boucle locale du conteneur, refuse tout autre nom, et son pilotage n'est offert qu'aux noms de la boucle locale, donc au script de test (`docker compose exec`), jamais à l'émulateur.
