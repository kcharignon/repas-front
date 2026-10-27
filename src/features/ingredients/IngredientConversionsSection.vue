<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Lock, Pencil, Trash2, TriangleAlert } from 'lucide-vue-next'

import type { IngredientConversion } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import { messageForFailure } from '@/notifications/failures'
import {
  displayOrientation,
  formatDisplayNumber,
  inputNumber,
  unitText,
  type EquationValue,
  type StoredConversion,
} from './equationMath'
import OwnConversionSheet from './OwnConversionSheet.vue'
import { useDeleteIngredientConversion, useIngredientConversions, useUnits } from './queries'

/**
 * « Conversions de la farine » : les conversions PROPRES de l'ingrédient (« 1 tasse = 125 g »), que son propriétaire ajoute, modifie
 * et retire, et dessous, plus discrètes, celles de tout le monde (« 1 kilo = 1 000 g », lecture seule : seul l'administrateur les
 * écrit). Une ligne d'état dit si la recette peut se convertir dans l'unité du magasin. Montrée pour un ingrédient à soi seulement.
 */
const props = defineProps<{ slug: string; name: string }>()

const { t } = useI18n()
const units = useUnits()
const conversions = useIngredientConversions(() => props.slug)
const remove = useDeleteIngredientConversion()

const unitList = computed(() => units.data.value?.member ?? [])
const own = computed(() => conversions.data.value?.member ?? [])
const common = computed(() => conversions.data.value?.common ?? [])

const COMMON_VISIBLE = 3
const showAllCommon = ref(false)
const shownCommon = computed(() =>
  showAllCommon.value ? common.value : common.value.slice(0, COMMON_VISIBLE),
)

// Une unité que la liste des unités ne connaît pas (elle vient d'être retirée) se lit par le nom que la conversion porte
const unitOf = (slug: string, name: string): { name: string; symbol?: string | null } =>
  unitList.value.find((unit) => unit.slug === slug) ?? { name }
const unitName = (slug: string) => unitList.value.find((unit) => unit.slug === slug)?.name ?? slug

// Le sens où une conversion se lit, quel que soit celui où elle est enregistrée : l'unité d'achat à gauche (« 1 bouteille = 30 cl »)
const purchaseSlug = computed(() => conversions.data.value?.purchaseUnitSlug)
const oriented = (conversion: IngredientConversion) =>
  displayOrientation(conversion, purchaseSlug.value)
const nameIn = (conversion: IngredientConversion, slug: string) =>
  slug === conversion.startUnitSlug ? conversion.startUnitName : conversion.endUnitName

/** « 1 bouteille = 30 cl » : le symbole quand l'unité en a un qui dit autre chose que son nom, sinon son nom accordé. */
function line(conversion: IngredientConversion): string {
  const way = oriented(conversion)
  const start = unitOf(way.startSlug, nameIn(conversion, way.startSlug))
  const end = unitOf(way.endSlug, nameIn(conversion, way.endSlug))

  return t('ingredients.conversions.line', {
    start: unitText(start, 1),
    end: `${formatDisplayNumber(way.value)} ${unitText(end, way.value)}`,
  })
}

const failure = ref<string | null>(null)
const addButton = ref<InstanceType<typeof UiButton> | null>(null)

// La feuille : une seule, pour l'ajout comme pour la modification
const sheet = reactive<{
  open: boolean
  id: string | null
  initial: EquationValue
  original: StoredConversion | null
}>({
  open: false,
  id: null,
  initial: { start: '', end: '', left: '1', right: '' },
  original: null,
})

function openAdd() {
  failure.value = null
  sheet.id = null
  sheet.original = null
  // « 1 [unité d'achat] = ? [unité des recettes] » : l'unité d'achat à gauche avec 1, l'unité des recettes à droite, le nombre à dire.
  // Les deux unités sont les mêmes : l'arrivée est à choisir.
  const purchase = conversions.data.value?.purchaseUnitSlug ?? ''
  const cooking = conversions.data.value?.cookingUnitSlug ?? ''
  sheet.initial = {
    start: purchase,
    end: cooking === purchase ? '' : cooking,
    left: '1',
    right: '',
  }
  sheet.open = true
}

function openEdit(conversion: IngredientConversion) {
  failure.value = null
  sheet.id = conversion.id
  // Ce qui est enregistré ne change pas tant que l'équation n'est pas modifiée, même rouverte à l'envers
  sheet.original = {
    startUnitSlug: conversion.startUnitSlug,
    endUnitSlug: conversion.endUnitSlug,
    coefficient: conversion.coefficient,
  }
  const way = oriented(conversion)
  sheet.initial = {
    start: way.startSlug,
    end: way.endSlug,
    left: '1',
    right: inputNumber(way.value),
  }
  sheet.open = true
}

// Retirer : la confirmation nomme la conversion ; un refus du back (elle relie les recettes au magasin) se dit sous la liste
const deleting = ref<IngredientConversion | null>(null)
const confirming = computed({
  get: () => deleting.value !== null,
  set: (value) => {
    if (!value) deleting.value = null
  },
})

