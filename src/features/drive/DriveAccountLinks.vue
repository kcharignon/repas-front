<script setup lang="ts">
import { useRetailerI18n } from './useRetailerI18n'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight, Smartphone } from 'lucide-vue-next'

import { useNotificationsStore } from '@/notifications/store'
import { driveBridge } from './bridge'
import { useDriveSettings } from './queries'

// Les entrées du drive dans « Moi » : absentes tant que la fonction n'est pas allumée (ou que la lecture échoue).
const { t } = useRetailerI18n()
const notifications = useNotificationsStore()
const settings = useDriveSettings()
const enabled = computed(() => settings.data.value?.enabled === true)

const entries = [
  { to: 'drive-settings', title: 'driveSettings.entry', help: 'driveSettings.entryHelp' },
  { to: 'drive-products', title: 'driveProducts.entry', help: 'driveProducts.entryHelp' },
] as const

// Le menu de l'application (version, mode d'emploi, « Se déconnecter de Leclerc ») : il n'existe que dans l'application, qui l'ouvre
// quand on le lui demande (`app.menu`, DRV-320). Sans cette entrée, la déconnexion de Leclerc serait inatteignable.
const inApp = driveBridge.isAvailable()

function openAppMenu() {
  try {
    driveBridge.openMenu()
  } catch {
    notifications.push('error', t('driveAccount.appMenuFailed'))
  }
}

const row =
  'flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary'
</script>

<template>
  <section v-if="enabled" class="flex flex-col gap-3">
    <h2 class="font-display text-2xl font-bold">{{ t('driveProducts.drive') }}</h2>
    <RouterLink v-for="entry in entries" :key="entry.to" :to="{ name: entry.to }" :class="row">
      <span class="flex flex-col">
        <span class="text-lg font-bold">{{ t(entry.title) }}</span>
        <span class="text-sm text-muted">{{ t(entry.help) }}</span>
      </span>
      <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
    </RouterLink>
    <button v-if="inApp" type="button" :class="[row, 'w-full text-left']" @click="openAppMenu">
      <span class="flex flex-col">
        <span class="text-lg font-bold">{{ t('driveAccount.appMenu') }}</span>
        <span class="text-sm text-muted">{{ t('driveAccount.appMenuHelp') }}</span>
      </span>
      <Smartphone class="size-5 shrink-0 text-muted" aria-hidden="true" />
    </button>
    <!-- Les conditions d'utilisation du drive (DRV-628) : un lien discret, jamais imposé -->
    <RouterLink
      :to="{ name: 'drive-terms' }"
      class="inline-flex min-h-11 items-center self-start text-sm text-muted underline hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('driveTerms.link') }}
    </RouterLink>
  </section>
</template>
