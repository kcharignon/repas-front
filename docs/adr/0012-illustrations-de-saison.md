# 0012 — Illustrations de saison : le « pack de saison »

- **Statut** : Accepted
- **Date** : 2026-10-28
- **Liens** : [0010](0010-theme-saisonnier-halloween.md), [0011](0011-theme-saisonnier-noel.md), [0006](0006-pwa-et-lecture-hors-ligne.md)

## Contexte

Les thèmes d'Halloween et de Noël ne changeaient que les couleurs et un décor discret du bandeau de connexion : l'interface « faisait
vide » une fois connecté. Chaque saison livre désormais un pack d'illustrations complet, posé sur tous les écrans, sans que aucune
vue ne connaisse le nom d'une saison.

## Décision

1. **Un pack de saison** : pour chaque saison, des fichiers SVG dans `src/design/season/art/<saison>/<pièce>.svg` (dessinés à la
   main, plats, sans contour, sans dégradé, sans texte, sans `id`) et une table `emplacement → pièce` dans un seul module,
   `src/design/season/art/index.ts` (`PACKS`). Les emplacements sont sémantiques : `hero`, `corner`, `scene`, `aside`, `empty-list`,
   `empty-recipes`, `empty-search`, `offline`, `not-found`, `error`, `title-list`, `title-recipes`, `title-aisles`, `title-account`,
   `recipe-placeholder`. Une saison nouvelle ajoute ses fichiers et sa table, rien d'autre ; la méthode est dans le skill
   `repas-designer` (`.claude/skills/repas-designer/`).
2. **Composants génériques** (`src/design/season/`) :
   - `SeasonArt` (`name` = un emplacement) rend la pièce de la saison **active** (`useSeasonStore().activeSeason`) ou rien : hors
     saison, saison coupée ou emplacement inconnu. Décoratif : `aria-hidden`, `focusable="false"`, sans événement de souris, sans
     `title`. Le contenu par défaut (slot) ne sert que de repli quand la pièce n'est pas là.
   - `SeasonCorner` : l'ornement de coin, calque `fixed` en haut à droite (120 px sur téléphone, 160 px sur bureau, sous la zone sûre
     de l'écran), `pointer-events: none`, trait en `currentColor` (`text-ink/45`), posé une fois dans `App.vue` : il couvre tous les
     écrans. Le contenu de l'application (colonne de `AppShell`, formulaire de connexion, 404, confidentialité) est au-dessus de lui :
     ses traits ne passent jamais devant un texte ou un bouton, et il ne capte aucun geste. Sur le bandeau de connexion (de la couleur
     de la marque) il passe au clair sur téléphone (`cornerTone.ts`).
   - `SeasonScene` : la scène de fond, calque `fixed` ancré en bas, de profondeur négative (derrière tout), `pointer-events: none`,
     d'opacité `--scene-opacity` ; les cartes et la barre du bas, qui ont leur fond, restent opaques par-dessus. `AuthLayout` ne peint
     plus de fond plein page (celui de la page est celui de `<html>`).
   - `SeasonEmpty` (illustration de 128 à 160 px au-dessus de la phrase d'un état vide) et `LoadError` (la pièce `error` au-dessus de
     l'alerte « injoignable »).
3. **Où poser quoi** : le héros (`hero`) dans le bandeau de connexion, à droite sur téléphone (le bandeau reste court, le bouton
   « Se connecter » reste visible à 360 × 640) et sous la phrase sur bureau ; une pièce de 36 à 40 px à côté du titre de Ma liste,
   Recettes, Rayons et Moi (une seule par écran) ; une illustration dans chaque état vide, la 404, l'erreur de chargement et le
   bandeau hors connexion (qui garde son icône si la pièce n'est pas disponible) ; la fiche d'une recette, qui n'a pas de photo,
   reçoit `recipe-placeholder` ; un motif discret dans le menu latéral du bureau (`aside`). Jamais dans un champ, un bouton, un
   dialogue de confirmation ni une case à cocher ; jamais la même pièce deux fois sur un écran (`art.spec.ts` le garde pour les
   emplacements qui se retrouvent ensemble) ; rien n'est animé.
4. **Chargement à la demande** : chaque pièce est un module à part (`import.meta.glob('./*/*.svg', { query: '?raw', import: 'default' })`,
   non immédiat). Hors saison ou décor coupé, aucun octet de décor n'est téléchargé. Le contenu est injecté par `v-html` : il vient
   de nos fichiers versionnés, jamais d'une donnée de l'utilisateur (la CSP reste stricte).
5. **Contrastes de la scène** : `--scene-opacity` est un jeton par saison et par mode (Halloween 0,16 clair, 0,2 sombre ; Noël 0,15
   clair, 0,17 sombre). `seasonContrast.spec.ts` prend chaque couleur du fichier de scène, la mélange avec `--bg` à cette opacité et
   exige que `ink` et `muted` y gardent 4,5:1 : le pire pixel possible, sans exception.
6. **Interrupteur** : « Décor d'Halloween » / « Décor de Noël » (ADR 0010, 0011) coupe tout : coin, scène, héros et pièces. L'interface
   revient alors au thème de base, sans aucune illustration chargée.

## Limites

- Les illustrations sont des SVG ; les bitmaps sont exclus (poids, CSP, nettoyage de la liste de ressources). Une pièce pèse moins de
  3 Ko, un héros moins de 6 Ko, une scène moins de 8 Ko (`art.spec.ts`).
- Rien n'est animé : `prefers-reduced-motion` n'a pas à intervenir.
- **Hors connexion (PWA, ADR 0006)** : les pièces sont chargées à la demande, donc **absentes hors connexion tant qu'elles n'ont pas
  été vues une fois en ligne**. Le service worker ne les précharge pas (`globIgnores: **/assets/season/**`, sinon il téléchargerait
  les deux saisons en dehors de toute saison) ; il les garde à la première vue (`CacheFirst`, cache `season-art`). Une pièce
  manquante ne casse rien : `SeasonArt` ne rend rien (ou son repli) et n'affiche jamais d'erreur.
- Le manifeste PWA et la barre système d'Android restent ceux du thème de base.
