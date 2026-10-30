<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import { useAppUpdateStore } from './appUpdateStore'
import { useAppVersionStore } from './appVersionStore'
import AppUpdateControl from './AppUpdateControl.vue'
import { driveBridge } from './bridge'
import { useAppUpdateAvailable } from './useAppUpdateAvailable'

// L'invitation à mettre à jour l'application (DRV-637), en haut de « Moi » : une phrase et un bouton, rien de plus (ni fenêtre, ni blocage, ni
// avertissement). Seulement dans l'application : dans un navigateur, il n'y a rien à mettre à jour.
//  - Une application qui sait se mettre à jour toute seule (DRV-639, `app.info` : `selfUpdate`) la cherche elle-même ; « Mettre à jour » fait
//    tout, sur place (téléchargement avec progression, vérification, écran d'installation d'Android), sans passer par GitHub ni par Chrome.
//    Elle dit elle-même s'il y a une version plus récente : si elle dit « à jour », rien (même si le serveur croit l'ancienne version).
//  - Une application qui ne le sait pas (ancienne, construction de débogage, Google Play) garde l'ancien comportement : un bouton vers l'aide.
const { t } = useI18n()
const versions = useAppVersionStore()
const updates = useAppUpdateStore()
const inApp = driveBridge.isAvailable()

onMounted(async () => {
  if (!inApp) return
  await versions.read()
  // Une recherche au passage dans « Moi » (l'application la refait au plus toutes les cinq minutes)
  if (versions.selfUpdate) void updates.checkIfDue()
})

const { available: visible } = useAppUpdateAvailable()

/**
 * Ce que l'application a dit ou ce que l'utilisateur a lancé : l'état s'affiche (téléchargement, installation, erreur à réessayer). Sinon, le serveur
 * seul dit qu'une version est publiée : la phrase et le bouton, sans état d'erreur que personne n'a provoqué.
 */
const showControl = computed(() => updates.engaged || updates.offered)
</script>

<template>
  <div
    v-if="visible"
    data-testid="app-update-banner"
    class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3"
  >
    <AppUpdateControl v-if="updates.supported && showControl" variant="secondary" class="w-full" />
    <template v-else-if="updates.supported">
      <p class="font-semibold">{{ t('driveHelp.updateBanner.text') }}</p>
      <UiButton data-testid="app-update-start" variant="secondary" @click="updates.start()">
        {{ t('driveHelp.updateBanner.action') }}
      </UiButton>
    </template>
    <template v-else>
      <p class="font-semibold">{{ t('driveHelp.updateBanner.text') }}</p>
      <UiLinkButton :to="{ name: 'drive-help', hash: '#mise-a-jour' }" variant="secondary">
        {{ t('driveHelp.updateBanner.action') }}
      </UiLinkButton>
    </template>
  </div>
</template>
