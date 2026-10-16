<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Minus, Plus } from 'lucide-vue-next'

import { formatQuantity } from '@/features/shopping-lists/format'

defineProps<{
  name: string
  /** Quantité dans la liste en cours (0 : pas dans la liste). */
  quantity: number
  unitSymbol: string
  /** Un changement est en cours : les boutons attendent. */
  busy: boolean
}>()

defineEmits<{ less: []; more: [] }>()

const { t } = useI18n()

const stepClass =
  'flex size-11 cursor-pointer items-center justify-center rounded-xl text-ink hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40'
</script>

<template>
  <span class="inline-flex items-center rounded-2xl border-[1.5px] border-line">
    <button
      type="button"
      :aria-label="t('ingredients.less', { name })"
      :disabled="quantity <= 0 || busy"
      :class="stepClass"
      @click="$emit('less')"
    >
      <Minus class="size-5" aria-hidden="true" />
    </button>
    <span class="min-w-14 text-center text-base font-bold" aria-live="polite">{{
      formatQuantity(quantity, unitSymbol)
    }}</span>
    <button
      type="button"
      :aria-label="t('ingredients.more', { name })"
      :disabled="busy"
      :class="stepClass"
      @click="$emit('more')"
    >
      <Plus class="size-5" aria-hidden="true" />
    </button>
  </span>
</template>
