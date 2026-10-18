<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import UiLinkButton from '@/design/UiLinkButton.vue'

// Page d'attente : les réglages du drive (DRV-403) et l'aide d'installation (DRV-316) remplacent chacune cette vue ; les routes
// existent déjà pour que l'écran d'envoi puisse y mener.
defineProps<{ topic: 'settings' | 'help' }>()

const { t } = useI18n()
const route = useRoute()
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col items-start gap-4 px-4 py-6">
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t(`drivePlaceholder.${topic}.title`) }}
    </h1>
    <p
      v-if="topic === 'settings' && route.query.magasin === 'requis'"
      role="status"
      class="max-w-md rounded-xl bg-soft px-4 py-3 font-semibold"
    >
      {{ t('drivePlaceholder.settings.storeRequired') }}
    </p>
    <p class="max-w-md text-muted">{{ t(`drivePlaceholder.${topic}.soon`) }}</p>
    <UiLinkButton variant="secondary" :to="{ name: 'shopping-list' }">
      {{ t('drivePlaceholder.back') }}
    </UiLinkButton>
  </main>
</template>
