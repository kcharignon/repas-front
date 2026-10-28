# 0015 — Thèmes de la galette et de la Saint-Valentin

- **Statut** : Accepted
- **Date** : 2026-10-28
- **Liens** : [0010](0010-theme-saisonnier-halloween.md), [0011](0011-theme-saisonnier-noel.md), [0012](0012-illustrations-de-saison.md), [0013](0013-apercu-des-themes-par-l-administrateur.md), [0014](0014-theme-saisonnier-paques-et-registre-de-saisons.md)

## Contexte

Le registre de saisons de l'ADR 0014 doit permettre d'ajouter une fête en n'écrivant que des données. Deux fêtes de début d'année
s'ajoutent : la galette des rois et les crêpes (de l'Épiphanie à la Chandeleur), puis la Saint-Valentin. Elles se suivent sans trou ni
chevauchement et suivent immédiatement Noël, qui finit le 5 janvier.

## Décision

1. **Galette & crêpes** (`data-season="galette"`, « Or & bleu roi », clair crème, sombre indigo, bandeau bleu roi `#223b86`) : du
   6 janvier au 2 février inclus, jour local de l'appareil, l'année ne compte pas.
2. **Saint-Valentin** (`data-season="valentin"`, « Rose & cœur », clair blush, sombre vin, bandeau rose `#a8326a`) : du 7 au
   14 février inclus, jour local, l'année ne compte pas (le 29 février n'est dans aucune des deux).
3. **Ordre de `SEASONS`** (chronologique) : `galette`, `valentin`, `paques`, `halloween`, `noel`. C'est l'ordre des pastilles de
   l'aperçu et celui de la préférence écrite. Les saisons ne se chevauchent jamais : Noël finit le 5 janvier, la galette court
   jusqu'au 2 février, la Saint-Valentin commence le 7 février (le 3 au 6 février : thème de base),
   et Pâques ne commence jamais avant le 1er mars.
4. **Un pack complet par saison** (ADR 0012) : héros, coin, scène et onze pièces dans `art/<clé>/`, table `PACKS.<clé>`,
   `--scene-opacity` réglé par le test de contraste de la scène. L'or de la galette et le rose clair de la Saint-Valentin
   (`--accent`) ne portent jamais de texte ; le danger reste le rouge du thème de base, distinct du rose du décor.
5. **Aucune mécanique nouvelle** : chaque saison est une entrée de `DEFINITIONS` et de `theme-init.js`, ses fichiers, ses blocs de
   `theme.css`, ses libellés (`auth.pitch<X>`, `season.<clé>`, `season.name.<clé>`) et une ligne de la table de `season.spec.ts`.
   Les tests d'accord des deux registres, de non-chevauchement et de contraste sont génériques sur `SEASONS`.

## Conséquences

- Positives : deux saisons de plus sans changer le registre, les vues ni les tests génériques ; l'interrupteur « Décor de … » de
  « Moi » et l'aperçu de l'administrateur les proposent d'eux-mêmes.
- Négatives / limites connues : sept saisons à terme (14 pièces chacune) dans le cache `season-art` du service worker (120 entrées,
  assez pour 8 saisons) ; les deux registres de dates restent en deux exemplaires, gardés d'accord par un test.

## Alternatives écartées

- Une seule saison « hiver » du 6 janvier au 14 février : deux fêtes, deux ambiances (crêpes et galette, puis romantique), et deux
  interrupteurs distincts pour que l'on puisse couper l'une sans l'autre.
