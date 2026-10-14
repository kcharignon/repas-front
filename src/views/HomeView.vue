<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useSessionStore } from '@/session/session'

const { t } = useI18n()
const session = useSessionStore()
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <p class="text-sm font-bold text-primary">{{ t('app.name') }}</p>
    <h1 class="font-display text-4xl leading-tight font-bold">
      {{ t('home.welcome', { email: session.user?.email ?? '' }) }}
    </h1>
    <p class="mt-2 text-muted">{{ t('app.tagline') }}</p>
  </main>
</template>
