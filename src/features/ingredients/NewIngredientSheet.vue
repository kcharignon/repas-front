<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check } from 'lucide-vue-next'

import { capitalizeFirst } from '@/design/capitalizeFirst'
import DepartmentMarker from '@/design/DepartmentMarker.vue'
import UiButton from '@/design/UiButton.vue'
import UiChip from '@/design/UiChip.vue'
import UiField from '@/design/UiField.vue'
import UiSelect from '@/design/UiSelect.vue'
import UiSheet from '@/design/UiSheet.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useIngredientOptions } from '@/features/recipes/queries'
import { messageForFailure } from '@/notifications/failures'
import { useDepartmentIcons } from './departmentMarkers'
import { nameUsedMessage, sameNameElsewhere, sameNameInDepartment } from './nameUsed'
import { useDepartments, useSaveIngredient, useUnits } from './queries'

/**
 * « Nouvel ingrédient » (ING-017) : créer un ingrédient sans quitter la recette. Un nom (celui qu'on cherchait, modifiable), un rayon
 * (jamais deviné : on le choisit), une unité (la même pour l'achat et pour la cuisine, comme la création à la voix : aucune conversion
 * à écrire). Le bouton crée l'ingrédient par la création existante (`POST /api/v1/ingredients`) puis le rend à l'appelant, qui le
 * choisit dans sa ligne : l'état de la recette n'est ni quitté ni rechargé.
 */
const props = defineProps<{ name: string }>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [
    ingredient: {
      slug: string
      name: string
      departmentSlug: string
      departmentName: string
      unitSlug: string
    },
  ]
  closeAutoFocus: [event: Event]
}>()

const { t } = useI18n()
const departments = useDepartments()
const units = useUnits(() => open.value)
const options = useIngredientOptions()
const save = useSaveIngredient()
const { anyIcon } = useDepartmentIcons()

const departmentLabel = useId()
const unitLabel = useId()
const groupName = useId()
const formElement = ref<HTMLFormElement | null>(null)

const form = ref({ name: '', departmentSlug: '', unitSlug: '' })
const showOthers = ref(false)
const submitted = ref(false)
const failure = ref<string | null>(null)

// À chaque ouverture on repart de zéro : le nom cherché, aucun rayon, l'unité la plus courante
watch(open, (value) => {
  if (!value) return
  form.value = { name: capitalizeFirst(props.name), departmentSlug: '', unitSlug: '' }
  showOthers.value = false
  submitted.value = false
  failure.value = null
})

const departmentList = computed(() => departments.data.value?.member ?? [])
const markers = computed(() => anyIcon(departmentList.value.map((department) => department.slug)))
const unitList = computed(() => units.data.value?.member ?? [])

// Les unités qu'on a sous la main : les plus courantes d'abord, dans cet ordre ; les autres sont derrière « Autre »
const COMMON_UNITS = ['gramme', 'kilo', 'millilitre', 'litre', 'unite']
const commonUnits = computed(() => {
  const common = COMMON_UNITS.flatMap((slug) => unitList.value.filter((unit) => unit.slug === slug))

  return common.length > 0 ? common : unitList.value.slice(0, 5)
})
const chosenUnit = computed(() => form.value.unitSlug || commonUnits.value[0]?.slug || '')
const otherChosen = computed(
  () =>
    chosenUnit.value !== '' && !commonUnits.value.some((unit) => unit.slug === chosenUnit.value),
)
const othersVisible = computed(() => showOthers.value || otherChosen.value)
// Le symbole quand il y en a un (g, kg, ml, l), sinon le nom (unité) ; le nom entier reste dans le nom accessible
const shortLabel = (unit: { name: string; symbol: string }) => unit.symbol || unit.name

const departmentName = (slug: string) =>
  departmentList.value.find((department) => department.slug === slug)?.name ?? ''
const trimmedName = computed(() => form.value.name.trim())

// Le même nom dans le même rayon : le back refusera, on le dit tout de suite ; dans un autre rayon : permis, on l'informe
const clash = computed(() =>
  sameNameInDepartment(
    options.data.value?.member ?? [],
    trimmedName.value,
    form.value.departmentSlug,
  ),
)
const elsewhere = computed(() =>
  sameNameElsewhere(options.data.value?.member ?? [], trimmedName.value, form.value.departmentSlug),
)
const clashText = computed(() =>
  clash.value === null
    ? null
    : t('ingredients.nameUsed', {
        name: clash.value.name,
        department: departmentName(form.value.departmentSlug),
      }),
)
const elsewhereText = computed(() =>
  elsewhere.value === null
    ? null
    : t('ingredients.nameElsewhere', {
        name: elsewhere.value.name,
        department: elsewhere.value.departmentName,
        chosen: departmentName(form.value.departmentSlug),
      }),
)

const errors = computed(() => ({
  name: submitted.value && trimmedName.value === '' ? t('newIngredient.errors.name') : undefined,
  department:
    submitted.value && form.value.departmentSlug === ''
      ? t('newIngredient.errors.department')
      : undefined,
  unit: submitted.value && chosenUnit.value === '' ? t('newIngredient.errors.unit') : undefined,
}))

