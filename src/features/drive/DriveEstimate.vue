<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

import { ApiError } from '@/api'
import type { DriveEstimateLine } from '@/api'
import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import { isRateLimited, messageForFailure } from '@/notifications/failures'
import { useOnline } from '@/offline/useOnline'
import { formatEuros, groupLines, isLowCoverage, toBuy } from './estimate'
import { useDriveEstimate, useDriveSettings } from './queries'

// Le bloc « Estimation du coût » d'une liste (DRV-612) : un total daté tiré des derniers prix vus, jamais un prix garanti. Rien n'est
// calculé ici : le back donne le total, la couverture, les dates et le statut de chaque ligne ; l'écran les range et les écrit.
const props = defineProps<{ listId: string }>()

const { t, d } = useI18n()
const online = useOnline()

const settings = useDriveSettings()
// Fonction allumée et magasin enregistré : sinon l'estimation n'a pas de sens, le bloc n'existe pas
const usable = computed(
  () => settings.data.value?.enabled === true && settings.data.value.store != null,
)
const estimate = useDriveEstimate(
  () => props.listId,
  () => usable.value,
)

const failure = computed(() => (hasFailed(estimate) ? estimate.error.value : null))
// Le back dit lui-même que le drive est coupé : le bloc disparaît comme s'il n'était pas allumé
const driveOff = computed(
  () => failure.value instanceof ApiError && failure.value.message === 'DRIVE_DISABLED',
)
const notConfigured = computed(
  () => failure.value instanceof ApiError && failure.value.message === 'DRIVE_NOT_CONFIGURED',
)
// Ce qui est dit quand l'estimation ne vient pas : le magasin manque, trop de lectures en peu de temps (passager), ou rien de précis
const failureText = computed(() =>
  notConfigured.value || isRateLimited(failure.value)
    ? messageForFailure(failure.value)
    : t('driveEstimate.unavailable'),
)
// Hors connexion, sans estimation déjà relue : rien à dire (la liste, elle, reste lisible)
const visible = computed(
  () => usable.value && !driveOff.value && (online.value || estimate.data.value !== undefined),
)

const data = computed(() => estimate.data.value)
const groups = computed(() => groupLines(data.value?.lines ?? []))
const nothingToBuy = computed(() => data.value !== undefined && toBuy(data.value) === 0)
const noPrice = computed(
  () => data.value !== undefined && toBuy(data.value) > 0 && data.value.estimatedLines === 0,
)
const lowCoverage = computed(() => data.value !== undefined && isLowCoverage(data.value))

/** « d'après les prix vus le … » ou « entre le … et le … » (les dates sont affichées au jour près). */
const period = computed(() => {
  const dates = data.value
  if (!dates?.oldestPriceAt || !dates.newestPriceAt) return null
  const from = d(new Date(dates.oldestPriceAt), 'long')
  const to = d(new Date(dates.newestPriceAt), 'long')

  return from === to
    ? t('driveEstimate.periodOne', { date: from })
    : t('driveEstimate.periodRange', { from, to })
})

const seen = (line: DriveEstimateLine): string | null =>
  line.priceSeenAt
    ? t('driveEstimate.seenOn', { date: d(new Date(line.priceSeenAt), 'long') })
    : null
const price = (line: DriveEstimateLine): string | null =>
  line.unitPriceCents == null ? null : formatEuros(line.unitPriceCents)

const groupKeys = ['unestimated', 'estimated', 'haveAtHome'] as const
const linkClass =
  'inline-flex min-h-11 items-center font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
</script>

