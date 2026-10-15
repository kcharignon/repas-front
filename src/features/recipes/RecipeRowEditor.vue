<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2 } from 'lucide-vue-next'

import UiCombobox from '@/design/UiCombobox.vue'
import type { ComboboxOption } from '@/design/UiCombobox.vue'
import UiSelect from '@/design/UiSelect.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useCompatibleUnits } from './queries'

export interface EditableRow {
  key: number
  ingredientSlug: string
  unitSlug: string
  quantity: string | number
}

const row = defineModel<EditableRow>({ required: true })

defineProps<{
  options: ComboboxOption[]
  index: number
  errors: { ingredient?: string; quantity?: string; unit?: string }
}>()

const emit = defineEmits<{ remove: [] }>()

const { t } = useI18n()

const units = useCompatibleUnits(() => row.value.ingredientSlug)

// Le parent possède la ligne : on lui rend une copie modifiée plutôt que de muter l'objet reçu.
const field = <K extends keyof EditableRow>(key: K) =>
  computed({
    get: () => row.value[key],
    set: (value: EditableRow[K]) => {
      row.value = { ...row.value, [key]: value }
    },
  })
const ingredientSlug = field('ingredientSlug')
const quantity = field('quantity')
const unitSlug = field('unitSlug')
const unitList = computed(() => units.data.value?.member ?? [])

// Un ingrédient choisi : si l'unité n'est pas l'une des siennes, on prend la première.
watch(unitList, (list) => {
  if (list.length > 0 && !list.some((unit) => unit.slug === unitSlug.value)) {
    unitSlug.value = list[0]?.slug ?? ''
  }
})
</script>

<template>
  <li
    class="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 md:flex-row md:items-start"
  >
    <div class="flex flex-[3] flex-col gap-1">
      <UiCombobox
        v-model="ingredientSlug"
        :options="options"
        :label="t('editor.ingredientN', { n: index + 1 })"
        :placeholder="t('editor.ingredientPlaceholder')"
        :empty="t('editor.noIngredient')"
        :invalid="Boolean(errors.ingredient)"
      />
      <p v-if="errors.ingredient" class="text-sm font-semibold text-danger">
        {{ errors.ingredient }}
      </p>
    </div>
    <div class="flex flex-1 gap-2">
      <div class="flex flex-1 flex-col gap-1">
        <UiTextInput
          v-model="quantity"
          type="number"
          inputmode="decimal"
          min="0"
          step="any"
          :aria-label="t('editor.quantityN', { n: index + 1 })"
          :invalid="Boolean(errors.quantity)"
        />
        <p v-if="errors.quantity" class="text-sm font-semibold text-danger">
          {{ errors.quantity }}
        </p>
      </div>
      <div class="flex flex-1 flex-col gap-1">
        <UiSelect
          v-model="unitSlug"
          :aria-label="t('editor.unitN', { n: index + 1 })"
          :invalid="Boolean(errors.unit)"
        >
          <option v-if="unitList.length === 0" value="" disabled>{{ t('editor.unit') }}</option>
          <option v-for="unit in unitList" :key="unit.slug" :value="unit.slug">
            {{ unit.name }}
          </option>
        </UiSelect>
        <p v-if="errors.unit" class="text-sm font-semibold text-danger">{{ errors.unit }}</p>
      </div>
      <button
        type="button"
        :aria-label="t('editor.removeRow', { n: index + 1 })"
        class="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
        @click="emit('remove')"
      >
        <Trash2 class="size-5" aria-hidden="true" />
      </button>
    </div>
  </li>
</template>
