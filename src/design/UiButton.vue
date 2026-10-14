<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './cn'

const button = cva(
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:brightness-110',
        secondary: 'border-[1.5px] border-primary bg-transparent text-primary hover:bg-soft',
        accent: 'bg-accent text-on-accent hover:brightness-105',
        ghost: 'bg-transparent text-ink hover:bg-soft',
        danger: 'bg-danger text-on-danger hover:brightness-110',
      },
      size: {
        md: 'px-5 text-base',
        lg: 'min-h-13 px-7 text-lg',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

type Variants = VariantProps<typeof button>

const props = withDefaults(
  defineProps<{
    variant?: NonNullable<Variants['variant']>
    size?: NonNullable<Variants['size']>
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'primary', size: 'md', type: 'button' },
)
</script>

<template>
  <button :type="props.type" :class="cn(button({ variant: props.variant, size: props.size }))">
    <slot />
  </button>
</template>
