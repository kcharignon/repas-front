<script setup lang="ts">
import { cn } from './cn'

const pressed = defineModel<boolean>('pressed', { default: false })
</script>

<template>
  <button
    type="button"
    :aria-pressed="pressed"
    :class="
      cn(
        'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-[18px] text-[15px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        pressed ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink',
      )
    "
    @click="pressed = !pressed"
  >
    <slot />
  </button>
</template>
