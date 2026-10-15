<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  title: string
  description?: string
}>()

const { t } = useI18n()
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/50" />
      <DialogContent
        class="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[85dvh] max-w-md -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-3xl bg-surface p-6 text-ink shadow-xl focus:outline-none"
      >
        <div class="flex items-start justify-between gap-4">
          <DialogTitle class="font-display text-2xl leading-tight font-bold">{{
            title
          }}</DialogTitle>
          <DialogClose
            :aria-label="t('common.close')"
            class="-mt-1 -mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X class="size-5" aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogDescription v-if="description" class="text-muted">{{
          description
        }}</DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
