# Logo et icône de Repas

Référence de l'identité visuelle (ADR [0020](../adr/0020-icone-et-logo-de-repas.md), 4 novembre 2026). Une seule source : `scripts/brand-assets.mjs`. Tout le reste en est tiré.

## L'icône

L'**anneau-horloge** : une assiette en anneau, une coche dont le **sommet est au centre de l'assiette** (ses deux branches font les aiguilles d'une horloge) et deux lignes de liste ; à gauche une fourchette, à droite un couteau de table, dos droit, tranchant tourné vers l'assiette.

- Le dessin est tracé sur la grille d'une icône adaptative Android : 108 × 108, centré en (54, 55).
- L'anneau est **interrompu** là où la coche le traverse : un vrai vide, pas un liseré de la couleur du fond. Le dessin ne dépend donc d'aucun fond (site, bandeau de saison, mode sombre, couche d'une icône thématique).
- Fond de l'application et de toutes les icônes carrées : le vert basilic `#1E6B4C`, la coche en safran `#F4B73F`, le reste en blanc.
- Sous 28 px de haut, c'est **l'icône seule** qu'on met (onglet, favori, pastille), jamais le logo.

## Le logo

Le dessin et le mot « Repas » en **Playfair Display Bold** (700, licence SIL OFL), avec une majuscule, jamais en capitales ni en minuscules. Le mot est converti en tracés (`scripts/brand/repas-word.json`) : aucun fichier de police n'est chargé nulle part.

| Version | Quand | Mesures (F = corps du mot) |
|---|---|---|
| **Empilé** (par défaut) | connexion, accueil, écran de lancement, fiche de la boutique, toute zone de **88 px de haut ou plus** | dessin de 1,8 F de haut au-dessus du mot, espace de 0,2 F, le tout centré |
| **Horizontal** | en-tête, barre d'application, pied de courriel, toute zone de **moins de 88 px** de haut | dessin de 1,12 F de haut à gauche, espace de 0,2 F, mot centré sur le dessin |

- **Corps minimal** : 18 px en horizontal ; 28 px en empilé (88 px de haut en tout).
- **Zone de protection** : 0,7 F (à peu près la hauteur du R) tout autour. Rien d'autre n'y entre.
- Le logo n'a **pas de tuile** : le dessin est posé directement sur le fond. La tuile ne sert qu'à l'icône.

## Couleurs

| Nom | Valeur | Usage |
|---|---|---|
| Basilic | `#1E6B4C` | fond vert de l'icône ; mot et dessin sur fond clair |
| Safran | `#F4B73F` | la coche, et rien d'autre ; jamais du texte |
| Crème | `#F4F6F3` | fond clair du logo |
| Nuit | `#0F1F18` | fond sombre du logo |
| Brume | `#EAF1EC` | mot et dessin sur fond sombre |
| Blanc | `#FFFFFF` | mot et dessin sur fond vert |

**Une seule couleur** (impression, icône thématique d'Android 13) : tout le dessin, coche comprise, prend la couleur du mot (`mono-basilic`, `mono-blanc`).

## À éviter

Étirer, pencher ou déformer ; changer la police, la casse ou les couleurs ; mettre le mot en safran ; poser le logo sur une photo ou un fond chargé (prendre la version sur fond uni) ; ajouter une ombre, un contour, un dégradé ou un effet.

## Les fichiers

| Où | Fichier | D'où il vient |
|---|---|---|
| Ici (`docs/logo/`) | `logo-{empile,horizontal}-{clair,vert,sombre,mono-basilic,mono-blanc}.svg`, `icon.svg` | maîtres vectoriels, mot en tracés |
| Site | `public/icons/icon-{192,512}.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `public/favicon.ico` (16, 32 et 48 px) | rendu de l'icône par Chromium |
| Site | `src/design/RepasLogo.vue` et `src/design/logoGeometry.ts` | le logo en SVG en ligne ; `currentColor` pour le mot et le dessin, jeton `--logo` (basilic en clair, brume en sombre, **jamais redéfini par une saison**) |
| Site | `src/assets/logo.png` | l'icône en 192 px (page `/design` seulement) |
| Application | `android/app/src/main/res/drawable/ic_launcher_foreground.xml`, `ic_launcher_monochrome.xml` | dessin vectoriel réduit à 88 % (zone sûre de 66 dp) ; le fond est la couleur `basil` ; l'écran de lancement reprend le même dessin |
| Play Store | `android/store/icon.svg`, `android/store/images/icon.png` (512 × 512, 32 bits) | fond plein, Google applique ses coins |
| Courriels | `{FRONT_URL}/icons/icon-192.png` (`BrandedEmailLayout` du back) | le même fichier que le site |
| Back | `public/favicon.ico`, `public/images/logo.png` | dépôt `kcharignon/repas` |
| Skill Alexa | `docs/voice/skill/assets/fr-FR_{small,large}Icon.png` (108 et 512 px) | dépôt `kcharignon/repas` |

## Régénérer

```
node scripts/brand-assets.mjs --back ../Repas
```

(Node 24, Playwright du dépôt.) Le script réécrit tous les fichiers du tableau ci-dessus ; `android/__tests__/brand-assets.spec.ts` garde leurs mesures et l'accord entre l'icône Android et le logo du site. Pour changer le dessin, on modifie la géométrie dans `scripts/brand-assets.mjs`, on relance le script et on relit les images : jamais un fichier généré à la main.

Le mot est converti en tracés une fois pour toutes : si le mot ou la police changent, il faut refaire `scripts/brand/repas-word.json` (une conversion avec `fontkit`, voir le message du commit qui l'a posé) ; la licence de Playfair Display (SIL OFL 1.1) autorise de dessiner un logo avec.