// Le bouton de la ligne retirée disparaît avec elle, et la fenêtre de confirmation rend le focus à ce bouton : quand la liste est relue
// et la fenêtre fermée, si le focus est tombé sur la page, il revient à « Ajouter une conversion ».
const refocusAdd = ref(false)
watch(
  () => conversions.isFetching.value,
  async (fetching) => {
    if (fetching || !refocusAdd.value) return
    refocusAdd.value = false
    await nextTick()
    const active = document.activeElement
    if (active === null || active === document.body) addButton.value?.$el.focus()
  },
)

function confirmDelete() {
  const target = deleting.value
  if (target === null) return

  remove.mutate(
    { slug: props.slug, id: target.id },
    {
      onSuccess: () => {
        deleting.value = null
        refocusAdd.value = true
      },
      onError: (error) => {
        deleting.value = null
        failure.value = messageForFailure(error)
      },
    },
  )
}

const convertible = computed(() => conversions.data.value?.convertible !== false)
const purchaseName = computed(() => unitName(conversions.data.value?.purchaseUnitSlug ?? ''))
const cookingName = computed(() => unitName(conversions.data.value?.cookingUnitSlug ?? ''))
</script>

<template>
  <section class="flex flex-col gap-3" :aria-label="t('ingredients.conversions.title', { name })">
    <h2 class="font-display text-2xl font-bold">
      {{ t('ingredients.conversions.title', { name }) }}
    </h2>

    <p v-if="conversions.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p
      v-else-if="conversions.isError.value"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>

    <template v-else>
      <div class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <p v-if="own.length === 0" class="text-muted">{{ t('ingredients.conversions.none') }}</p>
        <ul v-else class="divide-y divide-soft">
          <li
            v-for="conversion in own"
            :key="conversion.id"
            class="flex min-h-14 items-center gap-2 py-1 first:pt-0 last:pb-0"
          >
            <span class="min-w-0 flex-1 text-[17px] font-semibold">{{ line(conversion) }}</span>
            <UiButton
              variant="ghost"
              size="icon"
              class="bg-soft"
              :aria-label="t('ingredients.conversions.editNamed', { line: line(conversion) })"
              @click="openEdit(conversion)"
            >
              <Pencil class="size-5" aria-hidden="true" />
            </UiButton>
            <UiButton
              variant="ghost"
              size="icon"
              class="bg-soft"
              :aria-label="t('ingredients.conversions.removeNamed', { line: line(conversion) })"
              @click="deleting = conversion"
            >
              <Trash2 class="size-5" aria-hidden="true" />
            </UiButton>
          </li>
        </ul>

        <div v-if="common.length > 0" class="flex flex-col gap-1 border-t border-soft pt-3">
          <ul class="flex flex-col gap-1">
            <li
              v-for="conversion in shownCommon"
              :key="conversion.id"
              class="flex items-center gap-2 text-[15px] text-muted"
            >
              <Lock class="size-4 shrink-0" aria-hidden="true" />
              <span>{{ t('ingredients.conversions.universal', { line: line(conversion) }) }}</span>
            </li>
          </ul>
          <button
            v-if="common.length > COMMON_VISIBLE"
            type="button"
            class="min-h-11 self-start rounded-lg px-1 text-sm font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :aria-expanded="showAllCommon"
            @click="showAllCommon = !showAllCommon"
          >
            {{
              showAllCommon
                ? t('ingredients.conversions.showLess')
                : t('ingredients.conversions.showAll')
            }}
          </button>
        </div>
      </div>

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <UiButton ref="addButton" variant="secondary" class="self-start" @click="openAdd">
        {{ t('ingredients.conversions.add') }}
      </UiButton>

      <div aria-live="polite">
        <p
          v-if="convertible"
          class="flex items-center gap-2 text-[15px] font-semibold text-primary"
        >
          <Check class="size-5 shrink-0" aria-hidden="true" />
          {{ t('ingredients.conversions.canConvert', { unit: purchaseName }) }}
        </p>
        <p
          v-else
          class="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[15px] font-semibold text-on-warning-soft"
        >
          <TriangleAlert class="size-5 shrink-0" aria-hidden="true" />
          {{
            t('ingredients.conversions.missing', { cooking: cookingName, purchase: purchaseName })
          }}
        </p>
      </div>
    </template>

    <OwnConversionSheet
      v-model:open="sheet.open"
      :ingredient-slug="slug"
      :ingredient-name="name"
      :units="unitList"
      :initial="sheet.initial"
      :original="sheet.original"
      :conversion-id="sheet.id"
    />

    <UiConfirmDialog
      v-model:open="confirming"
      :title="t('ingredients.conversions.deleteTitle')"
      :description="
        t('ingredients.conversions.deleteHelp', { line: deleting ? line(deleting) : '' })
      "
      :confirm-label="t('common.delete')"
      :pending="remove.isPending.value"
      @confirm="confirmDelete"
    />
  </section>
</template>
