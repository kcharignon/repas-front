<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiDialog from '@/design/UiDialog.vue'

const open = defineModel<boolean>('open', { default: false })

defineProps<{ title: string; pending?: boolean; error?: string | null }>()

const emit = defineEmits<{ submit: [] }>()

const { t } = useI18n()
</script>

<template>
  <UiDialog v-model:open="open" :title="title" :description="t('admin.formHelp')">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="emit('submit')">
      <slot />
      <p
        v-if="error"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ error }}
      </p>
      <div class="flex flex-wrap justify-end gap-2">
        <UiButton variant="ghost" @click="open = false">{{ t('common.cancel') }}</UiButton>
        <UiButton type="submit" :disabled="pending">{{ t('common.save') }}</UiButton>
      </div>
    </form>
  </UiDialog>
</template>
