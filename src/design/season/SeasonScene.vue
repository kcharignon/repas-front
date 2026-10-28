<script setup lang="ts">
import { useSeasonStore } from '../season'
import SeasonArt from './SeasonArt.vue'

/**
 * La scène de fond (ADR 0012) : une grande illustration ancrée en bas, derrière tout, très douce (`--scene-opacity`, réglé par saison et par
 * mode pour que le texte garde 4,5:1 sur le pire pixel : `seasonContrast.spec.ts`). Calque fixe de profondeur négative : les cartes, les
 * champs et la barre du bas, qui ont leur propre fond, restent opaques par-dessus. Posée UNE fois dans `App.vue`.
 */
const season = useSeasonStore()
</script>

<template>
  <div
    v-if="season.activeSeason"
    aria-hidden="true"
    data-testid="season-scene"
    class="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[50dvh] md:h-[min(100dvh,60vw)]"
    style="opacity: var(--scene-opacity)"
  >
    <SeasonArt name="scene" class="size-full" />
  </div>
</template>
