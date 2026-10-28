<script setup lang="ts">
import { WifiOff } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import SeasonArt from '@/design/season/SeasonArt.vue'
import { useOnline } from '@/offline/useOnline'

const { t } = useI18n()
const online = useOnline()
</script>

<template>
  <p
    v-if="!online"
    role="status"
    class="flex items-center gap-2.5 bg-soft px-4 py-2.5 text-sm font-semibold text-ink"
  >
    <!-- En saison, la pièce de la saison tient la place de l'icône (ADR 0012) ; sans elle (jamais chargée, hors connexion), l'icône reste -->
    <SeasonArt name="offline" class="size-8">
      <WifiOff class="size-5 shrink-0 text-primary" aria-hidden="true" />
    </SeasonArt>
    {{ t('offline.banner') }}
  </p>
</template>
