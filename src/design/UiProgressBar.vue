<script setup lang="ts">
import { ProgressIndicator, ProgressRoot } from 'reka-ui'

defineProps<{
  value: number
  max: number
  /** Ce que lit un lecteur d'écran : « 4 sur 11 articles dans le panier ». */
  label: string
}>()
</script>

<template>
  <ProgressRoot
    :model-value="value"
    :max="Math.max(max, 1)"
    :aria-label="label"
    class="h-2 overflow-hidden rounded-full bg-line"
  >
    <ProgressIndicator
      class="h-full rounded-full bg-primary transition-[width] duration-300"
      :style="{ width: `${max === 0 ? 0 : (value / max) * 100}%` }"
    />
  </ProgressRoot>
</template>
