<script setup lang="ts">
import { useSeasonStore } from './season'

/**
 * Les motifs du thème saisonnier (ADR 0010), purement décoratifs : rien ne bouge, rien ne porte de texte, jamais derrière du texte
 * courant. `banner` : la toile, la lune et deux chauves-souris en haut du bandeau de connexion ; `web` : une toile discrète dans
 * l'angle haut-droit du menu latéral. Rien du tout hors saison (ou quand l'utilisateur a coupé le décor).
 * Le parent est `relative` ; ce composant se pose en premier dans le parent, le contenu `relative` qui suit passe au-dessus.
 */
defineProps<{ variant: 'banner' | 'web' }>()

const season = useSeasonStore()

const WEB_SPOKES = 'M120 0L0 0M120 0L110 45M120 0L85 85M120 0L45 110M120 0L0 120'
const WEB_ARCS = 'M120 28Q100 30 92 0M120 58Q92 60 70 14M120 88Q84 86 52 44M120 112Q72 108 34 74'
const BAT =
  'M12 6c-1 0-1.6.8-2 1.6C9 6.6 6.8 5.8 3 6.4c1.2.8 1.8 2 1.9 3.4C3.8 10 2.7 10.6 2 11.6c2-.5 3.6-.2 4.8.9.8-.9 1.9-1.4 3.2-1.3.4 1.4 1.2 2.4 2 2.8.8-.4 1.6-1.4 2-2.8 1.3-.1 2.4.4 3.2 1.3 1.2-1.1 2.8-1.4 4.8-.9-.7-1-1.8-1.6-2.9-1.8.1-1.4.7-2.6 1.9-3.4C17.2 5.8 15 6.6 14 7.6 13.6 6.8 13 6 12 6z'
const MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'
</script>

<template>
  <template v-if="season.activeSeason === 'halloween'">
    <div
      v-if="variant === 'banner'"
      aria-hidden="true"
      class="pointer-events-none absolute inset-0"
    >
      <!-- La toile, dans l'angle haut-gauche -->
      <svg
        viewBox="0 0 120 120"
        fill="none"
        stroke-width="1.2"
        class="absolute top-0 left-0 size-24 -scale-x-100 stroke-white/20 md:size-40"
      >
        <path :d="WEB_SPOKES" />
        <path :d="WEB_ARCS" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        class="absolute top-14 right-10 size-9 fill-moon md:top-20 md:right-16 md:size-14"
      >
        <path :d="MOON" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        class="absolute top-12 right-24 size-5 rotate-[-12deg] fill-white/50 md:top-16 md:right-36 md:size-7"
      >
        <path :d="BAT" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        class="absolute top-20 right-4 size-4 rotate-[10deg] fill-white/40 md:top-32 md:right-8 md:size-5"
      >
        <path :d="BAT" />
      </svg>
    </div>
    <svg
      v-else
      aria-hidden="true"
      viewBox="0 0 120 120"
      fill="none"
      stroke-width="1.2"
      class="pointer-events-none absolute top-0 right-0 size-24 stroke-line"
    >
      <path :d="WEB_SPOKES" />
      <path :d="WEB_ARCS" />
    </svg>
  </template>
</template>
