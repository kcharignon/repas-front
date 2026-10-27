<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import UiSelect from '@/design/UiSelect.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import {
  coefficientOf,
  equationProblem,
  formatNumber,
  parseNumber,
  quantityLabel,
  unitLabel,
  type EquationUnit,
  type EquationValue,
} from './equationMath'

/**
 * L'équation d'une conversion, que l'on modifie elle-même : `[nombre] [unité] = [nombre] [unité]`, et dessous la phrase qui la
 * redit à chaque frappe (« 1 tasse = 0,125 kilo, et 1 kilo = 8 tasses. »). Les noms d'unités s'accordent avec le nombre. Le
 * coefficient du back est `droite ÷ gauche` (`coefficientOf`) : le composant n'envoie rien, l'écran qui l'héberge le lit.
 * Quand une seule unité est permise d'un côté (la fiche d'un ingrédient a déjà choisi la sienne), elle est écrite, pas choisie.
 */
const props = defineProps<{
  /** Toutes les unités connues : proposées des deux côtés, sauf si `startUnits` / `endUnits` restreignent un côté. */
  units: EquationUnit[]
  startUnits?: EquationUnit[]
  endUnits?: EquationUnit[]
  /** Le nom de l'ingrédient, devant la phrase (administration : rien). */
  ingredientName?: string
  /** L'écran a essayé d'enregistrer : un nombre encore vide devient une erreur. */
  submitted?: boolean
}>()

const model = defineModel<EquationValue>({ required: true })

const { t } = useI18n()

const startList = computed(() => props.startUnits ?? props.units)
const endList = computed(() => props.endUnits ?? props.units)
const swappable = computed(() => startList.value.length > 1 && endList.value.length > 1)

function find(slug: string): EquationUnit | undefined {
  return [...startList.value, ...endList.value, ...props.units].find((unit) => unit.slug === slug)
}
const startUnit = computed(() => find(model.value.start))
const endUnit = computed(() => find(model.value.end))

// Les noms s'accordent avec ce qui est écrit : « 8 tasses », « 1 kilo » (un champ vide ou faux compte pour 1)
const leftQuantity = computed(() => parseNumber(model.value.left) ?? 1)
const rightQuantity = computed(() => parseNumber(model.value.right) ?? 1)
const startLabel = (unit: EquationUnit) => unitLabel(unit.name, leftQuantity.value)
const endLabel = (unit: EquationUnit) => unitLabel(unit.name, rightQuantity.value)

function update(patch: Partial<EquationValue>) {
  model.value = { ...model.value, ...patch }
}
function swap() {
  const { start, end, left, right } = model.value
  model.value = { start: end, end: start, left: right, right: left }
}

const problem = computed(() => equationProblem(model.value, props.submitted === true))
const problemText = computed(() => {
  if (problem.value === 'sameUnit') return t('conversion.errors.sameUnit')
  if (problem.value !== null) return t('conversion.errors.number')

  return null
})

// La phrase ramène l'équation à « 1 unité de départ » (ce que le back garde) et la redit dans l'autre sens
const sentence = computed(() => {
  const start = startUnit.value
  const end = endUnit.value
  const coefficient = coefficientOf(model.value.left, model.value.right)
  if (start === undefined || end === undefined || coefficient === null || start.slug === end.slug)
    return null

  const reverse = 1 / coefficient
  const values = {
    start: start.name,
    end: quantityLabel(coefficient, end.name),
    reverseStart: end.name,
    reverseEnd: formatNumber(reverse) === '0' ? '…' : quantityLabel(reverse, start.name),
  }

  return props.ingredientName
    ? t('conversion.sentenceNamed', { ...values, name: capitalized(props.ingredientName) })
    : t('conversion.sentence', values)
})

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
</script>

<template>
  <div
    role="group"
    :aria-label="t('conversion.legend')"
    class="flex flex-col gap-2 rounded-2xl bg-soft p-3.5"
  >
    <div class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <UiTextInput
        :model-value="model.left"
        :aria-label="t('conversion.startQuantity')"
        :invalid="problem === 'left'"
        inputmode="decimal"
        autocomplete="off"
        class="text-center text-xl font-bold"
        @update:model-value="update({ left: $event })"
      />
      <UiSelect
        v-if="startList.length > 1"
        :model-value="model.start"
        :aria-label="t('conversion.startUnit')"
        :invalid="problem === 'sameUnit'"
        @update:model-value="update({ start: $event })"
      >
        <option v-for="unit in startList" :key="unit.slug" :value="unit.slug">
          {{ startLabel(unit) }}
        </option>
      </UiSelect>
      <span v-else class="text-lg font-semibold">{{ startUnit ? startLabel(startUnit) : '' }}</span>
    </div>

    <div class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2" aria-hidden="true">
      <span class="text-center font-display text-2xl leading-none font-bold text-primary">=</span>
    </div>

    <div class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <UiTextInput
        :model-value="model.right"
        :aria-label="t('conversion.endQuantity')"
        :invalid="problem === 'right'"
        inputmode="decimal"
        autocomplete="off"
        class="text-center text-xl font-bold"
        @update:model-value="update({ right: $event })"
      />
      <UiSelect
        v-if="endList.length > 1"
        :model-value="model.end"
        :aria-label="t('conversion.endUnit')"
        :invalid="problem === 'sameUnit'"
        @update:model-value="update({ end: $event })"
      >
        <option v-for="unit in endList" :key="unit.slug" :value="unit.slug">
          {{ endLabel(unit) }}
        </option>
      </UiSelect>
      <span v-else class="text-lg font-semibold">{{ endUnit ? endLabel(endUnit) : '' }}</span>
    </div>

    <button
      v-if="swappable"
      type="button"
      class="min-h-11 self-start rounded-lg px-1 text-sm font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="swap"
    >
      {{ t('conversion.swap') }}
    </button>

    <div aria-live="polite" class="text-sm leading-snug">
      <p
        v-if="problemText"
        class="rounded-lg bg-danger-soft px-3 py-2 font-semibold text-on-danger-soft"
      >
        {{ problemText }}
      </p>
      <p v-else-if="sentence" class="font-medium text-ink">{{ sentence }}</p>
      <p v-else class="text-muted">{{ t('conversion.waiting') }}</p>
    </div>
  </div>
</template>
