---
name: repas-designer
description: Designer de Repas : thèmes saisonniers (Halloween, Noël, les suivants), illustrations plates façon Duolingo, décor de fond, ornement de coin, icônes d'accueil et d'états vides, maquettes Claude Design. À utiliser pour créer ou retoucher une saison, dessiner ou placer une illustration, ou dès que « ça fait vide » dans l'interface ; à lire en plus de `repas-front-dev` et `repas-po`.
---

# Repas : designer

Le front (`kcharignon/repas-front`) est un site et une application pour des proches non techniques, surtout sur téléphone. Le décor doit **donner du plaisir sans jamais gêner** : lisible d'abord, joli ensuite, discret toujours. Ce skill dit comment on dessine, où on pose, et comment on livre une saison.

À lire d'abord : `CLAUDE.md` du front, `docs/adr/0010-theme-saisonnier-halloween.md`, `docs/adr/0011-theme-saisonnier-noel.md`, `docs/adr/0012-illustrations-de-saison.md`, `src/design/theme.css`, `src/design/season.ts`, puis le skill `repas-po` (voix du produit : tutoiement, textes courts).

## 1. Le principe : un « pack de saison »

Chaque saison livre le MÊME ensemble, jamais un morceau :

| Pièce | Rôle | Où | Composant |
|---|---|---|---|
| Palette | couleurs de la saison, clair et sombre | `theme.css`, trois blocs par saison | jetons `--primary`, `--accent`, `--brand`… |
| Ornement de coin | une pièce de décor **toujours visible**, en haut à droite, sur tous les écrans (Halloween : la toile d'araignée et son araignée ; Noël : la guirlande lumineuse et sa boule) | superposé à l'application, ne capte aucun geste ; le contenu passe devant ses traits | `SeasonCorner` |
| Scène de fond | une grande illustration (Halloween : le manoir, la lune, les citrouilles), très douce, ancrée en bas, derrière le contenu | calque fixe sous les cartes | `SeasonScene` |
| Héros | la grande illustration du bandeau de connexion et d'inscription (Halloween : la sorcière et son chaudron) | `AuthLayout` | `SeasonArt` |
| Illustrations d'accueil | petites et moyennes pièces posées « à certains endroits » : états vides, titres des vues principales, vignette d'une recette sans photo, 404, hors-ligne, erreur de chargement, motif du menu latéral | voir § 4 | `SeasonArt`, `SeasonEmpty`, `LoadError` |
| Phrase du bandeau | une ligne de la voix du produit | i18n `auth.pitch<Saison>` | |
| Interrupteur | « Décor d'Halloween », « Décor de Noël », dans Moi, visible seulement en saison ; préférence par saison | `AccountView` | |
| Barre du navigateur | `theme-color` de la saison | `season.ts`, `theme-init.js` | |

Une saison sans ornement de coin, sans scène et sans illustrations d'accueil n'est pas finie : l'interface « fait vide ».

## 2. Mécanique (ne pas la réinventer)

- `<html data-season="halloween|noel">`, posé par `public/theme-init.js` AVANT le premier affichage (la CSP interdit les scripts en ligne) puis par `applySeason()` / `useSeasonStore` ; réévalué quand l'onglet redevient visible et à chaque minuit local (`followSeason`). Les deux implémentations de la règle de dates sont gardées d'accord par un test qui parcourt tous les jours de l'année.
- Règle de dates : jours locaux de l'appareil, l'année ne compte pas, la période peut enjamber le nouvel an. Deux saisons ne se chevauchent jamais.
- Palette : trois blocs après les blocs de base de `theme.css`, dans cet ordre (clair ; sombre selon le système avec `:not([data-theme='light'])` ; sombre forcé). Ce qu'une saison ne redéfinit pas reste celui du thème de base. `seasonContrast.spec.ts` impose le contraste AA (4,5:1) de chaque paire texte/fond.
- L'accent (citrouille, or…) **ne porte jamais de texte** : fonds, pastilles et illustrations seulement. Le danger reste un rouge distinct de toute couleur de fête.
- Préférence : `repas.season` = liste des saisons COUPÉES (`halloween,noel`), l'ancienne valeur `off` valant `halloween`. Couper une saison ne coupe pas la suivante.
- **Piège des tests** : la saison est active selon la vraie date. Vitest fige l'horloge au 15 juin 2026 (`src/__tests__/setup.ts`), Playwright installe une horloge hors saison (`e2e/support/test.ts`, `IN_SEASON` / `OFF_SEASON`). Tout test de saison fixe sa date explicitement.
- Le manifeste PWA et la barre système d'Android restent ceux du thème de base (limite connue).

## 3. Style des illustrations : plat, rond, joyeux (façon Duolingo)

Règles de dessin (SVG à la main, jamais de bitmap) :
- **Aplats seulement** : pas de dégradé, pas d'ombre portée floue, pas de contour. Le volume vient d'UN ton plus sombre posé sur un côté (toujours le même côté : en bas à droite) et d'UNE tache de lumière.
- **Formes rondes et épaisses**, angles adoucis (`stroke-linejoin="round"` sur les petits triangles), proportions de dessin animé : grosse tête, petit corps.
- **Personnages avec de grands yeux** (blanc, pupille sombre, un point de lumière), joues roses, sourire simple. Gentil, jamais effrayant : l'application est faite pour des proches de tous âges.
- **5 ou 6 couleurs par pièce**, prises dans la palette de la saison (§ 6). Une ombre de contact (ellipse sombre à 16 % d'opacité) sous les pièces posées.
- **Jamais de texte dans une illustration.** Les noms de choses sont dans l'i18n.
- Lisible sur fond clair ET sombre : vérifier chaque pièce sur les deux (planche de contact, § 7). Les pièces très sombres (chat, araignée, chauve-souris) reçoivent un violet plus clair que le fond sombre de l'application.
- Format : `viewBox` carré `0 0 120 120` pour une icône, `0 0 120 80` à l'horizontale, `0 0 280 220` pour une scène de personnage, `0 0 400 240` pour une scène de fond ancrée en bas. Poids : une icône sous 2 Ko, une scène sous 6 Ko. Pas d'`id` (collisions entre pièces inlinées), pas de `<style>`, pas de `<image>`.
- Le trait fin (toile, fils) utilise `currentColor` : la couleur vient du composant (`text-ink/40`), donc le clair et le sombre suivent.
- Les sources sont des fichiers `.svg` dans `src/design/season/art/<saison>/<nom>.svg` ; le nom dit la chose (`pumpkin`, `ghost`, `witch`), jamais l'emplacement.

## 4. Où poser quoi

Décor ≠ bruit. Poser avec mesure :
- **Ornement de coin** : un seul, fixe, en haut à droite, 120 à 160 px selon l'écran, `pointer-events: none`, aria-hidden, opacité douce (le trait à 40-45 %), décalé sous la zone sûre de l'écran (`env(safe-area-inset-top)`). Il ne doit jamais empêcher de lire ni de toucher un bouton : tester sur chaque écran qui a une action en haut à droite.
- **Scène de fond** : calque `fixed`, ancré en bas, derrière tout ; les cartes et la barre du bas restent opaques et passent devant. Elle se voit là où l'écran est vide (liste vide, Moi, connexion), pas derrière du texte. Opacité réglée par jeton (`--scene-opacity`), **assez basse pour que `ink` et `muted` gardent 4,5:1 sur le pire pixel de la scène** (un test le calcule sur les couleurs du fichier). Aucune animation.
- **Héros** (connexion, inscription, mot de passe oublié…) : l'illustration la plus riche. Sur téléphone le bandeau est court : le bouton de connexion reste visible à 360×640.
- **États vides** : une illustration de 120 à 180 px au-dessus de la phrase. Une pièce par situation (liste vide : la sorcière au chaudron ; aucune recette : la citrouille ; recherche sans résultat : le fantôme ; hors-ligne : la chauve-souris ; page introuvable : le fantôme ; erreur : l'araignée).
- **Titres des vues principales** (Ma liste, Recettes, Rayons, Moi) : une petite pièce de 32 à 40 px à côté du titre, jamais plus d'une par écran.
- **Vignette d'une recette sans photo** : une pièce de la saison à la place du gris.
- Jamais : dans un champ de formulaire, un bouton, un dialogue de confirmation, un message d'erreur de saisie, ni sur la case à cocher d'une ligne de liste. Jamais deux grandes pièces sur le même écran de téléphone. Rien ne bouge (pas de neige qui tombe, pas de chauve-souris qui vole) : `prefers-reduced-motion` ne devrait même pas avoir à intervenir.
- Toute pièce est décorative : `aria-hidden="true"`, `focusable="false"`, pas de `title`. L'information passe par le texte, jamais par l'image.

## 5. Mise en œuvre

- `SeasonArt` (`name` = un EMPLACEMENT de `src/design/season/art/index.ts`, jamais un nom de pièce ; classes de taille par le parent) rend l'illustration de la saison ACTIVE, ou rien (son slot est un repli) ; `SeasonCorner` et `SeasonScene` sont montés une fois dans `App.vue` (le contenu est au-dessus du coin, `z-10`, la scène est derrière tout, `-z-10`) ; `SeasonEmpty` pose une illustration au-dessus d'une phrase d'état vide, `LoadError` au-dessus de l'alerte d'erreur de chargement. Les fichiers sont chargés **à la demande** (`import.meta.glob` non immédiat, `?raw`) : hors saison, aucun octet de décor n'est téléchargé, pas même par le service worker (`globIgnores` + `CacheFirst` sur `assets/season/`, `vite.config.ts` ; hors ligne, une pièce jamais vue est absente, ce qui ne casse rien).
- Une saison ajoute ses fichiers dans `art/<saison>/`, sa table dans `PACKS` (tous les emplacements de `SLOTS`, pas la même pièce deux fois sur un écran : `art.spec.ts`), son opacité `--scene-opacity` dans les trois blocs de `theme.css` (réglée par le test de contraste de la scène de `seasonContrast.spec.ts`) et, si elle a un héros plus lourd que 3 Ko, reste sous 6 Ko (scène : 8 Ko).
- Pas de nouvelle dépendance pour les SVG. Le contenu injecté vient de nos fichiers versionnés, jamais d'une donnée utilisateur (la CSP reste stricte).
- Aucun composant de vue ne connaît le nom d'une saison ni d'une pièce.
- Les conteneurs qui peignent un fond opaque sur toute la page (`bg-bg` de la racine) laissent passer la scène : le fond de la page est celui de `html`.
- Les captures se font avec le script de la planche (`scripts/sheet.mjs`) pour les pièces, et avec Playwright (horloge installée en saison) pour les écrans.

## 6. Palettes d'illustration

Halloween : violets `#5a2d8c` `#43206b` `#2d1850` `#7a4cb0` `#b48cf2`, citrouille `#f58a1f` `#d96d0a` `#ffb25c`, lune `#f9d98a` `#f2c96e`, lumière `#ffd35c`, potion `#7ed957` `#4fb54a` `#b6f08a`, peau de sorcière `#a5e072`, fantôme `#ffffff` `#e1d6f3`, chat `#4a3a70` `#5b4a86`, joues `#ff9fbd`, bois `#8a5a2b`.
Noël : sapin `#17573a` et vert clair, bordeaux `#7a1530`, or `#e9a92a` `#f9d98a`, neige `#ffffff` `#dfeaf0`, nuit `#0b1520` `#122030`, rouge de fête distinct du rouge de danger, bois `#8a5a2b`, joues `#ff9fbd`.
Une nouvelle saison pose sa palette ici (5 à 8 couleurs) AVANT de dessiner.

## 7. Méthode de travail

1. **Maquette Claude Design** d'abord (type d'artefact « Design », `quickstart` avec `intent: design`) : système (palettes et contrastes), connexion bureau, liste claire et sombre, un état vide. Se critiquer (le danger se distingue-t-il ? le décor couvre-t-il un texte ? le bouton reste-t-il visible à 360×640 ?).
2. **Dessiner** les SVG, puis une **planche de contact** (`scripts/sheet.mjs`, rendue avec Playwright, fond clair ET sombre) et la LIRE. Corriger ce qui est laid, illisible ou invisible sur l'un des fonds.
3. **Intégrer** (§ 5), écrire les tests : dates frontières, préférence, contrastes (palette ET scène), décor absent hors saison, `SeasonArt` qui rend rien sans saison.
4. **Captures** réelles hors dépôt, horloge installée en saison : connexion 360×640, 390×844 et 1280×800 en clair et en sombre, Moi, liste vide, liste pleine, recettes, une recette sans photo, 404 ; plus une capture hors saison. Les lire. Vérifier que l'ornement de coin ne recouvre aucune action.
5. **Livrer** : ADR (ou amendement) neutre, PR sobre, CI verte, fusion par l'assistant principal, release du site créée par lui, déploiement approuvé par le propriétaire. Aucune release n'est promise avant la date de début de la saison, mais elle doit sortir assez tôt pour couvrir la saison entière.

## 8. Ajouter une saison (liste de contrôle)

- [ ] Dates (règle locale, test des frontières, test d'accord avec `theme-init.js` sur toute l'année).
- [ ] Palette (§ 6) puis trois blocs `theme.css`, contrastes AA, `--brand`, `theme-color`.
- [ ] Ornement de coin, scène, héros, 6 à 10 pièces d'accueil (§ 3), planche de contact claire et sombre.
- [ ] Phrase du bandeau et libellé de l'interrupteur (i18n, tutoiement, une ligne).
- [ ] Préférence par saison et son test.
- [ ] Aperçu administrateur (ADR 0013) : la pastille vient de `SEASONS`, ajouter seulement la clé `season.name.<saison>` dans `src/i18n/fr.ts` (`seasonPreview.spec.ts` l'exige).
- [ ] Emplacements (§ 4) : états vides, titres, vignette sans photo, 404, hors-ligne.
- [ ] Tests (vitest et e2e avec horloge explicite), captures lues, ADR, `CLAUDE.md`, ce skill (palette § 6).
- [ ] Release du site assez tôt avant le début de la saison.

## 9. Ce que ce skill ne décide pas

Le contenu et les textes de l'application (voir `repas-po`), le thème de base « Basilic & safran » (changer la marque est une décision du propriétaire), et les dates d'une saison nouvelle (à lui de les donner). Une saison nouvelle est proposée au propriétaire avant d'être construite.
