<script setup lang="ts">
import { useSeasonStore } from './season'

/**
 * Les motifs du thème de Noël (ADR 0011), purement décoratifs : rien ne bouge, rien ne porte de texte, jamais derrière du texte
 * courant. `banner` : des flocons au trait, une étoile dorée et une rangée de petits sapins en bas du bandeau de connexion ;
 * `web` : un flocon discret dans l'angle haut-droit du menu latéral. Rien du tout hors saison (ou quand l'utilisateur a coupé le décor).
 * Le parent est `relative` ; ce composant se pose en premier dans le parent, le contenu `relative` qui suit passe au-dessus.
 */
defineProps<{ variant: 'banner' | 'web' }>()

const season = useSeasonStore()

const FLAKE = 'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7'
const FLAKE_TIPS = 'M9.6 3.6L12 5.8l2.4-2.2M9.6 20.4L12 18.2l2.4 2.2'
const STAR = 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.6 1.4-6.8L2.2 9.1l6.9-.8z'
const TREE = 'M12 2l6 9h-3.5l5 8H15v3h-6v-3H4.5l5-8H6z'
// La hauteur de chaque sapin (téléphone, bureau) : une rangée inégale, jamais déformée.
const TREES = [
  'h-3 md:h-5',
  'h-5 md:h-9',
  'h-3.5 md:h-6',
  'h-5 md:h-8',
  'h-3 md:h-5',
  'h-4 md:h-7',
  'h-3.5 md:h-6',
  'h-5 md:h-9',
  'h-3 md:h-5',
]
</script>

<template>
  <template v-if="season.activeSeason === 'noel'">
    <div
      v-if="variant === 'banner'"
      aria-hidden="true"
      class="pointer-events-none absolute inset-0"
    >
      <!-- Les flocons : un grand dans l'angle haut-gauche, d'autres seulement sur le bureau, où le bandeau a de la place -->
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke-width="1.3"
        stroke-linecap="round"
        class="absolute top-1 left-1 size-7 stroke-white/50 md:top-6 md:left-8 md:size-14"
      >
        <path :d="FLAKE" />
        <path :d="FLAKE_TIPS" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke-width="1.5"
        stroke-linecap="round"
        class="absolute top-28 left-28 hidden size-8 stroke-white/35 md:block"
      >
        <path :d="FLAKE" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke-width="1.6"
        stroke-linecap="round"
        class="absolute top-40 right-44 hidden size-6 stroke-white/35 md:block"
      >
        <path :d="FLAKE" />
      </svg>
      <!-- L'étoile, en haut à droite, sous le lien de confidentialité -->
      <svg
        viewBox="0 0 24 24"
        class="absolute top-12 right-5 size-9 fill-star md:top-9 md:right-11 md:size-24"
      >
        <path :d="STAR" />
      </svg>
      <!-- Les sapins, en bas du bandeau : sur téléphone ils restent dans la marge basse, sous la phrase -->
      <div class="absolute inset-x-0 bottom-0 flex items-end justify-around px-3">
        <svg
          v-for="(height, index) in TREES"
          :key="index"
          viewBox="0 0 24 24"
          :class="['w-auto fill-white/20', height]"
        >
          <path :d="TREE" />
        </svg>
      </div>
    </div>
    <svg
      v-else
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke-width="1"
      stroke-linecap="round"
      class="pointer-events-none absolute top-3 right-3 size-14 stroke-line"
    >
      <path :d="FLAKE" />
      <path :d="FLAKE_TIPS" />
    </svg>
  </template>
</template>
