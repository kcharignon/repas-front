<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppUpdateControl from './AppUpdateControl.vue'
import InstallApp from './InstallApp.vue'
import { useAppUpdateStore } from './appUpdateStore'
import { useAppVersionStore } from './appVersionStore'
import { driveBridge } from './bridge'

// La page de l'application Android (DRV-316), réduite à l'essentiel. Dans l'application : la version installée et UN bouton, « Mettre à jour »,
// qui fait tout sans passer par GitHub (DRV-639) ; une application qui ne sait pas encore se mettre à jour toute seule (ancienne, construction de
// débogage) garde le téléchargement à la main. Dans un navigateur, la route mène à la page publique `/installer` (`router/index.ts`) ; si
// la vue est montée quand même, elle montre la même chose. Le mode d'emploi détaillé et le dépannage sont dans `android/README.md`.
// Aucune donnée du back ; les textes sont dans `driveHelp` et `install` (fr.ts).
const { t } = useI18n()
const versions = useAppVersionStore()
const updates = useAppUpdateStore()

const inApp = driveBridge.isAvailable()
const version = ref<string | null>(null)

onMounted(async () => {
  if (!inApp) return
  // L'application donne sa version ; si elle ne répond pas, la page s'en passe
  version.value = await versions.read()
  // Une application qui sait se mettre à jour cherche elle-même s'il y a une version plus récente
  if (versions.selfUpdate) void updates.check()
})
</script>

<template>
  <!-- L'identifiant « mise-a-jour » reste l'ancre des liens qui mènent ici pour mettre à jour -->
  <main
    id="mise-a-jour"
    tabindex="-1"
    class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 outline-none"
  >
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t(inApp ? 'driveHelp.titleInApp' : 'driveHelp.title') }}
    </h1>
    <p v-if="inApp && version !== null" class="rounded-xl bg-soft px-4 py-3 font-semibold">
      {{ t('driveHelp.version', { version }) }}
    </p>
    <AppUpdateControl v-if="inApp && updates.supported" class="max-w-prose" />
    <InstallApp v-else class="max-w-prose" />
  </main>
</template>
