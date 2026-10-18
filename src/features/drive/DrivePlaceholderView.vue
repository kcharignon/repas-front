<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UiLinkButton from '@/design/UiLinkButton.vue'

// Page d'attente : l'aide d'installation (DRV-316) remplacera cette vue ; la route existe déjà pour que l'écran d'envoi et les
// réglages puissent y mener.
defineProps<{ topic: 'help' }>()

const { t } = useI18n()
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col items-start gap-4 px-4 py-6">
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t(`drivePlaceholder.${topic}.title`) }}
    </h1>
    <p class="max-w-md text-muted">{{ t(`drivePlaceholder.${topic}.soon`) }}</p>
    <UiLinkButton variant="secondary" :to="{ name: 'shopping-list' }">
      {{ t('drivePlaceholder.back') }}
    </UiLinkButton>
  </main>
</template>
