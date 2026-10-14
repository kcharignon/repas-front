<script setup lang="ts">
import { cn } from './cn'

const model = defineModel<string | number>({ default: '' })

defineProps<{ invalid?: boolean }>()
</script>

<template>
  <input
    v-model="model"
    :aria-invalid="invalid ? 'true' : undefined"
    :class="
      cn(
        'min-h-12 w-full rounded-xl border-[1.5px] bg-surface px-3.5 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        invalid ? 'border-2 border-danger' : 'border-line',
      )
    "
  />
</template>
