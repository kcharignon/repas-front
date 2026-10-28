# 0011 — Thème saisonnier « Houx & neige » (Noël)

- **Statut** : Accepted
- **Date** : 2026-10-28
- **Liens** : [0010](0010-theme-saisonnier-halloween.md), [0003](0003-design-system-basilic-et-safran.md)

## Contexte

L'ADR 0010 a posé un thème saisonnier qui s'active seul à Halloween. Même principe pour la fin d'année : un second thème, sur le même
mécanisme, sans rien changer aux gestes ni à la mise en page.

## Décision

1. **Dates** : du 15 novembre au 5 janvier inclus, jour **local** de l'appareil (de 00:00:00 le 15 novembre à 23:59:59 le 5 janvier),
   chaque année ; la période enjambe le nouvel an et l'année ne compte pas. Règle : `isNoelSeason()` (`src/design/season.ts`),
   reprise à l'identique par `public/theme-init.js` :
   `(mois = novembre et jour ≥ 15) ou mois = décembre ou (mois = janvier et jour ≤ 5)`. Hors période et hors Halloween (15 octobre au
   1er novembre), le thème de base est inchangé. Les deux saisons ne se chevauchent jamais : `currentSeason()` rend `halloween`,
   `noel` ou rien.
2. **Mécanisme** : celui de l'ADR 0010, sans copie. `data-season` vaut `halloween`, `noel` ou est absent ; `applySeason()`,
   `useSeasonStore()` (`season`, `active`, `activeSeason`, `enabled`) et `followSeason()` restent les seuls outils. La couleur de
   `<meta name="theme-color">` dépend de la saison : `#7a1530` (bordeaux) à Noël, `#43206b` à Halloween, `#1E6B4C` hors saison.
3. **Jetons** (`src/design/theme.css`) : trois blocs `:root[data-season='noel']` (clair, sombre du système, sombre forcé « nuit de
   Noël »), placés après ceux d'Halloween et dans le même ordre. Nouveau jeton **`--star`** (`text`-jamais : décor seulement), à côté de
   `--moon`. L'or (`--accent`) ne porte **jamais** de texte, de liseré ni de trait : seulement des fonds avec `--on-accent` (le test
   de l'ADR 0010 couvre déjà ce cas). Le danger reste un rouge distinct du bordeaux du bandeau (`--brand`). L'avertissement
   (`--warning-soft`, `--on-warning-soft`) reste celui du thème de base.
4. **Contrastes** : `seasonContrast.spec.ts` rejoue les mêmes paires, 4,5:1 au moins, sur les trois blocs de chaque saison.
5. **Motifs** : `ChristmasDecor.vue`, décoratif (`aria-hidden`, sans événement, sans animation), jamais derrière du texte courant :
   des flocons au trait, une étoile dorée et une rangée de petits sapins dans le bandeau de connexion, un flocon dans l'angle du menu
   latéral du bureau. Rien sur les listes, les recettes, les formulaires ni la navigation du téléphone. `SeasonDecor.vue` pose le
   décor de la saison active ; chaque décor se tait hors de sa saison.
6. **Texte** : `auth.pitchNoel` (« Tes recettes, tes courses, sans oublier la bûche. ») remplace `auth.pitch` sur la connexion, en
   saison seulement.
7. **Interrupteur** : celui de l'ADR 0010, dont le libellé suit la saison (`season.halloween` « Décor d’Halloween », `season.noel`
   « Décor de Noël »).
8. **Préférence par saison** : couper Halloween ne coupe pas Noël. La clé `repas.season` contient la liste, séparée par des virgules,
   des saisons **coupées** (`noel`, `halloween,noel`) ; absente ou illisible, tout est activé. L'ancienne valeur `off` (écrite par la
   version d'Halloween seule) est lue comme `halloween`. Une préférence coupée est conservée hors saison : elle revient l'année
   suivante.
9. **Tests** : mêmes règles que l'ADR 0010 (horloge hors saison par défaut, chaque test de saison pose sa date). Un test compare le
   script d'amorçage et `applySeason()` pour chaque jour de 2028 (bissextile) et de 2029, avec chaque forme de la préférence.

## Conséquences

- Positives : aucune action de l'utilisateur, rien ne change hors saison, une troisième saison n'ajoutera qu'une règle de dates, un
  jeu de jetons et un décor.
- Négatives / limites connues : comme pour l'ADR 0010, le `theme_color` du manifeste reste vert et la barre système de l'application
  Android ne change pas ; l'horloge de l'appareil décide ; deux règles de dates (TypeScript et script d'amorçage) à garder d'accord,
  ce que le test fait.

## Alternatives écartées

- Un thème « d'hiver » sur toute la saison froide : il ne dit pas la fête, et les dates seraient arbitraires.
- Un seul interrupteur « décor saisonnier » pour toutes les saisons : couper Halloween couperait Noël, que l'utilisateur n'a pas encore vu.
- Dupliquer le mécanisme de saison : la généralisation de `season.ts` suffit.