function focusFirstProblem() {
  void nextTick(() => {
    const target = formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]')
    // Le groupe de rayons n'est pas focalisable lui-même : son premier choix l'est
    ;(target?.getAttribute('role') === 'radiogroup'
      ? target.querySelector<HTMLElement>('input')
      : target
    )?.focus()
  })
}

function submit() {
  submitted.value = true
  failure.value = null
  if (trimmedName.value === '' || form.value.departmentSlug === '' || chosenUnit.value === '') {
    focusFirstProblem()
    return
  }
  // Un nom déjà pris dans ce rayon : rien n'est envoyé, le message est déjà là
  if (clash.value !== null) return

  const department = form.value.departmentSlug
  const unit = chosenUnit.value
  save.mutate(
    {
      slug: null,
      form: {
        name: trimmedName.value,
        departmentSlug: department,
        defaultCookingUnitSlug: unit,
        defaultPurchaseUnitSlug: unit,
        coefficient: null,
      },
    },
    {
      onSuccess: (slug) => {
        emit('created', {
          slug,
          name: trimmedName.value,
          departmentSlug: department,
          departmentName: departmentName(department),
          unitSlug: unit,
        })
        open.value = false
      },
      onError: (error) => {
        failure.value =
          nameUsedMessage(error, trimmedName.value, departmentName(department)) ??
          messageForFailure(error)
      },
    },
  )
}
</script>

<template>
  <UiSheet
    v-model:open="open"
    :title="t('newIngredient.title')"
    @close-auto-focus="emit('closeAutoFocus', $event)"
  >
    <form ref="formElement" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <UiField
        :label="t('newIngredient.name')"
        :error="errors.name"
        v-slot="{ id, describedby, invalid }"
      >
        <UiTextInput
          :id="id"
          v-model="form.name"
          capitalize-first
          autocomplete="off"
          :aria-describedby="describedby"
          :invalid="invalid"
        />
      </UiField>

      <div class="flex flex-col gap-1.5">
        <span :id="departmentLabel" class="text-sm font-semibold">{{
          t('newIngredient.department')
        }}</span>
        <div
          role="radiogroup"
          :aria-labelledby="departmentLabel"
          aria-required="true"
          :aria-invalid="errors.department ? 'true' : undefined"
          :class="[
            'max-h-56 overflow-y-auto rounded-xl bg-surface',
            errors.department ? 'border-2 border-danger' : 'border-[1.5px] border-line',
          ]"
        >
          <label
            v-for="department in departmentList"
            :key="department.slug"
            class="flex min-h-11 cursor-pointer items-center gap-3 border-t border-soft px-3.5 first:border-t-0 has-checked:bg-soft has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-primary"
          >
            <input
              v-model="form.departmentSlug"
              type="radio"
              :name="groupName"
              :value="department.slug"
              class="sr-only"
            />
            <DepartmentMarker :icon="department.icon" :reserve="markers" />
            <span class="flex-1">{{ department.name }}</span>
            <Check
              v-if="form.departmentSlug === department.slug"
              class="size-4 text-primary"
              aria-hidden="true"
            />
          </label>
        </div>
        <p v-if="errors.department" class="text-sm font-semibold text-danger">
          {{ errors.department }}
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <span :id="unitLabel" class="text-sm font-semibold">{{ t('newIngredient.unit') }}</span>
        <div role="group" :aria-labelledby="unitLabel" class="flex flex-wrap gap-2">
          <UiChip
            v-for="unit in commonUnits"
            :key="unit.slug"
            :pressed="chosenUnit === unit.slug && !showOthers"
            :aria-label="unit.name"
            @update:pressed="
              () => {
                form.unitSlug = unit.slug
                showOthers = false
              }
            "
          >
            {{ shortLabel(unit) }}
          </UiChip>
          <UiChip :pressed="othersVisible" @update:pressed="showOthers = !showOthers">
            {{ t('newIngredient.otherUnit') }}
          </UiChip>
        </div>
        <UiSelect
          v-if="othersVisible"
          v-model="form.unitSlug"
          :aria-label="t('newIngredient.otherUnitLabel')"
        >
          <option v-for="unit in unitList" :key="unit.slug" :value="unit.slug">
            {{ unit.name }}
          </option>
        </UiSelect>
        <p v-if="errors.unit" class="text-sm font-semibold text-danger">{{ errors.unit }}</p>
      </div>

      <p
        v-if="elsewhereText"
        role="status"
        data-testid="name-elsewhere"
        class="rounded-xl bg-soft px-3.5 py-2.5 text-[15px] text-ink"
      >
        {{ elsewhereText }}
      </p>
      <p
        v-if="clashText"
        role="alert"
        data-testid="name-clash"
        class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[15px] font-semibold text-on-danger-soft"
      >
        {{ clashText }}
      </p>
      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[15px] font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <UiButton
        type="submit"
        size="lg"
        :aria-disabled="clash !== null ? 'true' : undefined"
        :class="clash !== null && 'bg-soft text-muted hover:brightness-100'"
        :disabled="save.isPending.value"
      >
        {{ t('newIngredient.submit') }}
      </UiButton>
    </form>
  </UiSheet>
</template>
