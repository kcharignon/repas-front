# ADR 0021 : La page de présentation publique `/presentation`

Statut : Proposed (2026-11-04), demande du propriétaire : une seule page vitrine, à diffuser sur `kantin.eu/presentation`. Passe à Accepted quand il a validé les textes (voir « À valider »).

## Contexte

Repas n'avait aucune page qui le présente à quelqu'un qui ne le connaît pas : le site s'ouvre sur la connexion. Le propriétaire veut une page unique qui donne envie, à envoyer à un proche ou à poster sur un réseau.

Trois contraintes du site décident de la forme :

- **La politique de contenu du site est stricte** (`docker/Caddyfile`) : `script-src 'self'`, `style-src 'self'` (seuls les styles en attribut sont permis), `img-src 'self' data:`, `font-src 'self'`. Aucun CDN, aucune police ni image d'un autre site, aucun code en ligne.
- **L'application est une page unique** : toute adresse inconnue du serveur reçoit `index.html`, et le service worker (`navigateFallback`) fait de même pour un visiteur qui a installé l'application. Une route Vue `/presentation` serait rendue dans le navigateur : pas d'aperçu au partage (les robots de réseaux sociaux ne lisent que le HTML reçu), l'application entière chargée pour un texte, et la garde de connexion à contourner.
- **Repas ne mesure pas l'audience de ses pages** (`privacy.never.ads`, `/confidentialite`). La page le dit elle-même (« celle-ci comprise ») : tout traceur la rendrait fausse.

## Décision

1. **Une page statique**, dans `public/presentation/` : `index.html`, `presentation.css`, `presentation.js` (1 Ko : l'apparition douce des blocs, la page se lit entière sans lui), polices, images. Elle est copiée telle quelle dans `dist/`. Le Caddy du site réécrit `/presentation` et `/presentation/` vers `presentation/index.html` ; les fichiers du dossier sont servis comme tout fichier (revalidés, `Cache-Control: no-cache`).
2. **Le service worker l'ignore** : `globIgnores: ['presentation/**']` (rien n'est gardé dans le cache de chaque téléphone) et `/presentation` dans `navigateFallbackDenylist` (sinon l'application installée afficherait sa page d'erreur à la place).
3. **Rien d'un autre site.** Polices Bricolage Grotesque et Figtree (licence SIL OFL) copiées de `@fontsource-variable/*`, images en WebP locales, illustrations plates de l'application (`src/design/season/art/`), logo tiré de `logoGeometry.ts` (ADR 0020), aucune mesure d'audience. Aucun lien vers un autre site.
4. **La voix du produit** : tutoiement, phrases de 15 mots au plus, aucun point d'exclamation ni tiret cadratin, mots du glossaire (`principes-produit.md` du back), espace insécable avant « : » et « ? » et dans les guillemets. Un seul bouton principal, « Créer mon compte » (vers `/inscription`), en haut, au milieu et en bas.
5. **Chaque affirmation a sa source** : la politique de confidentialité (aucune publicité, aucune revente, aucun suivi, « Repas ne voit ni ton identifiant, ni ton mot de passe, ni ton panier »), le glossaire et le comportement testé (quantités, types de liste, lecture hors-ligne, recettes secrètes, ingrédients propres à chaque compte, estimation du coût avant l'envoi). Aucun témoignage ni chiffre d'usage inventé : la preuve est celle de la maison (« édité par Kantin, ses premiers utilisateurs sont ses proches »). Les limites sont dites (envoi au drive sur Android seulement, l'envoi automatique peut s'arrêter si le drive change son site).
6. **Ce que la page n'annonce pas** : l'assistant vocal (le skill n'est pas ouvert au public), l'iPhone pour l'envoi au drive, tout prix ou « gratuit » au-delà de « Repas ne coûte rien ».
7. **Les captures sont celles de l'interface réelle**, prises avec des données inventées (API simulée par `page.route`, comme les tests de bout en bout, aucun compte) à 390 × 844, en clair et en sombre, hors saison (thème de base). À refaire quand l'interface change nettement.
8. **Une exception assumée à « un nom d'enseigne passe par le registre »** (`retailers.ts`) : la page est statique et nomme Leclerc et Auchan en dur (section du drive, question sur le lien avec les enseignes, pied de page) avec la mention « Repas est indépendant de Leclerc et d'Auchan ».
9. **Un test garde le tout** (`src/__tests__/presentationPage.spec.ts`) : voix, mots du glossaire, politique de contenu, fichiers promis, image de partage 1200 × 630, métadonnées, titres, textes alternatifs, routage (service worker et Caddy).

## À valider par le propriétaire

- « Repas ne coûte rien » et « une adresse e-mail suffit » (promesse publique).
- La phrase de confiance du drive, reprise de la confidentialité : « Repas ne voit ni ton identifiant, ni ton mot de passe, ni ton panier » (le glossaire évite les rassurances dans le parcours ; sur une page de présentation elle sert la confiance).
- « Édité par Kantin ».
- Les noms Leclerc et Auchan sur une page publique.

## Conséquences

- `/presentation` n'est pas une route de l'application : elle ne figure pas dans `router/index.ts`, ne passe pas par `AppShell`, ne change pas avec la saison et ne la mentionne pas.
- Une nouvelle ressource de la page doit être un fichier du dossier (la politique de contenu bloque le reste) et passer le test ; changer le serveur du site ou le service worker impose de rejouer la vérification avec le vrai Caddyfile (`docker run caddy:2-alpine`, `dist/` monté, `/presentation` en 200 avec le HTML de la page, `/inexistant` toujours sur l'application).
- La page est dans l'image du site : elle part avec la prochaine release du front, déployée après l'approbation du propriétaire.
