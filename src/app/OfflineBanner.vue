<script setup lang="ts">
import { WifiOff } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

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
    <WifiOff class="size-5 shrink-0 text-primary" aria-hidden="true" />
    {{ t('offline.banner') }}
  </p>
</template>
