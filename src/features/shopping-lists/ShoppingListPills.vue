<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { OpenShoppingList } from '@/api'
import { cn } from '@/design/cn'
import { isTyped } from './queries'

defineProps<{
  /** Les listes en cours : la principale d'abord, puis les types par date de création. */
  lists: readonly OpenShoppingList[]
  /** La liste montrée sous les pastilles. */
  current: string | null
}>()
const emit = defineEmits<{ select: [list: OpenShoppingList] }>()

const { t } = useI18n()
</script>

<template>
  <!-- Une pastille par liste en cours, avec le nombre d'articles qui restent à cocher (ADR 0036, maquette 1) -->
  <div role="group" :aria-label="t('shoppingList.openLists')" class="-m-1 flex flex-wrap gap-2 p-1">
    <button
      v-for="list in lists"
      :key="list.id"
      type="button"
      :aria-pressed="list.id === current"
      :class="
        cn(
          'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4 text-base font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          list.id === current
            ? 'border-primary bg-primary text-on-primary'
            : 'border-line bg-surface text-ink hover:border-primary',
        )
      "
      @click="emit('select', list)"
    >
      <!-- Les espaces gardent le nom lu en entier : « Boucherie 3 à cocher » -->
      <span>{{ isTyped(list) ? list.name : t('shoppingList.mainPill') }}</span>
      {{ ' ' }}
      <span data-test="pill-count">{{ list.uncheckedCount }}</span>
      {{ ' ' }}
      <span class="sr-only">{{ t('shoppingList.toTick') }}</span>
    </button>
  </div>
</template>