<template>
  <section
    v-if="visible"
    aria-labelledby="drive-estimate-title"
    class="flex flex-col gap-3 rounded-2xl bg-soft px-5 py-4"
  >
    <h2 id="drive-estimate-title" class="font-display text-xl font-bold">
      {{ t('driveEstimate.title') }}
    </h2>

    <p v-if="estimate.isPending.value" role="status" class="text-muted">
      {{ t('driveEstimate.loading') }}
    </p>

    <template v-else-if="failure !== null">
      <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft">
        {{ failureText }}
      </p>
      <RouterLink v-if="notConfigured" :to="{ name: 'drive-settings' }" :class="linkClass">
        {{ t('driveEstimate.settings') }}
      </RouterLink>
      <div v-else>
        <UiButton variant="secondary" @click="estimate.refetch()">
          {{ t('driveEstimate.retry') }}
        </UiButton>
      </div>
    </template>

    <template v-else-if="data !== undefined">
      <p v-if="nothingToBuy" class="text-muted">{{ t('driveEstimate.nothingToBuy') }}</p>

      <template v-else>
        <p
          v-if="lowCoverage"
          class="rounded-xl bg-surface px-4 py-3 font-semibold"
          data-testid="low-coverage"
        >
          {{ t('driveEstimate.lowCoverage') }}
        </p>

        <p v-if="noPrice" class="text-muted">{{ t('driveEstimate.noPrice') }}</p>
        <dl v-else class="flex flex-col gap-1">
          <dt class="text-sm text-muted">{{ t('driveEstimate.total') }}</dt>
          <dd class="font-display text-3xl font-bold">
            {{ formatEuros(data.estimatedTotalCents) }}
          </dd>
        </dl>

        <p class="font-semibold">
          {{ t('driveEstimate.coverage', { count: data.estimatedLines, total: toBuy(data) }) }}
        </p>
        <p v-if="data.unestimatedLines > 0" class="text-muted">
          {{ t('driveEstimate.notIncluded', { count: data.unestimatedLines }) }}
        </p>
        <p v-if="period !== null" class="text-muted">{{ period }}</p>
      </template>

      <p class="text-sm text-muted">{{ data.disclaimer }}</p>

      <details v-if="data.lines.length > 0" class="group rounded-xl border border-line bg-surface">
        <summary
          class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
        >
          {{ t('driveEstimate.detail', { count: data.lines.length }) }}
          <ChevronRight
            class="size-5 shrink-0 text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div class="flex flex-col gap-4 px-4 pb-4">
          <template v-for="key in groupKeys" :key="key">
            <section v-if="groups[key].length > 0" :aria-labelledby="`drive-estimate-${key}`">
              <h3 :id="`drive-estimate-${key}`" class="font-bold">
                {{ t(`driveEstimate.groups.${key}`, { count: groups[key].length }) }}
              </h3>
              <p v-if="key === 'unestimated'" class="text-sm text-muted">
                {{ t('driveEstimate.neverGuessed') }}
              </p>
              <ul class="mt-1 flex flex-col divide-y divide-line">
                <li
                  v-for="line in groups[key]"
                  :key="line.ingredientSlug"
                  class="flex flex-col gap-0.5 py-2"
                >
                  <span class="flex items-baseline justify-between gap-3">
                    <span class="font-semibold">{{ line.ingredientName }}</span>
                    <span v-if="line.subtotalCents != null" class="font-bold whitespace-nowrap">
                      {{ formatEuros(line.subtotalCents) }}
                    </span>
                  </span>
                  <span v-if="line.productLabel" class="text-sm text-muted">
                    {{ line.productLabel }}
                  </span>
                  <span v-if="price(line) !== null" class="text-sm text-muted">
                    <template v-if="line.packs != null">
                      {{ t('driveEstimate.packsAt', { count: line.packs, price: price(line) }) }}
                    </template>
                    <template v-else>{{ price(line) }}</template>
                    <template v-if="seen(line) !== null"> · {{ seen(line) }}</template>
                  </span>
                  <span class="text-sm">{{ t(`driveEstimate.status.${line.status}`) }}</span>
                </li>
              </ul>
            </section>
          </template>
        </div>
      </details>
    </template>
  </section>
</template>
