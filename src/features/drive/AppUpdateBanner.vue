<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import UiLinkButton from '@/design/UiLinkButton.vue'
import { useSessionStore } from '@/session/session'
import { offersAppUpdate } from './appVersion'
import { useAppVersionStore } from './appVersionStore'
import { driveBridge } from './bridge'

// L'invitation à mettre à jour l'application (DRV-637), en haut de « Moi » : une phrase et un bouton vers le mode d'emploi, rien de plus (ni
// fenêtre, ni blocage, ni avertissement). Seulement dans l'application : dans un navigateur, il n'y a rien à mettre à jour.
const { t } = useI18n()
const session = useSessionStore()
const versions = useAppVersionStore()
const inApp = driveBridge.isAvailable()

onMounted(() => {
  if (inApp) void versions.read()
})

// Tant que le pont n'a pas répondu, rien : le bandeau n'apparaît pas pour disparaître aussitôt
const visible = computed(
  () =>
    inApp &&
    (versions.status === 'known' || versions.status === 'unknown') &&
    offersAppUpdate(versions.running, session.user?.appUpdate),
)
</script>

<template>
  <div
    v-if="visible"
    data-testid="app-update-banner"
    class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3"
  >
    <p class="font-semibold">{{ t('driveHelp.updateBanner.text') }}</p>
    <UiLinkButton :to="{ name: 'drive-help', hash: '#mise-a-jour' }" variant="secondary">
      {{ t('driveHelp.updateBanner.action') }}
    </UiLinkButton>
  </div>
</template>
