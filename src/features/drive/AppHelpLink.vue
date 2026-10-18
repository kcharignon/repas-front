<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

import { driveBridge } from './bridge'

// L'entrée « Application Android » de « Mon compte » (DRV-316) : toujours là, drive allumé ou non, car l'application contient tout Repas.
// Dans un navigateur elle propose d'installer l'application ; dans l'application elle-même, installer n'aurait pas de sens : elle mène à la
// rubrique « Mettre à jour l'application » de la même page d'aide.
const { t } = useI18n()
const inApp = driveBridge.isAvailable()
const to = inApp ? { name: 'drive-help', hash: '#mise-a-jour' } : { name: 'drive-help' }
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="font-display text-2xl font-bold">{{ t('driveHelp.entry.title') }}</h2>
    <RouterLink
      :to="to"
      class="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span class="flex flex-col">
        <span class="text-lg font-bold">
          {{ t(inApp ? 'driveHelp.entry.updateLink' : 'driveHelp.entry.link') }}
        </span>
        <span class="text-sm text-muted">
          {{ t(inApp ? 'driveHelp.entry.updateHelp' : 'driveHelp.entry.help') }}
        </span>
      </span>
      <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
    </RouterLink>
  </section>
</template>
