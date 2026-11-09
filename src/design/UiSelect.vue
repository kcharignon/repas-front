<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

import { cn } from './cn'

defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })

defineProps<{ invalid?: boolean }>()

// La classe de l'appelant passe par cn : elle l'emporte sur celle du select (pr-8 contre pr-10)
const attrs = useAttrs()
const rest = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([name]) => name !== 'class')),
)
</script>

<template>
  <span class="relative block">
    <select
      v-bind="rest"
      v-model="model"
      :aria-invalid="invalid ? 'true' : undefined"
      :class="
        cn(
          'min-h-12 w-full cursor-pointer appearance-none rounded-xl border-[1.5px] bg-surface pr-10 pl-3.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          invalid ? 'border-2 border-danger' : 'border-line',
          attrs.class as string | undefined,
        )
      "
    >
      <slot />
    </select>
    <ChevronDown
      class="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted"
      aria-hidden="true"
    />
  </span>
</template>
