<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronLeft } from 'lucide-vue-next'

import { ApiError } from '@/api'
import type { DuplicatePair, DuplicateSide } from '@/api'
import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import { useNotificationsStore } from '@/notifications/store'
import DuplicateCard from './DuplicateCard.vue'
import MergeConfirmSheet from './MergeConfirmSheet.vue'
import { groupByDepartment, pairKey } from './mergeText'
import { useDuplicates, useMarkDistinct } from './queries'

const { t } = useI18n()
const notifications = useNotificationsStore()

const duplicates = useDuplicates()
const markDistinct = useMarkDistinct()

const pairs = computed(() => duplicates.data.value?.member ?? [])
const groups = computed(() => groupByDepartment(pairs.value))

// Une seule carte ouverte à la fois : la dernière touchée, sinon la première de la liste
const touched = ref<string | null>(null)
const openKey = computed(() =>
  pairs.value.some((pair) => pairKey(pair) === touched.value)
    ? touched.value
    : pairs.value[0] === undefined
      ? null
      : pairKey(pairs.value[0]),
)
// Le côté à garder choisi pour chaque paire (sans choix, la suggestion du back)
const keeps = ref<Record<string, string>>({})

const merging = ref<{ absorbed: DuplicateSide; kept: DuplicateSide } | null>(null)
const sheetOpen = computed({
  get: () => merging.value !== null,
  set: (value) => {
    if (!value) merging.value = null
  },
})

// Une carte qui disparaît emporte le focus : il revient au titre, d'où l'on repart
const heading = ref<HTMLElement | null>(null)
async function settle() {
  await nextTick()
  setTimeout(() => heading.value?.focus(), 0)
}

function distinct(pair: DuplicatePair) {
  markDistinct.mutate(
    { slug: pair.first.slug, other: pair.second.slug },
    {
      onSuccess: () => {
        notifications.push('success', t('ingredients.duplicates.distinctDone'))
        void settle()
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 404) {
          notifications.push('error', t('ingredients.merge.gone'))
          void settle()
        } else notifications.push('error', t('ingredients.duplicates.distinctFailed'))
      },
    },
  )
}
</script>

<template>
  <main class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
    <RouterLink
      :to="{ name: 'departments' }"
      class="inline-flex min-h-11 items-center gap-1 self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ChevronLeft class="size-5" aria-hidden="true" />{{ t('departments.title') }}
    </RouterLink>

    <header>
      <h1
        ref="heading"
        tabindex="-1"
        class="font-display text-3xl leading-tight font-bold focus:outline-none md:text-4xl"
      >
        {{ t('ingredients.duplicates.title') }}
      </h1>
      <p class="mt-1 text-muted">{{ t('ingredients.duplicates.help') }}</p>
    </header>

    <template v-if="hasFailed(duplicates)">
      <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft">
        {{ t('ingredients.duplicates.failed') }}
      </p>
      <UiButton class="self-start" @click="duplicates.refetch()">{{
        t('ingredients.duplicates.retry')
      }}</UiButton>
    </template>
    <p v-else-if="duplicates.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="pairs.length === 0" class="text-muted" role="status">
      {{ t('ingredients.duplicates.none') }}
    </p>

    <template v-else>
      <section v-for="group in groups" :key="group.slug" class="flex flex-col gap-3">
        <h2 class="text-xs font-semibold tracking-wide text-muted uppercase">{{ group.name }}</h2>
        <ul class="flex flex-col gap-3">
          <DuplicateCard
            v-for="pair in group.pairs"
            :key="pairKey(pair)"
            :pair="pair"
            :open="openKey === pairKey(pair)"
            :keep="keeps[pairKey(pair)]"
            :busy="markDistinct.isPending.value"
            @open="touched = pairKey(pair)"
            @update:keep="keeps[pairKey(pair)] = $event"
            @merge="(absorbed, kept) => (merging = { absorbed, kept })"
            @distinct="distinct(pair)"
          />
        </ul>
      </section>
    </template>

    <MergeConfirmSheet
      v-if="merging"
      v-model:open="sheetOpen"
      :absorbed="merging.absorbed"
      :kept="merging.kept"
      @merged="settle"
      @gone="settle"
    />
  </main>
</template>
