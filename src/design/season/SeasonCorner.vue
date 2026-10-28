<script setup lang="ts">
import { watch } from 'vue'

import { useSeasonStore } from '../season'
import { PRELOADED_SLOTS, loadPiece } from './art'
import SeasonArt from './SeasonArt.vue'
import { cornerOnBanner } from './cornerTone'

/**
 * L'ornement de coin (ADR 0012) : toujours visible, en haut à droite, sur tous les écrans pendant la saison. Posé UNE fois dans `App.vue`.
 * Calque fixe sans événement de souris : il ne capte aucun geste, ne gêne aucune action située dessous, et reste sous les fenêtres.
 * Le trait suit la couleur du texte (`currentColor`), donc le clair et le sombre.
 */
const season = useSeasonStore()

// Posé une fois à la racine : c'est aussi l'endroit où l'on charge d'avance les pièces d'un écran qui n'apparaît que hors connexion
watch(
  () => season.activeSeason,
  (active) => {
    if (active) for (const slot of PRELOADED_SLOTS) void loadPiece(active, slot)
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="season.activeSeason"
    aria-hidden="true"
    data-testid="season-corner"
    :class="[
      'pointer-events-none fixed top-[env(safe-area-inset-top)] right-0 z-[5] size-[120px] md:size-40',
      cornerOnBanner ? 'text-white/55 md:text-ink/45' : 'text-ink/45',
    ]"
  >
    <SeasonArt name="corner" class="size-full" />
  </div>
</template>
