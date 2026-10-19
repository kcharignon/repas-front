<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { APP_RELEASES_URL } from './appInstall'
import { driveBridge } from './bridge'

// La page de l'application Android (DRV-316), réduite à l'essentiel : dans l'application, la version installée et un bouton vers la
// page des versions sur GitHub ; dans un navigateur, la même chose et trois courtes étapes. Le mode d'emploi détaillé et le dépannage
// sont dans `android/README.md`. Aucune donnée du back ; les textes sont dans `driveHelp` (fr.ts).
const { t } = useI18n()

const inApp = driveBridge.isAvailable()
const version = ref<string | null>(null)

const steps = ['download', 'open', 'install'] as const

onMounted(() => {
  if (!inApp) return
  // L'application donne sa version ; si elle ne répond pas, la page s'en passe
  driveBridge.info().then(
    (info) => (version.value = info.version),
    () => undefined,
  )
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
    <p v-if="!inApp" class="max-w-prose text-muted">{{ t('driveHelp.intro') }}</p>
    <ol v-if="!inApp" class="flex max-w-prose list-decimal flex-col gap-3 pl-6">
      <li v-for="step in steps" :key="step">{{ t(`driveHelp.steps.${step}`) }}</li>
    </ol>
    <a
      :href="APP_RELEASES_URL"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('driveHelp.downloadFor')"
      class="flex min-h-11 w-fit items-center justify-center rounded-xl bg-primary px-5 font-bold text-on-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('driveHelp.download') }}
    </a>
  </main>
</template>
