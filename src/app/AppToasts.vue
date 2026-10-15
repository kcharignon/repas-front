<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'

import { cn } from '@/design/cn'
import { useNotificationsStore } from '@/notifications/store'

const { t } = useI18n()
const notifications = useNotificationsStore()
</script>

<template>
  <!-- Au-dessus de la barre de navigation mobile ; une erreur s'annonce tout de suite, un succès poliment. -->
  <div
    class="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
  >
    <div
      v-for="item in notifications.items"
      :key="item.id"
      :role="item.kind === 'error' ? 'alert' : 'status'"
      :class="
        cn(
          'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-lg',
          item.kind === 'error' ? 'bg-danger-soft text-on-danger-soft' : 'bg-ink text-bg',
        )
      "
    >
      <span class="flex-1">{{ item.text }}</span>
      <button
        type="button"
        :aria-label="t('common.close')"
        class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-primary"
        @click="notifications.dismiss(item.id)"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
