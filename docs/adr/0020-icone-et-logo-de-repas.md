# ADR 0020 : L'icône et le logo de Repas

Statut : Accepted (2026-11-04), décision du propriétaire après plusieurs planches de propositions. Référence détaillée : `docs/logo/README.md`.

## Contexte

L'application Android montrait une feuille de basilic, alors que le site, les courriels et la marque montraient une assiette avec une coche, une fourchette et une cuillère. Le propriétaire a tenu l'écart pour un défaut (livré en version patch). Les deux dessins ne venaient pas d'une même source : l'icône du site était une image bitmap sans source, le décor Android un dessin à part.

## Décision

1. **Une icône pour tout** : l'anneau-horloge. Anneau d'assiette, coche dont le sommet est au centre de l'assiette (ses branches sont des aiguilles), deux lignes de liste, fourchette à gauche, couteau de table à droite (dos droit, tranchant vers l'assiette). Fond vert basilic, coche safran, le reste blanc.
2. **Un logo** : le dessin et le mot « Repas » en Playfair Display Bold. **Empilé par défaut ; horizontal quand la hauteur libre est sous 88 px** (en-tête, téléphone). Sous 28 px de haut, l'icône seule.
3. **Une seule source** : `scripts/brand-assets.mjs` écrit la géométrie une fois et en tire les icônes PNG et ICO du site, le dessin vectoriel Android (icône adaptative, version d'une seule couleur, écran de lancement), l'icône de la fiche du store, les logos SVG de référence, la géométrie de `RepasLogo.vue` et les fichiers du back (onglet, `/images/logo.png`, icônes du skill Alexa).
4. **Le dessin ne dépend d'aucun fond** : l'anneau est interrompu là où la coche le traverse, au lieu d'un liseré de la couleur du fond. Le logo s'affiche donc tel quel sur le bandeau d'une saison, en clair, en sombre et dans la couche d'une icône thématique.
5. **Les saisons n'habillent pas le logo** : le jeton `--logo` (basilic en clair, brume en sombre) n'est redéfini par aucune saison ; seule la coche est en safran, toujours le safran de la marque.
6. **Le mot est en tracés** (`scripts/brand/repas-word.json`) : aucune police n'est chargée pour le logo. Playfair Display est sous licence SIL OFL.

## Conséquences

- Plus de `logo.png` blanc pour l'en-tête : `RepasLogo.vue` (SVG en ligne, `currentColor`, nom accessible « Repas ») remplace l'image et le texte « Repas » de l'en-tête et de l'écran de connexion.
- L'icône de l'application est réduite à 88 % dans la grille adaptative : les bords des couverts restent dans le masque rond de 72 dp. Les icônes carrées (site, store) gardent le dessin à pleine taille.
- Changer le dessin ou les couleurs = changer le script, relancer, relire les images, mettre à jour `docs/logo/README.md`.
- **Limite connue** : le motif d'icône des saisons (thèmes de Noël, Halloween…) ne change pas l'icône de l'application ni du site installé ; le manifeste PWA reste celui du thème de base (comme avant).
