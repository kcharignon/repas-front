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

/**
 * Une feuille : le dialogue du bas sur téléphone (posé au bord de l'écran, le pouce l'atteint), centré à partir de la tablette. Mêmes
 * garanties que `UiDialog` (focus piégé, retour du focus, Échap), pour une suite de choix ou une confirmation qui tient dans le geste.
 */
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
        :aria-describedby="description ? undefined : ''"
        class="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-xl focus:outline-none md:inset-x-4 md:top-1/2 md:bottom-auto md:max-h-[85dvh] md:max-w-md md:-translate-y-1/2 md:rounded-3xl md:border md:p-6"
      >
        <span class="mx-auto -mt-2 h-1.5 w-11 rounded-full bg-line md:hidden" aria-hidden="true" />
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
        <DialogDescription v-if="description" class="-mt-2 text-muted">{{
          description
        }}</DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
