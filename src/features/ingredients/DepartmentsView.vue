<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Search } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import UiImage from '@/design/UiImage.vue'
import IngredientSearchResults from './IngredientSearchResults.vue'
import { MIN_SEARCH_LENGTH, useDepartments } from './queries'
import { useDebounced } from './useDebounced'

const { t } = useI18n()

const departments = useDepartments()
const items = computed(() => departments.data.value?.member ?? [])

// Les résultats remplacent les rayons dès la frappe ; la requête, elle, attend une pause pour ne pas partir à chaque lettre
const search = ref('')
const isSearching = computed(() => search.value.trim().length >= MIN_SEARCH_LENGTH)
const searched = useDebounced(search)
const term = computed(() => searched.value.trim())
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <header>
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t('departments.title') }}
      </h1>
      <p class="mt-1 text-muted">{{ t('departments.help') }}</p>
    </header>

    <label
      class="flex min-h-12 items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-surface px-3.5 text-muted focus-within:border-primary"
    >
      <Search class="size-5 shrink-0" aria-hidden="true" />
      <span class="sr-only">{{ t('departments.search') }}</span>
      <input
        v-model="search"
        type="search"
        maxlength="100"
        autocomplete="off"
        :placeholder="t('departments.search')"
        class="min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
      />
    </label>

    <IngredientSearchResults v-if="isSearching" :search="term" />

    <template v-else>
      <p
        v-if="hasFailed(departments)"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
      >
        {{ t('errors.unreachable') }}
      </p>
      <p v-else-if="departments.isPending.value" class="text-muted" role="status">
        {{ t('common.loading') }}
      </p>
      <p v-else-if="items.length === 0" class="text-muted">{{ t('departments.none') }}</p>

      <ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <li v-for="department in items" :key="department.slug">
          <RouterLink
            :to="{ name: 'department', params: { slug: department.slug } }"
            class="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface p-4 text-center font-bold hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <UiImage :src="department.image" class="size-12" />
            {{ department.name }}
          </RouterLink>
        </li>
      </ul>
    </template>
  </main>
</template>
