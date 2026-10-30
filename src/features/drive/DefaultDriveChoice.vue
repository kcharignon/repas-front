<script setup lang="ts">
import { Circle, CircleCheck } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Drive } from './drives'
import type { RetailerId } from './retailers'

// « Mon drive habituel » (DRV-709) : un choix parmi les drives où la personne a un magasin, « Aucun » compris. Repas l'utilise alors sans rien
// demander à l'envoi. Il n'existe qu'avec au moins deux drives configurés (avec un seul, il n'y a rien à choisir).
const props = defineProps<{ drives: readonly Drive[]; disabled: boolean }>()
const emit = defineEmits<{ choose: [id: RetailerId | null] }>()

const { t } = useI18n()
const current = computed(() => props.drives.find((drive) => drive.isDefault)?.id ?? '')
const options = computed(() => [
  ...props.drives.map((drive) => ({ value: drive.id as string, label: drive.name })),
  { value: '', label: t('driveSettings.drives.defaultNone') },
])

const choose = (value: string) =>
  emit('choose', props.drives.find((drive) => drive.id === value)?.id ?? null)
</script>

<template>
  <div class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
    <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" :disabled="disabled">
      <legend class="mb-1 font-display text-xl font-bold">
        {{ t('driveSettings.drives.default') }}
      </legend>
      <p class="mb-1 text-sm text-muted">{{ t('driveSettings.drives.defaultHelp') }}</p>
      <label
        v-for="option in options"
        :key="option.value"
        class="relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line px-3.5 py-2 has-[:checked]:border-primary has-[:checked]:bg-soft has-[:disabled]:cursor-default has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
      >
        <input
          type="radio"
          name="default-drive"
          :value="option.value"
          :checked="current === option.value"
          class="peer sr-only"
          @change="choose(option.value)"
        />
        <CircleCheck
          v-if="current === option.value"
          class="size-6 shrink-0 text-primary"
          aria-hidden="true"
        />
        <Circle v-else class="size-6 shrink-0 text-muted" aria-hidden="true" />
        <span class="min-w-0 flex-1 text-[17px] font-semibold break-words">{{ option.label }}</span>
      </label>
    </fieldset>
  </div>
</template>
