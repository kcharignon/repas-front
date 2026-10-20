<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronRight, Search } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import type { DriveChoice } from '@/api'
import { useDriveChoices } from './choicesQueries'
import { useDriveSettings } from './queries'
import { plain } from './productFormat'

const { t } = useI18n()

const settings = useDriveSettings()
const enabled = computed(() => settings.data.value?.enabled === true)
const store = computed(() => settings.data.value?.store ?? null)
const choices = useDriveChoices(() => enabled.value && store.value !== null)

const search = ref('')
const shown = computed(() => {
  const wanted = plain(search.value.trim())

  return (choices.data.value?.member ?? []).filter((choice) =>
    plain(choice.ingredientName).includes(wanted),
  )
})

/** Une ligne de résumé : le nombre de produits de secours et de refusés, sans rien dire de ce qui est à zéro. */
function summary(choice: DriveChoice): string {
  if (choice.haveAtHome) return t('driveProducts.haveAtHome')
  const parts: string[] = []
  if (choice.accepted.length > 1)
    parts.push(t('driveProducts.fallbacks', choice.accepted.length - 1))
  if (choice.rejected.length > 0)
    parts.push(t('driveProducts.rejectedCount', choice.rejected.length))

  return parts.join(' · ')
}

const preferred = (choice: DriveChoice) =>
  choice.accepted.find((entry) => entry.rank === 1)?.product.label ??
  choice.accepted[0]?.product.label
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <header class="flex flex-col gap-1">
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t('driveProducts.title') }}
      </h1>
      <p class="text-muted">{{ t('driveProducts.intro') }}</p>
    </header>

    <p v-if="settings.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p
      v-else-if="hasFailed(settings)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>
    <p v-else-if="!enabled" class="text-muted">{{ t('driveProducts.unavailable') }}</p>
    <p v-else-if="store === null" class="text-muted">
      {{ t('driveProducts.noStore') }}
      <RouterLink :to="{ name: 'drive-settings' }" class="font-bold text-primary underline">{{
        t('driveProducts.settings')
      }}</RouterLink>
    </p>
    <p v-else-if="choices.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p
      v-else-if="hasFailed(choices)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>
    <p v-else-if="(choices.data.value?.member ?? []).length === 0" class="text-muted">
      {{ t('driveProducts.none') }}
    </p>

    <template v-else>
      <label
        class="flex min-h-12 items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-surface px-3.5 text-muted focus-within:border-primary"
      >
        <Search class="size-5 shrink-0" aria-hidden="true" />
        <span class="sr-only">{{ t('driveProducts.search') }}</span>
        <input
          v-model="search"
          type="search"
          :placeholder="t('driveProducts.search')"
          class="min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
        />
      </label>

      <p v-if="shown.length === 0" class="text-muted" role="status">
        {{ t('driveProducts.noMatch') }}
      </p>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="choice in shown" :key="choice.ingredientSlug">
          <RouterLink
            :to="{ name: 'drive-product', params: { slug: choice.ingredientSlug } }"
            class="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span class="flex min-w-0 flex-col">
              <span class="text-lg font-bold">{{ choice.ingredientName }}</span>
              <span v-if="!choice.haveAtHome" class="text-sm break-words">{{
                preferred(choice)
                  ? t('driveProducts.preferred', { label: preferred(choice) })
                  : t('driveProducts.nothingAccepted')
              }}</span>
              <span
                v-if="choice.searchQuery"
                data-testid="searched-as"
                class="text-sm break-words text-muted"
                >{{ t('driveProducts.searchedAs', { query: choice.searchQuery }) }}</span
              >
              <span class="text-sm text-muted">{{ summary(choice) }}</span>
            </span>
            <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </template>
  </main>
</template>
