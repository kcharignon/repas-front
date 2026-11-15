<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { computed, ref } from 'vue'
import { Check, ChevronDown, Plus } from 'lucide-vue-next'

import { cn } from './cn'
import DepartmentMarker from './DepartmentMarker.vue'

export interface ComboboxOption {
  value: string
  label: string
  /** Le repère du rayon (ING-017), devant le nom ; rien si absent ou inconnu. */
  icon?: string | null
  /** Une ligne grise sous le nom (le rayon d'un ingrédient dont le nom existe dans un autre rayon) ; elle fait partie de ce que lit un lecteur d'écran. */
  hint?: string
}

const props = defineProps<{
  options: ComboboxOption[]
  label: string
  placeholder?: string
  empty: string
  invalid?: boolean
  /** Rien à lister : l'appelant montre lui-même l'issue (ajouter l'ingrédient), la liste ne s'ouvre pas. */
  hideEmpty?: boolean
  /** L'appelant a déjà filtré et classé `options` (recherche souple) : la liste ne refiltre pas ce qui est tapé. */
  ignoreFilter?: boolean
  /** Une dernière ligne « créer » sous les choix (jamais un choix de plus : elle ne change pas la valeur) ; absente, rien n'est proposé. */
  createLabel?: string
}>()

const emit = defineEmits<{ create: [] }>()

const model = defineModel<string>({ default: '' })
/** Le texte du champ (ce qui est tapé, ou le nom de l'option choisie) : l'appelant peut proposer d'ajouter ce qu'aucune option ne porte. */
const searchTerm = defineModel<string>('searchTerm', { default: '' })

// Au moins une option a son repère : celles qui n'en ont pas gardent la place, les noms restent alignés
const anyIcon = computed(() => props.options.some((option) => option.icon != null))

// La ligne « créer » est une vraie ligne de la liste (flèches, Entrée, doigt) mais n'est pas un choix : la valeur ne bouge pas, la liste se referme
const CREATE_VALUE = '__create__'
const open = ref(false)
function onCreate(event: Event) {
  event.preventDefault()
  open.value = false
  emit('create')
}

const labelOf = (value: string) =>
  props.options.find((option) => option.value === value)?.label ?? ''
</script>

<template>
  <ComboboxRoot v-model="model" v-model:open="open" :ignore-filter="ignoreFilter" class="relative">
    <ComboboxAnchor
      :class="
        cn(
          'flex min-h-12 items-center rounded-xl border-[1.5px] bg-surface pr-1 pl-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
          invalid ? 'border-2 border-danger' : 'border-line',
        )
      "
    >
      <ComboboxInput
        v-model="searchTerm"
        :aria-label="label"
        :placeholder="placeholder"
        :display-value="(value) => labelOf(String(value ?? ''))"
        class="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
      />
      <ComboboxTrigger
        :aria-label="label"
        class="flex size-10 shrink-0 cursor-pointer items-center justify-center text-muted"
      >
        <ChevronDown class="size-5" aria-hidden="true" />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal v-if="!hideEmpty">
      <ComboboxContent
        position="popper"
        :side-offset="4"
        class="z-50 max-h-64 w-(--reka-combobox-trigger-width) overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
      >
        <ComboboxViewport class="p-1">
          <ComboboxEmpty class="px-3 py-3 text-sm text-muted">{{ empty }}</ComboboxEmpty>
          <ComboboxItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :text-value="option.label"
            :class="
              cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-base text-ink data-[highlighted]:bg-soft',
                option.hint ? 'min-h-14' : 'min-h-11',
              )
            "
          >
            <span class="flex min-w-0 items-center gap-3">
              <DepartmentMarker :icon="option.icon" size="md" :reserve="anyIcon" />
              <span class="flex min-w-0 flex-col">
                <span>{{ option.label }}</span>
                <span v-if="option.hint" class="text-sm text-muted">{{ option.hint }}</span>
              </span>
            </span>
            <Check v-if="option.value === model" class="size-4 text-primary" aria-hidden="true" />
          </ComboboxItem>
          <ComboboxItem
            v-if="createLabel"
            :value="CREATE_VALUE"
            :text-value="createLabel"
            data-testid="create-ingredient-option"
            class="mt-1 flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-t border-line px-3 text-base font-semibold text-primary data-[highlighted]:bg-soft"
            @select="onCreate"
          >
            <Plus class="size-5" aria-hidden="true" />
            <span>{{ createLabel }}</span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
    <slot name="below" />
  </ComboboxRoot>
</template>
