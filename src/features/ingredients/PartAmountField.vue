<script setup lang="ts">
import { useId } from 'vue'

import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'

/**
 * « Combien dans 1 œuf ? » : le nombre de parties qu'une unité de l'ingrédient entier contient, suivi du nom de la partie (« jaune d'œuf »)
 * accordé avec le nombre. Le nombre se tape à la française (virgule ou point) ; c'est l'écran qui le juge.
 */
defineProps<{
  label: string
  /** Ce qui suit le champ : le nom de la partie, accordé. */
  suffix: string
  error?: string | null
}>()

const model = defineModel<string>({ default: '' })

const suffixId = useId()
const described = (describedby: string | undefined) =>
  [describedby, suffixId].filter(Boolean).join(' ')
</script>

<template>
  <UiField :label="label" :error="error" v-slot="{ id, describedby, invalid }">
    <div class="flex items-center gap-3">
      <div class="w-28 shrink-0">
        <UiTextInput
          :id="id"
          v-model="model"
          inputmode="decimal"
          autocomplete="off"
          class="text-center"
          :aria-describedby="described(describedby)"
          :invalid="invalid"
        />
      </div>
      <span :id="suffixId" class="min-w-0 text-base [overflow-wrap:anywhere]">{{ suffix }}</span>
    </div>
  </UiField>
</template>
