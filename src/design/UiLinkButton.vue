<script setup lang="ts">
import { cva } from 'class-variance-authority'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

import { cn } from './cn'

const link = cva(
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-base font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:brightness-110',
        secondary: 'border-[1.5px] border-primary text-primary hover:bg-soft',
        accent: 'bg-accent text-on-accent hover:brightness-105',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)

withDefaults(
  defineProps<{ to: RouteLocationRaw; variant?: 'primary' | 'secondary' | 'accent' }>(),
  {
    variant: 'primary',
  },
)
</script>

<template>
  <RouterLink :to="to" :class="cn(link({ variant }))"><slot /></RouterLink>
</template>
