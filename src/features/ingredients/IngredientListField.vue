<script setup lang="ts">
import { Circle, CircleCheck } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ListType } from '@/api'
import { FOLLOW_DEPARTMENT, MAIN_LIST } from './listChoice'

// « Liste de courses » d'un produit (LST-007) : où il va quand on l'ajoute. Comme son rayon (par défaut), la liste principale, ou un type.
const props = defineProps<{
  modelValue: string
  types: readonly ListType[]
  /** Le type du rayon que le produit a dans le formulaire, ou `null` quand ce rayon n'est dans aucun type. */
  departmentTypeId: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()

const typeName = (id: string | null) => props.types.find((type) => type.id === id)?.name ?? null
// La liste où irait le produit en suivant son rayon : le nom du type du rayon, sinon la liste principale
const followedList = computed(() => typeName(props.departmentTypeId) ?? t('listTypes.main'))

const options = computed(() => [
  { value: FOLLOW_DEPARTMENT, label: t('ingredients.list.follow'), detail: followedList.value },
  { value: MAIN_LIST, label: t('listTypes.main'), detail: null },
  ...props.types.map((type) => ({ value: type.id, label: type.name, detail: null })),
])

const help = computed(() => {
  // Dans une phrase, la liste principale s'écrit en minuscules, avec son article
  if (props.modelValue === FOLLOW_DEPARTMENT)
    return t('ingredients.list.helpFollow', {
      list: typeName(props.departmentTypeId) ?? t('ingredients.list.theMain'),
    })
  if (props.modelValue === MAIN_LIST) return t('ingredients.list.helpMain')

  return t('ingredients.list.helpType', { list: typeName(props.modelValue) ?? '' })
})
</script>

<template>
  <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" data-testid="list-field">
    <legend class="mb-1 text-[15px] font-bold">{{ t('ingredients.list.label') }}</legend>
    <label
      v-for="option in options"
      :key="option.value"
      class="relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line px-3.5 py-2 has-[:checked]:border-primary has-[:checked]:bg-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
    >
      <input
        type="radio"
        name="ingredient-list"
        :value="option.value"
        :checked="modelValue === option.value"
        class="peer sr-only"
        @change="emit('update:modelValue', option.value)"
      />
      <CircleCheck
        v-if="modelValue === option.value"
        class="size-6 shrink-0 text-primary"
        aria-hidden="true"
      />
      <Circle v-else class="size-6 shrink-0 text-muted" aria-hidden="true" />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="text-[17px] font-semibold break-words">{{ option.label }}</span>
        {{ ' ' }}
        <span v-if="option.detail" class="text-sm text-muted break-words">{{ option.detail }}</span>
      </span>
    </label>
    <p class="text-sm text-muted">{{ help }}</p>
  </fieldset>
</template>
