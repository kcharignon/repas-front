<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import UiButton from '@/design/UiButton.vue'

defineProps<{ title: string; loading?: boolean; failed?: boolean; createLabel?: string }>()

const emit = defineEmits<{ create: [] }>()

const { t } = useI18n()
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <RouterLink :to="{ name: 'admin' }" class="self-start font-bold text-primary underline">
      {{ t('admin.title') }}
    </RouterLink>
    <header class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">{{ title }}</h1>
      <UiButton v-if="createLabel" @click="emit('create')">{{ createLabel }}</UiButton>
    </header>

    <p
      v-if="failed"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>
    <p v-else-if="loading" class="text-muted" role="status">{{ t('common.loading') }}</p>
    <slot v-else />
  </main>
</template>
