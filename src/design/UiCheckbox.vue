<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import { Check } from 'lucide-vue-next'

import { cn } from './cn'

const model = defineModel<boolean>({ default: false })

/** Lecture seule (liste envoyée au drive) : la case garde son état mais ne se coche plus. */
defineProps<{ disabled?: boolean }>()
</script>

<template>
  <!-- Toute la ligne est la cible (≥ 56 px) : cocher se fait d'une main, en magasin. -->
  <label
    :class="
      cn(
        'flex min-h-14 items-center gap-3.5 text-base font-medium',
        disabled ? 'cursor-default' : 'cursor-pointer',
      )
    "
  >
    <CheckboxRoot
      v-model="model"
      :disabled="disabled"
      :class="
        cn(
          'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-2 border-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'data-[disabled]:cursor-default data-[disabled]:opacity-60',
          'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary',
        )
      "
    >
      <CheckboxIndicator>
        <Check class="size-[18px]" :stroke-width="3" aria-hidden="true" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <span :class="cn('flex-1', model && 'text-muted line-through')"><slot /></span>
  </label>
</template>
