<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DrivePlanLine } from '@/api'
import UiChip from '@/design/UiChip.vue'
import { formatQuantity } from '@/features/shopping-lists/format'
import { effectiveStatus } from './buildPlanMessage'
import type { LineChange } from './buildPlanMessage'

const props = defineProps<{
  line: DrivePlanLine
  change: LineChange | undefined
  /** Mode assisté (hors de l'application) : pas de choix par ligne, un lien de recherche sur le site de l'enseigne. */
  assisted: boolean
  searchUrl: string
}>()
const emit = defineEmits<{ change: [change: LineChange | undefined] }>()

const { t } = useI18n()

const status = computed(() =>
  effectiveStatus(props.line, { [props.line.ingredientSlug]: props.change }),
)
const preferred = computed(() => props.line.products[0])
const canChange = computed(() => !props.assisted && props.line.status !== 'HAVE_AT_HOME')
const canSearch = computed(() => props.assisted && props.line.status !== 'HAVE_AT_HOME')

const packs = (product: DrivePlanLine['products'][number]): string => {
  const count = product.packs ?? 0
  if (count === 0) return t('driveSend.packsUnknown')
  const text = t('driveSend.packs', { count }, count)

  return product.packsStatus === 'TO_CHECK' ? `${text}, ${t('driveSend.packsToCheck')}` : text
}
</script>

<template>
  <li class="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="min-w-0 font-bold break-words">{{ line.ingredientName }}</h3>
      <span class="shrink-0 text-sm text-muted">
        {{
          t('driveSend.need', {
            quantity: formatQuantity(line.needed.quantity, line.needed.unitSymbol),
          })
        }}
      </span>
    </div>

    <p v-if="status === 'HAVE_AT_HOME'" class="text-muted">{{ t('driveSend.statusHaveAtHome') }}</p>
    <p v-else-if="status === 'SKIP'" class="font-semibold">{{ t('driveSend.statusSkip') }}</p>
    <p v-else-if="status === 'NEW' && preferred && change === 'REPLACE'" class="font-semibold">
      {{ t('driveSend.statusReplace', { label: preferred.label }) }}
    </p>
    <p v-else-if="status === 'NEW'" class="font-semibold">{{ t('driveSend.statusNew') }}</p>
    <template v-else>
      <p class="sr-only">{{ t('driveSend.products', {}, line.products.length) }}</p>
      <ol class="flex flex-col gap-1">
        <li v-for="product in line.products" :key="product.retailerProductId" class="break-words">
          <span :class="product.rank === 1 ? 'font-semibold' : 'text-muted'">
            {{ product.rank }}. {{ product.label }}
            <template v-if="product.rank > 1"> ({{ t('driveSend.fallback') }})</template>
          </span>
          <span class="text-muted"> · {{ packs(product) }}</span>
        </li>
      </ol>
    </template>

    <p v-if="line.rejected.length > 0" class="text-sm break-words text-muted">
      {{
        t('driveSend.rejected', {
          labels: line.rejected.map((product) => product.label).join(', '),
        })
      }}
    </p>

    <div v-if="canChange" class="flex flex-wrap gap-2 pt-1">
      <UiChip
        v-if="line.status === 'KNOWN'"
        :pressed="change === 'REPLACE'"
        :aria-label="t('driveSend.replaceFor', { name: line.ingredientName })"
        @update:pressed="emit('change', $event ? 'REPLACE' : undefined)"
      >
        {{ t('driveSend.replace') }}
      </UiChip>
      <UiChip
        :pressed="change === 'SKIP'"
        :aria-label="t('driveSend.skipFor', { name: line.ingredientName })"
        @update:pressed="emit('change', $event ? 'SKIP' : undefined)"
      >
        {{ t('driveSend.skip') }}
      </UiChip>
    </div>

    <a
      v-if="canSearch"
      :href="searchUrl"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('driveSend.notInApp.searchFor', { name: line.ingredientName })"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('driveSend.notInApp.search') }}
    </a>
  </li>
</template>
