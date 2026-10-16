<script setup lang="ts">
import { Check } from 'lucide-vue-next'

import { cn } from './cn'

const pressed = defineModel<boolean>('pressed', { default: false })
</script>

<template>
  <button
    type="button"
    :aria-pressed="pressed"
    :class="
      cn(
        'relative flex min-h-17 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] px-1 py-2 text-center text-[13px] leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        pressed
          ? 'border-primary bg-soft font-bold text-primary'
          : 'border-line bg-surface font-semibold text-ink',
      )
    "
    @click="pressed = !pressed"
  >
    <slot name="icon" />
    <span class="line-clamp-2 max-w-full break-words"><slot /></span>
    <Check
      v-if="pressed"
      class="absolute top-1 right-1 size-4 rounded-full bg-primary p-0.5 text-on-primary"
      aria-hidden="true"
    />
  </button>
</template>
