# Décisions d'architecture du front

| ADR | Titre | Statut |
|---|---|---|
| [0001](0001-stack-du-front.md) | Stack, outillage et qualité du front | Accepted |
| [0002](0002-sdk-genere-depuis-le-contrat-openapi.md) | SDK typé généré depuis le contrat OpenAPI du back | Accepted |
| [0003](0003-design-system-basilic-et-safran.md) | Design système « Basilic & safran » : Tailwind, Reka UI, jetons CSS | Accepted |
| [0004](0004-front-dans-docker.md) | Le front tourne dans Docker, branché sur le back de développement | Accepted |
| [0005](0005-session-du-front.md) | Session du front : jeton en mémoire, refresh par cookie, garde de routes | Accepted |
| [0006](0006-pwa-et-lecture-hors-ligne.md) | PWA : application installable et liste en cours lisible hors-ligne | Accepted |
| [0007](0007-deploiement-par-release.md) | Déploiement : une release GitHub publie l'image et la met en production | Accepted |
| [0008](0008-envoi-de-la-liste-au-drive.md) | Envoi de la liste de courses au drive : application Android, pont natif, agent embarqué | Accepted |
| [0009](0009-mise-a-jour-de-l-application.md) | L'application Android se met à jour elle-même (variante hors Google Play), page `/installer` | Accepted |
| [0010](0010-theme-saisonnier-halloween.md) | Thème saisonnier « Citrouille & nuit » (Halloween), du 15 octobre au 1er novembre | Accepted |
| [0011](0011-theme-saisonnier-noel.md) | Thème saisonnier « Houx & neige » (Noël), du 15 novembre au 5 janvier | Accepted |
| [0012](0012-illustrations-de-saison.md) | Illustrations de saison : coin, scène de fond, héros et pièces d'accueil (pack de saison) | Accepted |
| [0013](0013-apercu-des-themes-par-l-administrateur.md) | Aperçu des thèmes par l'administrateur : en mémoire, jamais écrit, effacé en quittant la page | Accepted |
| [0014](0014-theme-saisonnier-paques-et-registre-de-saisons.md) | Thème saisonnier « Prairie & œufs » (Pâques, date calculée) et registre de saisons | Accepted |
| [0015](0015-themes-de-la-galette-et-de-la-saint-valentin.md) | Thèmes « Or & bleu roi » (galette et crêpes, 6 janvier au 2 février) et « Rose & cœur » (Saint-Valentin, 7 au 14 février) | Accepted |
| [0016](0016-themes-de-l-ete-et-de-l-automne.md) | Thèmes « Soleil & mer » (été, 21 juin au 31 août) et « Forêt & feuilles » (automne, 1er septembre au 14 octobre) | Accepted |
| [0017](0017-recettes-des-autres-par-categorie-et-recherche.md) | Recettes des autres : sections par catégorie, recherche par nom (liste simple par pertinence) | Accepted |

Une décision nouvelle = un nouvel ADR (numéro suivant) dans le même commit que le code qui l'applique.
