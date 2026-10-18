# Fixtures de l'agent

Des données **synthétiques**, inventées pour les tests (plans, résultats, pages). Le dépôt est public : jamais de HTML brut d'une enseigne,
de vrai numéro de magasin, de nom de ville, de cookie, de jeton, d'identifiant ni d'adresse e-mail. Un produit de test s'appelle « Farine de
test 1 kg », un magasin « 000000 », un hôte `courses-test.exemple.invalid`.

Le faux site Leclerc (`../fake-leclerc/`, DRV-309) a son propre catalogue inventé de 30 produits.

## `leclerc/` (DRV-303)

Elles reproduisent la **structure** décrite par `recherche.md` du dépôt back (noms de champs du JSON embarqué, forme des réponses du
panier), jamais une page réelle. Le point de livraison est `123456`, les produits `1000001` à `1000005`.

| Fichier                  | Contenu                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `recherche-farine.html`  | Résultats de recherche : 5 produits, dont un indisponible (`1000002`), un en promotion (`1000003`), un au contenu structuré (`1000005`) |
| `recherche-vide.html`    | « Aucun résultat »                                                                                                                      |
| `recherche-changee.html` | Une page que le site aurait refaite : plus aucun champ connu                                                                            |
| `erreur-404.html`        | Page d'erreur générique (elle contient le mot « datadome » sans être un défi)                                                           |
| `defi.html`              | Page de défi de l'anti-robot (renvoie vers `captcha-delivery.com`)                                                                      |
| `panier-ajout.json`      | Réponse valide d'un ajout : évènements produit, rayon, panier (`lstProduitsLight`), paniers complets                                    |
| `panier-changement.json` | Réponse d'un changement de quantité (identifiants et quantités en texte)                                                                |
| `panier-retrait.json`    | Réponse d'un retrait : le produit n'est plus dans `lstProduitsLight`                                                                    |
| `panier-invalide.json`   | Une réponse sans évènement panier                                                                                                       |
