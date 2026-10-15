<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
</script>

<template>
  <main
    class="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6 py-10"
  >
    <p class="font-display text-6xl leading-none font-bold text-primary" aria-hidden="true">404</p>
    <h1 class="font-display text-3xl leading-tight font-bold">{{ t('notFound.title') }}</h1>
    <p class="text-muted">{{ t('notFound.help') }}</p>
    <RouterLink
      :to="{ name: 'home' }"
      class="inline-flex min-h-13 items-center rounded-2xl bg-primary px-6 font-bold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('notFound.back') }}
    </RouterLink>
  </main>
</template>
