<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

import { useDriveSettings } from './queries'

// Les entrées du drive dans « Mon compte » : absentes tant que la fonction n'est pas allumée (ou que la lecture échoue).
const { t } = useI18n()
const settings = useDriveSettings()
const enabled = computed(() => settings.data.value?.enabled === true)
</script>

<template>
  <section v-if="enabled" class="flex flex-col gap-3">
    <h2 class="font-display text-2xl font-bold">{{ t('driveProducts.drive') }}</h2>
    <RouterLink
      :to="{ name: 'drive-products' }"
      class="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span class="flex flex-col">
        <span class="text-lg font-bold">{{ t('driveProducts.entry') }}</span>
        <span class="text-sm text-muted">{{ t('driveProducts.entryHelp') }}</span>
      </span>
      <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
    </RouterLink>
  </section>
</template>
