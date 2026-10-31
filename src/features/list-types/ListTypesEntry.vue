<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

// L'entrée « Types de liste » de « Moi » (LST-006) : toujours là, même pour un compte sans type (c'est par elle qu'on en crée un).
const { t } = useI18n()
</script>

<template>
  <RouterLink
    :to="{ name: 'list-types' }"
    class="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
  >
    <span class="flex flex-col">
      <span class="text-lg font-bold">{{ t('listTypes.entry') }}</span>
      <span class="text-sm text-muted">{{ t('listTypes.entryHelp') }}</span>
    </span>
    <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
  </RouterLink>
</template>
