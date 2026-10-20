<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { APP_APK_URL } from './appInstall'

// Installer l'application à la main (DRV-639), le plus court possible pour des proches qui ne sont pas à l'aise : un gros bouton qui
// télécharge l'APK de la dernière version, puis trois étapes. Servi par la page publique `/installer` et, dans une application qui ne sait
// pas encore se mettre à jour toute seule, par la page d'aide.
const { t } = useI18n()

const steps = ['open', 'allow', 'install'] as const
</script>

<template>
  <div class="flex flex-col gap-6">
    <a
      :href="APP_APK_URL"
      rel="noopener noreferrer"
      data-testid="install-download"
      class="flex min-h-14 w-full items-center justify-center rounded-2xl bg-primary px-6 text-xl font-bold text-on-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('install.download') }}
    </a>
    <ol class="flex list-decimal flex-col gap-3 pl-6 text-lg">
      <li v-for="step in steps" :key="step">{{ t(`install.steps.${step}`) }}</li>
    </ol>
  </div>
</template>
