<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'

const open = defineModel<boolean>('open', { default: false })

withDefaults(
  defineProps<{
    title: string
    description: string
    confirmLabel: string
    pending?: boolean
    /** `danger` pour une action destructive (par défaut), `primary` pour une action sans retour difficile. */
    variant?: 'danger' | 'primary'
  }>(),
  { variant: 'danger' },
)

const emit = defineEmits<{ confirm: [] }>()

const { t } = useI18n()
</script>

<template>
  <UiDialog v-model:open="open" :title="title" :description="description">
    <div class="flex flex-wrap justify-end gap-2">
      <UiButton variant="ghost" @click="open = false">{{ t('common.cancel') }}</UiButton>
      <UiButton :variant="variant" :disabled="pending" @click="emit('confirm')">{{
        confirmLabel
      }}</UiButton>
    </div>
  </UiDialog>
</template>
