<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { Check, ChevronDown } from 'lucide-vue-next'

import { cn } from './cn'

export interface ComboboxOption {
  value: string
  label: string
}

const props = defineProps<{
  options: ComboboxOption[]
  label: string
  placeholder?: string
  empty: string
  invalid?: boolean
}>()

const model = defineModel<string>({ default: '' })

const labelOf = (value: string) =>
  props.options.find((option) => option.value === value)?.label ?? ''
</script>

<template>
  <ComboboxRoot v-model="model" class="relative">
    <ComboboxAnchor
      :class="
        cn(
          'flex min-h-12 items-center rounded-xl border-[1.5px] bg-surface pr-1 pl-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
          invalid ? 'border-2 border-danger' : 'border-line',
        )
      "
    >
      <ComboboxInput
        :aria-label="label"
        :placeholder="placeholder"
        :display-value="(value) => labelOf(String(value ?? ''))"
        class="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
      />
      <ComboboxTrigger
        :aria-label="label"
        class="flex size-10 shrink-0 cursor-pointer items-center justify-center text-muted"
      >
        <ChevronDown class="size-5" aria-hidden="true" />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="4"
        class="z-50 max-h-64 w-(--reka-combobox-trigger-width) overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
      >
        <ComboboxViewport class="p-1">
          <ComboboxEmpty class="px-3 py-3 text-sm text-muted">{{ empty }}</ComboboxEmpty>
          <ComboboxItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-base text-ink data-[highlighted]:bg-soft"
          >
            <span>{{ option.label }}</span>
            <Check v-if="option.value === model" class="size-4 text-primary" aria-hidden="true" />
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
