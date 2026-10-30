# Fixtures de l'agent

Des données **synthétiques**, inventées pour les tests (plans, résultats, pages). Le dépôt est public : jamais de HTML brut d'une enseigne,
de vrai numéro de magasin, de nom de ville, de cookie, de jeton, d'identifiant ni d'adresse e-mail. Un produit de test s'appelle « Farine de
test 1 kg », un magasin « 000000 », un hôte `courses-test.exemple.invalid`.

Le faux site Leclerc (`../fake-leclerc/`, DRV-309) a son propre catalogue inventé de 32 produits.

## `leclerc/` (DRV-303)

Elles reproduisent la **structure** décrite par `recherche.md` du dépôt back (noms de champs du JSON embarqué, forme des réponses du
panier), jamais une page réelle. Le point de livraison est `123456`, les produits `1000001` à `1000005`.

| Fichier                            | Contenu                                                                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recherche-farine.html`            | Résultats de recherche : 5 produits, dont un indisponible (`1000002`), un en promotion (`1000003`), un au contenu structuré (`1000005`)                                                                                                            |
| `recherche-invisibles.html`        | Deux produits (`1000101`, `1000102`) dont les libellés, secondes lignes, prix par mesure et unités portent des caractères invisibles ou de contrôle, écrits en `\uXXXX` du JSON, en entités HTML et en caractères de contrôle (le back les refuse) |
| `recherche-vide.html`              | « Aucun résultat » : le squelette du magasin, une liste de produits vide et le message du site                                                                                                                                                     |
| `recherche-vide-sans-liste.html`   | « Aucun résultat » : le squelette seul, sans conteneur de produits ni message (ticket C)                                                                                                                                                           |
| `recherche-vide-encodee.html`      | « Aucun résultat » : l'état du magasin encodé en entités HTML dans un attribut, le message dans le texte (ticket C)                                                                                                                                |
| `recherche-vide-panier-garni.html` | « Aucun résultat » : le squelette avec un panier garni (`lstProduitsLight`, lignes sans libellé) et `lstProduits: null` (ticket C)                                                                                                                 |
| `recherche-liste-illisible.html`   | Le squelette et une liste de produits non vide dont les champs ont été renommés : à NE PAS prendre pour « aucun produit » (`SEARCH_PRODUCTS_UNREADABLE`)                                                                                           |
| `connexion.html`                   | Une page de connexion (champ de mot de passe, aucun repère de magasin) servie à la place d'une réponse : `NOT_LOGGED_IN` (`LOGIN_FORM`)                                                                                                            |
| `recherche-changee.html`           | Une page que le site aurait refaite : plus aucun champ connu                                                                                                                                                                                       |
| `erreur-404.html`                  | Page d'erreur générique (elle contient le mot « datadome » sans être un défi)                                                                                                                                                                      |
| `defi.html`                        | Page de défi de l'anti-robot (renvoie vers `captcha-delivery.com`)                                                                                                                                                                                 |
| `panier-ajout.json`                | Réponse valide d'un ajout : évènements produit, rayon, panier (`lstProduitsLight`), paniers complets                                                                                                                                               |
| `panier-changement.json`           | Réponse d'un changement de quantité (identifiants et quantités en texte)                                                                                                                                                                           |
| `panier-retrait.json`              | Réponse d'un retrait : le produit n'est plus dans `lstProduitsLight`                                                                                                                                                                               |
| `panier-invalide.json`             | Une réponse sans évènement panier                                                                                                                                                                                                                  |

## `contract/` (DRV-501, DRV-704)

Copies à l'octet près des exemples de contrat du back (`make samples-update`, voir `contract/SOURCE.md`) : `plan`, `choices`, `estimate`, `settings` et `retailers.sample.json` (les enseignes : identifiant, noms, forme de l'adresse d'un magasin et d'un produit). Ne pas les modifier à la main.
