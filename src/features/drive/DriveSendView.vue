<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import UiLinkButton from '@/design/UiLinkButton.vue'

// Squelette : l'écran d'envoi au drive est rempli par DRV-404 (module `driveBridge`, DRV-402).
const { t } = useI18n()
const route = useRoute()
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col items-start gap-4 px-4 py-6">
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t('driveSend.title') }}
    </h1>
    <p class="max-w-md text-muted">{{ t('driveSend.soon') }}</p>
    <UiLinkButton
      variant="secondary"
      :to="{ name: 'shopping-list-detail', params: { id: String(route.params.listId) } }"
    >
      {{ t('driveSend.back') }}
    </UiLinkButton>
  </main>
</template>
