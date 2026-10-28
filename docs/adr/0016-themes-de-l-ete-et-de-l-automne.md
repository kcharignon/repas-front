# 0016 — Thèmes de l'été et de l'automne

- **Statut** : Accepted
- **Date** : 2026-10-28
- **Liens** : [0010](0010-theme-saisonnier-halloween.md), [0012](0012-illustrations-de-saison.md), [0013](0013-apercu-des-themes-par-l-administrateur.md), [0014](0014-theme-saisonnier-paques-et-registre-de-saisons.md), [0015](0015-themes-de-la-galette-et-de-la-saint-valentin.md)

## Contexte

Le registre de saisons (ADR 0014 et 0015) permet d'ajouter une saison en n'écrivant que des données. Deux saisons de la belle
saison s'ajoutent : l'été, puis l'automne, qui finit la veille d'Halloween. Avec elles, du 21 juin au 5 janvier l'année est couverte
sans trou ; il ne reste de thème de base que quelques semaines de fin d'hiver et de printemps.

## Décision

1. **Été** (`data-season="ete"`, « Soleil & mer », clair sable, sombre nuit de mer, bandeau orange brûlé `#b8460f`) : du 21 juin au
   31 août inclus, jour local de l'appareil, l'année ne compte pas.
2. **Automne** (`data-season="automne"`, « Forêt & feuilles », clair parchemin, sombre sous-bois, bandeau olive `#4d5a16`) : du
   1er septembre au 14 octobre inclus, jour local, l'année ne compte pas.
3. **Ordre de `SEASONS`** (chronologique) : `galette`, `valentin`, `paques`, `ete`, `automne`, `halloween`, `noel`. Les saisons ne se
   chevauchent jamais : l'été (21 juin) suit les Pâques les plus tardives (fin le 26 avril), l'automne suit l'été sans trou et
   finit le 14 octobre, la veille d'Halloween. Le thème de base ne revient plus
   qu'entre la fin de Pâques et le 20 juin, du 15 février au début de Pâques, et du 3 au 6 février.
4. **Un pack complet par saison** (ADR 0012) : héros, coin, scène et onze pièces dans `art/<clé>/`, table `PACKS.<clé>`,
   `--scene-opacity` réglé par le test de contraste de la scène. Les scènes n'ont ni soleil ni nuage : ils vivent dans le héros et le
   coin, car sur un téléphone la scène ne montre que sa zone centrale et un disque isolé y devient une tache. L'accent (soleil,
   orange) ne porte jamais de texte ; le danger reste le rouge du thème de base.
5. **Aucune mécanique nouvelle** : chaque saison est une entrée de `DEFINITIONS` et de `theme-init.js`, ses fichiers, ses blocs de
   `theme.css`, ses libellés et une ligne de la table de `season.spec.ts`. Les tests d'accord des deux registres, de
   non-chevauchement et de contraste sont génériques sur `SEASONS`.

## Conséquences

- Positives : deux saisons de plus sans changer le registre, les vues ni les tests génériques ; l'interrupteur « Décor de … » de
  « Moi » et l'aperçu de l'administrateur les proposent d'eux-mêmes.
- Négatives / limites connues : sept saisons de quatorze pièces (98 fichiers) tiennent dans le cache `season-art` du service worker
  (120 entrées) mais il n'y reste que vingt places pour une huitième saison ; les deux registres de dates restent en deux
  exemplaires, gardés d'accord par un test.

## Alternatives écartées

- Les quatre saisons météorologiques : le printemps recouvrirait Pâques et l'hiver Noël et la galette, qui ont déjà leur décor.
