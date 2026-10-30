<script setup lang="ts">
import { Circle, CircleCheck } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import type { Drive } from './drives'
import type { RetailerId } from './retailers'
import { storeTail } from './storeAddress'

// « Où envoyer ta liste ? » (DRV-710) : une tuile par drive configuré, celle qui est présélectionnée est cochée ; la décision de l'écran est le bouton
// « Ouvrir {drive} » plus bas. Le nom du drive vient de la liste des réglages, jamais d'un texte écrit ici.
defineProps<{ drives: readonly Drive[]; selected: RetailerId | undefined }>()
const emit = defineEmits<{ choose: [id: RetailerId] }>()

const { t } = useI18n()
</script>

<template>
  <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
    <legend class="mb-1 font-display text-xl font-bold">{{ t('driveSend.where.title') }}</legend>
    <label
      v-for="drive in drives"
      :key="drive.id"
      class="relative flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line px-3.5 py-2 has-[:checked]:border-primary has-[:checked]:bg-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
    >
      <input
        type="radio"
        name="send-drive"
        :value="drive.id"
        :checked="selected === drive.id"
        class="peer sr-only"
        @change="emit('choose', drive.id)"
      />
      <CircleCheck
        v-if="selected === drive.id"
        class="size-6 shrink-0 text-primary"
        aria-hidden="true"
      />
      <Circle v-else class="size-6 shrink-0 text-muted" aria-hidden="true" />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="text-[17px] font-semibold break-words">{{ drive.name }}</span>
        <span v-if="drive.store" class="text-sm text-muted">{{
          t('driveSend.where.store', { tail: storeTail(drive.store.id) })
        }}</span>
      </span>
    </label>
  </fieldset>
</template>
