<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { imageUrl } from '@/features/shopping-lists/format'
import { useDepartments } from './queries'

const { t } = useI18n()

const departments = useDepartments()
const items = computed(() => departments.data.value?.member ?? [])
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <header>
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t('departments.title') }}
      </h1>
      <p class="mt-1 text-muted">{{ t('departments.help') }}</p>
    </header>

    <p
      v-if="departments.isError.value"
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
          <img :src="imageUrl(department.image)" alt="" class="size-12 object-contain" />
          {{ department.name }}
        </RouterLink>
      </li>
    </ul>
  </main>
</template>
