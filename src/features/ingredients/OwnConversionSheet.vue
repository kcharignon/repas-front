<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiSheet from '@/design/UiSheet.vue'
import { messageForFailure } from '@/notifications/failures'
import ConversionEquation from './ConversionEquation.vue'
import {
  coefficientOf,
  equationProblem,
  type EquationUnit,
  type EquationValue,
  type StoredConversion,
} from './equationMath'
import { useSaveIngredientConversion } from './queries'

/**
 * La feuille qui écrit UNE conversion propre à un ingrédient de l'utilisateur : « 1 cuillère à soupe = 10 grammes ». Deux entrées la
 * montrent, la ligne d'une recette que le back ne sait pas convertir (« Régler ») et la fiche de l'ingrédient (« Ajouter », « Modifier »).
 * Elle choisit les deux unités parmi toutes, enregistre (`POST` ou `PUT`), et dit en une phrase pourquoi le back refuse (409, 422).
 */
const props = defineProps<{
  ingredientSlug: string
  ingredientName: string
  /** Toutes les unités : n'importe laquelle peut être reliée à n'importe quelle autre. */
  units: EquationUnit[]
  /** Où commence l'équation à l'ouverture : l'unité de départ, celle d'arrivée (vide : à choisir) et les deux nombres. */
  initial: EquationValue
  /** Une modification : l'identifiant de la conversion remplacée ; absent, c'est une nouvelle conversion. */
  conversionId?: string | null
  /** Une modification : la conversion telle qu'elle est enregistrée (l'équation peut être rouverte à l'envers). */
  original?: StoredConversion | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  /** La conversion est enregistrée (la feuille s'est fermée) : l'écran rend le focus à la ligne d'où il vient. */
  saved: []
}>()

const { t } = useI18n()
const save = useSaveIngredientConversion()

const equation = ref<EquationValue>({ ...props.initial })
const submitted = ref(false)
const failure = ref<string | null>(null)

// À chaque ouverture, on repart de l'équation proposée : ce qu'on avait tapé avant d'annuler ne revient pas
watch(open, (value) => {
  if (!value) return
  equation.value = { ...props.initial }
  submitted.value = false
  failure.value = null
})

function sameEquation(a: EquationValue, b: EquationValue): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    String(a.left).trim() === String(b.left).trim() &&
    String(a.right).trim() === String(b.right).trim()
  )
}

function submit() {
  submitted.value = true
  failure.value = null
  // Rouverte à l'envers ou non, une équation que personne n'a touchée ne réécrit rien : ce qui est enregistré garde son sens
  if (props.conversionId && props.original && sameEquation(equation.value, props.initial)) {
    open.value = false
    return
  }
  const coefficient = coefficientOf(equation.value.left, equation.value.right)
  if (equationProblem(equation.value, true) !== null || coefficient === null) return

  save.mutate(
    {
      slug: props.ingredientSlug,
      id: props.conversionId ?? null,
      body: {
        startUnitSlug: equation.value.start,
        endUnitSlug: equation.value.end,
        coefficient,
      },
    },
    {
      onSuccess: () => {
        open.value = false
        emit('saved')
      },
      onError: (error) => {
        failure.value = messageForFailure(error)
      },
    },
  )
}
</script>

<template>
  <UiSheet
    v-model:open="open"
    :title="
      conversionId ? t('ingredients.conversions.editTitle') : t('ingredients.conversions.newTitle')
    "
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <ConversionEquation
        v-model="equation"
        :units="units"
        :ingredient-name="ingredientName"
        :submitted="submitted"
        focus-right
      />

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <div class="flex flex-wrap justify-end gap-2">
        <UiButton variant="ghost" @click="open = false">{{ t('common.cancel') }}</UiButton>
        <UiButton type="submit" :disabled="save.isPending.value">{{ t('common.save') }}</UiButton>
      </div>
    </form>
  </UiSheet>
</template>
