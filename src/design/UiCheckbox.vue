<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import { Check } from 'lucide-vue-next'

import { cn } from './cn'

const model = defineModel<boolean>({ default: false })
</script>

<template>
  <!-- Toute la ligne est la cible (≥ 56 px) : cocher se fait d'une main, en magasin. -->
  <label class="flex min-h-14 cursor-pointer items-center gap-3.5 text-base font-medium">
    <CheckboxRoot
      v-model="model"
      :class="
        cn(
          'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-2 border-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
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
