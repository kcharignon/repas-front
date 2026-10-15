<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()

const sections = [
  { name: 'admin-units', label: 'admin.units' },
  { name: 'admin-departments', label: 'admin.departments' },
  { name: 'admin-recipe-types', label: 'admin.recipeTypes' },
  { name: 'admin-conversions', label: 'admin.conversions' },
  { name: 'admin-users', label: 'admin.users' },
] as const
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <header>
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t('admin.title') }}
      </h1>
      <p class="mt-1 text-muted">{{ t('admin.help') }}</p>
    </header>
    <ul class="grid gap-3 sm:grid-cols-2">
      <li v-for="section in sections" :key="section.name">
        <RouterLink
          :to="{ name: section.name }"
          class="flex min-h-16 items-center rounded-2xl border border-line bg-surface px-4 text-lg font-bold hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          {{ t(section.label) }}
        </RouterLink>
      </li>
    </ul>
  </main>
</template>
