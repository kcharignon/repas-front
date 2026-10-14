<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <h1 class="font-display text-4xl font-bold">{{ t('app.name') }}</h1>
    <p class="mt-2 text-muted">{{ t('app.tagline') }}</p>
  </main>
</template>
