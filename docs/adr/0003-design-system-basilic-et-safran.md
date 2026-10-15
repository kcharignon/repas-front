# 0003 — Design système « Basilic & safran » : Tailwind, Reka UI, jetons en variables CSS

- **Statut** : Accepted (jetons et composants à ajuster après la validation des maquettes par l'utilisateur)
- **Date** : 2026-10-15
- **Liens** : [0001](0001-stack-du-front.md), plan du front (section 7, dépôt back)

## Contexte

Le Twig actuel est du Bootstrap par défaut, sans identité. Le front est refait pour l'usage réel : consulter et cocher la liste de courses
d'une main, en magasin, sur téléphone, puis planifier et éditer à l'ordinateur. Il faut un système gratuit, accessible, qu'on peut
redessiner sans lutter contre un kit imposé.

## Décision

1. **Tailwind CSS v4** (`@tailwindcss/vite`) et **Reka UI** (primitives accessibles sans style, ex-Radix Vue) pour les composants à
   comportement (case, progression, plus tard dialogue, onglets, menu). Approche « shadcn » : composants écrits dans `src/design/`
   (préfixe `Ui`), variantes par `class-variance-authority`, assemblage de classes par `cn()` (`clsx` + `tailwind-merge`). Icônes : Lucide.
   Tout est sous licence MIT ; aucun kit complet (Vuetify, PrimeVue) dont l'esthétique serait à contourner.
2. **Jetons en variables CSS** (`src/design/theme.css`) : fond, surface, encre, texte discret, liseré, basilic (primaire), safran (accent),
   tomate (danger), puis exposés à Tailwind par `@theme inline` (`bg-primary`, `text-muted`…). Clair par défaut, sombre selon
   `prefers-color-scheme`, `data-theme="light|dark"` sur `<html>` pour forcer ; le choix (`system`, `light`, `dark`) est une préférence
   d'affichage gardée en `localStorage` (jamais le jeton d'accès).
3. **Typographie** auto-hébergée (`@fontsource-variable`, aucune requête vers un CDN, compatible CSP stricte) : Bricolage Grotesque pour
   les titres, Figtree pour le texte.
4. **Accessibilité comme critère de sortie** : cibles tactiles ≥ 44 px (≥ 56 px pour une ligne à cocher), état jamais porté par la
   couleur seule (case cochée, texte barré), focus visible, `prefers-reduced-motion`, contrastes AA vérifiés par **axe** dans Playwright
   (catalogue, clair et sombre, bureau et mobile).
5. **Textes dans `vue-i18n`** (`src/i18n/fr.ts`), pas dans les composants.
6. **Catalogue** : la route `/design` montre tous les composants dans les deux thèmes (outil de développement et cible des tests axe). Elle n'existe pas dans le build de production (`import.meta.env.DEV`), sauf `VITE_DESIGN_CATALOG=true`, que la CI pose pour son test d'accessibilité.
   Elle sera retirée du build de production à la bascule.

## Conséquences

- Positives : identité propre, thème sombre gratuit, composants testés (unitaires, axe), aucune dépendance de style opaque.
- Négatives : on maintient nos composants (peu nombreux) ; Reka UI et Tailwind sont des majeures récentes à suivre.

## Alternatives écartées

- Vuetify, PrimeVue, Naive UI : complets mais imposent leur esthétique et un poids de bundle élevé.
- Bootstrap (comme le Twig) : c'est précisément le « fonctionnel mais moche » à quitter.
- Storybook / Histoire pour le catalogue : outillage lourd ou en bêta avec Vite 8 ; la page `/design` suffit pour l'instant.
