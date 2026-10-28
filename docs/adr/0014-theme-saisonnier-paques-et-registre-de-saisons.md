# 0014 — Thème saisonnier « Prairie & œufs » (Pâques) et registre de saisons

- **Statut** : Accepted
- **Date** : 2026-10-28
- **Liens** : [0010](0010-theme-saisonnier-halloween.md), [0011](0011-theme-saisonnier-noel.md), [0012](0012-illustrations-de-saison.md), [0013](0013-apercu-des-themes-par-l-administrateur.md)

## Contexte

Halloween et Noël ont des dates fixes, écrites chacune dans une fonction de `season.ts` et recopiées dans `public/theme-init.js`, avec
un type `Season` énuméré à la main. D'autres fêtes sont prévues : l'une d'elles, Pâques, **se déplace** (entre le 22 mars et le
25 avril) et ne tient donc pas dans une règle « mois et jour ». Chaque saison étant un pack complet (palette, coin, scène, héros,
pièces d'accueil, phrase, interrupteur), ajouter la suivante ne doit demander que des données.

## Décision

1. **Un registre de saisons** : `season.ts` porte une liste ordonnée de définitions `{ key, color, includes(date) }` (clé de
   `data-season`, couleur de la barre du navigateur, règle de dates). `Season`, `SEASONS`, `currentSeason()`, `seasonIncludes()`, la
   couleur posée par `paint()` en dérivent. `public/theme-init.js` porte le tableau équivalent (le script de démarrage ne peut rien
   importer). Ajouter une saison = une entrée dans chaque registre, ses fichiers (`art/<clé>/`), ses blocs de `theme.css` et ses
   libellés. L'API publique (`isHalloweenSeason`, `isNoelSeason`, `applySeason`, `useSeasonStore`, `followSeason`, aperçu de
   l'administrateur) ne change pas.
2. **L'ordre de `SEASONS` est celui de l'année** (aujourd'hui `paques`, `halloween`, `noel`) : c'est l'ordre des pastilles de l'aperçu
   et celui dans lequel la préférence `repas.season` (liste des saisons coupées) est écrite. L'ancienne valeur `off` reste lue comme
   `halloween`.
3. **Pâques** (`data-season="paques"`, « Prairie & œufs », clair prairie, sombre chocolat, bandeau violet `#6a50b0`) : du dimanche de
   Pâques moins 21 jours (00:00:00) au lundi de Pâques inclus (23:59:59), jour local de l'appareil, chaque année. La date de Pâques
   est **calculée** (calendrier grégorien, algorithme de Meeus, Jones et Butcher, JavaScript pur, sans dépendance) dans
   `easterSunday()`, et recopiée dans `theme-init.js`. Les bornes sont reconstruites par `new Date(année, mois, jour ± n)`, jamais en
   ajoutant des millisecondes (un changement d'heure décalerait la borne). La fenêtre tient dans l'année civile : du 1er mars au
   26 avril au plus.
4. **Aucun chevauchement** : Pâques se termine au plus tard le 26 avril, Halloween commence le 15 octobre. Un test parcourt tous les
   jours de 2024 à 2040 et vérifie qu'au plus une saison est vraie, et que `season.ts` et `theme-init.js` posent la même chose.
5. **Tests pilotés par une table** : une ligne de cas par saison (veille, premier jour, dernier jour, lendemain, plus des jours
   dedans et dehors) ; les tests d'accord des deux registres, de non-chevauchement et de couleurs sont génériques sur `SEASONS`.
6. **Le pack de Pâques** suit l'ADR 0012 : héros, coin, scène et onze pièces dans `art/paques/`, table `PACKS.paques`, `--scene-opacity`
   réglé par le test de contraste de la scène. Le jaune (`--accent`) ne porte jamais de texte ; le danger reste celui du thème de base.
   Le cache des illustrations du service worker passe de 40 à 120 entrées (une pièce par entrée, 14 par saison).

## Conséquences

- Positives : une saison nouvelle n'écrit que des données et ses fichiers ; une fête mobile se décrit par une fonction de dates, avec
  la même garantie d'accord entre l'application et le script de démarrage.
- Négatives / limites connues : la règle de dates existe en deux exemplaires (TypeScript et script de démarrage), gardés d'accord par
  un test mais pas par construction ; le calcul de Pâques est valable pour le calendrier grégorien (toute année utile).

## Alternatives écartées

- Un tableau de dates de Pâques écrit à la main : à rafraîchir chaque décennie, source d'oubli.
- Une dépendance de calcul de calendrier : poids pour une seule formule, et le script de démarrage ne pourrait pas l'importer.
- Générer `theme-init.js` depuis `season.ts` à la construction : plus de mécanique que de lignes à recopier, et le fichier doit rester
  lisible tel quel (CSP, aucun script en ligne).
