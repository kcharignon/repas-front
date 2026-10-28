<script setup lang="ts">
import ChristmasDecor from './ChristmasDecor.vue'
import HalloweenDecor from './HalloweenDecor.vue'

/** Le décor de la saison active (ADR 0010, 0011) : chacun ne s'affiche que pendant sa saison, rien d'autre ne se choisit ici. */
defineProps<{ variant: 'banner' | 'web' }>()
</script>

<template>
  <HalloweenDecor :variant="variant" />
  <ChristmasDecor :variant="variant" />
</template>
