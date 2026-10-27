# 0010 — Thème saisonnier « Citrouille & nuit » (Halloween)

- **Statut** : Accepted
- **Date** : 2026-10-27
- **Liens** : [0003](0003-design-system-basilic-et-safran.md)

## Contexte

Le thème « Basilic & safran » (ADR 0003) est le seul. Chaque année, autour d'Halloween, l'application prend un air de saison, sans que
personne ait rien à faire et sans rien changer aux gestes ni à la mise en page.

## Décision

1. **Dates** : du 15 octobre au 1er novembre inclus, jour **local** de l'appareil (de 00:00:00 le 15 octobre à 23:59:59 le 1er novembre),
   chaque année ; le 2 novembre l'application redevient « Basilic & safran ». L'année ne compte pas. Règle : `isHalloweenSeason()`
   (`src/design/season.ts`), reprise à l'identique par `public/theme-init.js` ; un test garde les deux d'accord.
2. **Mécanisme** : `data-season="halloween"` sur `<html>`, posé avant le premier affichage par `theme-init.js` (pas d'éclair du mauvais
   thème) puis par `applySeason()` au démarrage. Une application laissée ouverte change de thème sans rechargement : la saison est
   réévaluée quand l'onglet redevient visible et à chaque minuit local. `<meta name="theme-color">` passe à `#43206b` en saison.
3. **Jetons** (`src/design/theme.css`) : trois blocs `:root[data-season='halloween']` (clair, sombre du système, sombre forcé) placés
   **après** ceux du thème de base, dans cet ordre (à égalité de spécificité le dernier gagne). Le clair, le sombre et « Système »
   restent respectés. Nouveau jeton **`--brand`** (`bg-brand`) pour le bandeau de connexion et la pastille du logo : le vert d'avant par
   défaut, violet nuit en Halloween. La citrouille (`--accent`) ne porte **jamais** de texte, de liseré ni de trait (2,2:1 sur le fond
   clair) : seulement des fonds avec `--on-accent`. Le danger reste un rouge ou un corail.
4. **Contrastes** : `seasonContrast.spec.ts` lit la feuille de style et exige 4,5:1 (WCAG AA) sur les paires de texte, en clair et en sombre.
5. **Motifs** : SVG en ligne (`HalloweenDecor.vue`), décoratifs (`aria-hidden`, sans événement), sans animation, jamais derrière du texte
   courant : une toile, une lune et deux chauves-souris dans le bandeau de connexion, une toile dans l'angle du menu latéral du bureau.
   Rien sur les listes, les recettes, les formulaires ni la navigation du téléphone.
6. **Texte** : une phrase (`auth.pitchHalloween`) à la place de `auth.pitch` sur la connexion, en saison seulement.
7. **Interrupteur** « Décor d'Halloween » (`season.halloween`) dans « Moi », sous le choix du thème, **visible en saison seulement**,
   activé par défaut. Coupé, jamais de thème saisonnier : préférence `localStorage` `repas.season` = `off` (absente = activé ; conservée
   hors saison, elle revient l'année suivante).
8. **Tests indépendants de la date** : la suite ne doit jamais dépendre du jour où elle tourne. Vitest décale l'horloge au 15 juin 2026
   (`src/__tests__/setup.ts`, la date avance toujours) ; Playwright installe `page.clock` hors saison par défaut (`e2e/support/test.ts`,
   dont les specs importent `test`). Un test de saison pose sa date (`vi.setSystemTime`, `page.clock.setSystemTime(IN_SEASON)`).
   Aucun test n'écrit « aujourd'hui » en dur.

## Conséquences

- Positives : aucune action de l'utilisateur, rien ne change hors saison, le thème est un simple jeu de jetons que l'on peut
  reproduire pour une autre saison.
- Négatives / limites connues : le `theme_color` du manifeste (`vite.config.ts`) reste vert, et la barre système de l'application
  Android (`android/`) ne change pas ; l'horloge de l'appareil décide (un appareil mal réglé change de thème au mauvais jour) ; deux
  règles de dates (TypeScript et script d'amorçage) à garder d'accord, ce que le test fait.

## Alternatives écartées

- Une préférence « thème » de plus à choisir : contraire à la simplicité voulue (le thème s'active seul).
- Piloter la saison par le back : une requête de plus au démarrage pour une décision purement visuelle.
