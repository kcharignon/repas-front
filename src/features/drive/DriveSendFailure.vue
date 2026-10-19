<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UiLinkButton from '@/design/UiLinkButton.vue'

// Ce qui s'est passé, ce qui est sauf, une action (principes-produit.md § 4) : le texte est déjà en trois phrases. Quand l'action est de mettre
// l'application à jour, le bouton qui y mène est ici ; sinon l'action est de toucher de nouveau « Ouvrir le drive », juste au-dessus.
defineProps<{ failure: { text: string; update: boolean } }>()

const { t } = useI18n()
</script>

<template>
  <div
    role="alert"
    class="flex flex-col items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-on-danger-soft"
  >
    <p class="font-semibold">{{ failure.text }}</p>
    <UiLinkButton
      v-if="failure.update"
      variant="secondary"
      :to="{ name: 'drive-help', hash: '#mise-a-jour' }"
    >
      {{ t('driveSend.failure.update') }}
    </UiLinkButton>
  </div>
</template>
