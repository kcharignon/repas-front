<script setup lang="ts">
import SeasonArt from './SeasonArt.vue'

/**
 * Un état vide (ADR 0012) : l'illustration de la saison, 128 à 160 px, au-dessus de la phrase qui suit. Hors saison, il ne reste que
 * la phrase. `name` est un emplacement (`empty-list`, `empty-recipes`, `empty-search`).
 */
defineProps<{ name: string }>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <SeasonArt :name="name" class="size-32 self-start md:size-40" />
    <slot />
  </div>
</template>
