<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiField from '@/design/UiField.vue'
import UiSelect from '@/design/UiSelect.vue'
import UiSwitch from '@/design/UiSwitch.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { messageForFailure, notifyDeleteFailure } from '@/notifications/failures'
import { useSessionStore } from '@/session/session'
import ConversionEquation from './ConversionEquation.vue'
import IngredientConversionsSection from './IngredientConversionsSection.vue'
import MergeConfirmSheet from './MergeConfirmSheet.vue'
import MergePickerSheet from './MergePickerSheet.vue'
import {
  coefficientOf,
  displayOrientation,
  equationProblem,
  inputNumber,
  type EquationUnit,
  type EquationValue,
} from './equationMath'
import { usageText } from './mergeText'
import {
  useDeleteIngredient,
  useDepartments,
  useIngredient,
  useIngredientConversions,
  useSaveIngredient,
  useUnits,
} from './queries'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()

// Création (`/ingredients/nouveau?rayon=…`) ou modification (`/ingredients/:slug/modifier`) : le même formulaire.
const slug = computed(() => (typeof route.params.slug === 'string' ? route.params.slug : null))
const editing = computed(() => slug.value !== null)

const departments = useDepartments()
const units = useUnits()
const existing = useIngredient(() => slug.value ?? '')
const save = useSaveIngredient()
const remove = useDeleteIngredient()

const form = reactive({
  name: '',
  departmentSlug: typeof route.query.rayon === 'string' ? route.query.rayon : '',
  cookingUnit: '',
  purchaseUnit: '',
  isBase: false,
})
const submitted = ref(false)
const failure = ref<string | null>(null)
const deleting = ref(false)

let loaded = false
// « Modifier » un autre ingrédient depuis la fusion garde cette vue montée : le formulaire se recharge pour le nouveau
watch(slug, () => {
  loaded = false
  submitted.value = false
  failure.value = null
})
watch(
  () => existing.data.value,
  (ingredient) => {
    if (!editing.value || loaded || !ingredient) return
    loaded = true
    form.name = ingredient.name
    form.departmentSlug = ingredient.departmentSlug
    form.cookingUnit = ingredient.cookingUnitSlug
    form.purchaseUnit = ingredient.purchaseUnitSlug
    form.isBase = ingredient.isBase === true
  },
  { immediate: true },
)

// Des valeurs par défaut sensibles pour une création : le premier rayon (sauf celui demandé) et la première unité.
watch(
  [() => departments.data.value, () => units.data.value],
  ([departmentList, unitList]) => {
    if (editing.value) return
    if (form.departmentSlug === '' && departmentList?.member?.[0])
      form.departmentSlug = departmentList.member[0].slug
    if (form.cookingUnit === '' && unitList?.member?.[0]) form.cookingUnit = unitList.member[0].slug
    if (form.purchaseUnit === '' && unitList?.member?.[0])
      form.purchaseUnit = unitList.member[0].slug
  },
  { immediate: true },
)

// Le marqueur « de base » (ING-015) : seul le back sait qui peut le régler (`canSetBase`, absent d'un ancien back : faux). Il part
// avec le reste du formulaire, et seulement s'il a changé : sinon le corps est celui d'avant.
const canSetBase = computed(() => editing.value && existing.data.value?.canSetBase === true)
const baseChanged = computed(
  () => canSetBase.value && form.isBase !== (existing.data.value?.isBase === true),
)

// Deux unités différentes : il faut dire combien l'une vaut de l'autre (sauf si le back connaît déjà la conversion).
const needsCoefficient = computed(
  () => form.cookingUnit !== '' && form.cookingUnit !== form.purchaseUnit,
)

// L'équation d'un ingrédient se pose TOUJOURS dans le même sens, le plus facile à répondre : « 1 [unité d'achat] = ? [unité des
// recettes] » (« 1 bouteille = 30 centilitres », pas « 1 centilitre = 0,0333 bouteille »). Les deux unités sont celles du formulaire,
// écrites et non choisies ; reste le nombre de droite, qui est exactement le coefficient du back (« 1 unité d'achat = N unités de recette »).
const unitList = computed<EquationUnit[]>(() => units.data.value?.member ?? [])
const unitBySlug = (slug: string) => unitList.value.find((unit) => unit.slug === slug)
const startUnits = computed(() => {
  const unit = unitBySlug(form.purchaseUnit)

  return unit === undefined ? [] : [unit]
})
const endUnits = computed(() => {
  const unit = unitBySlug(form.cookingUnit)

  return unit === undefined ? [] : [unit]
})
const eqLeft = ref<string | number>('1')
const eqRight = ref<string | number>('')
const eqTouched = ref(false)

const equation = computed<EquationValue>({
  get: () => ({
    start: form.purchaseUnit,
    end: form.cookingUnit,
    left: eqLeft.value,
    right: eqRight.value,
  }),
  set: (value) => {
    eqLeft.value = value.left
    eqRight.value = value.right
    eqTouched.value = true
  },
})

// Les conversions de l'ingrédient (les siennes, puis celles de tout le monde) : celle qui relie l'unité d'achat et l'unité des recettes,
// enregistrée dans un sens ou dans l'autre, se rouvre toujours « 1 unité d'achat = N unités de recette ».
const conversions = useIngredientConversions(() =>
  editing.value && existing.data.value?.canEdit === true ? (slug.value ?? '') : '',
)
const savedPair = computed(
  () =>
    editing.value &&
    existing.data.value?.cookingUnitSlug === form.cookingUnit &&
    existing.data.value?.purchaseUnitSlug === form.purchaseUnit,
)
const knownValue = computed<number | null>(() => {
  if (!editing.value || form.cookingUnit === '' || form.purchaseUnit === '') return null

  const data = conversions.data.value
  if (data === undefined) {
    // La liste n'est pas encore là : la fiche donne la conversion « achat vers recettes » de la paire enregistrée
    const known = existing.data.value?.coefficient

    return savedPair.value && known != null ? known : null
  }

  const direct = [...(data.member ?? []), ...(data.common ?? [])].find(
    (conversion) =>
      (conversion.startUnitSlug === form.purchaseUnit &&
        conversion.endUnitSlug === form.cookingUnit) ||
      (conversion.startUnitSlug === form.cookingUnit &&
        conversion.endUnitSlug === form.purchaseUnit),
  )

  return direct === undefined ? null : displayOrientation(direct, form.purchaseUnit).value
})
// Les deux unités se convertissent déjà (une universelle, plusieurs étapes) sans conversion directe : rien à inventer, on peut préciser
const alreadyConvertible = computed(
  () =>
    needsCoefficient.value &&
    savedPair.value &&
    knownValue.value === null &&
    conversions.data.value?.convertible === true,
)

function resetEquation() {
  eqLeft.value = '1'
  eqRight.value = knownValue.value === null ? '' : inputNumber(knownValue.value)
  eqTouched.value = false
}
watch(() => [form.cookingUnit, form.purchaseUnit, knownValue.value].join('|'), resetEquation, {
  immediate: true,
})

const rightFilled = computed(() => String(eqRight.value).trim() !== '')
const equationError = computed(
  () =>
    needsCoefficient.value && rightFilled.value && equationProblem(equation.value, true) !== null,
)
// Rien tapé à droite : pas de coefficient (le back connaît déjà la conversion, sinon il le dira). Équation intacte : rien n'est
// renvoyé, ce qui est enregistré (dans le sens où il l'est) ne bouge pas.
const apiCoefficient = computed<number | null>(() => {
  if (!needsCoefficient.value || !rightFilled.value) return null
  if (!eqTouched.value && knownValue.value !== null) return null

  return coefficientOf(eqLeft.value, eqRight.value)
})

const errors = computed(() => ({
  name: submitted.value && form.name.trim() === '' ? t('ingredients.errors.name') : undefined,
}))

function submit() {
  submitted.value = true
  failure.value = null
  if (form.name.trim() === '' || equationError.value) return

  save.mutate(
    {
      slug: slug.value,
      form: {
        name: form.name.trim(),
        departmentSlug: form.departmentSlug,
        defaultCookingUnitSlug: form.cookingUnit,
        defaultPurchaseUnitSlug: form.purchaseUnit,
        coefficient: apiCoefficient.value,
        ...(baseChanged.value ? { isBase: form.isBase } : {}),
      },
    },
    {
      onSuccess: () => router.push({ name: 'department', params: { slug: form.departmentSlug } }),
      onError: (error) => {
        failure.value = messageForFailure(error)
      },
    },
  )
}

function confirmDelete() {
  remove.mutate(slug.value ?? '', {
    onSuccess: () => {
      deleting.value = false
      void router.push({ name: 'department', params: { slug: form.departmentSlug } })
    },
    onError: (error) => {
      deleting.value = false
      notifyDeleteFailure(error, t('ingredients.inUse'))
    },
  })
}

// Fusionner (ING-007) : seulement un ingrédient à soi, jamais un commun ni un nouvel ingrédient
const canMerge = computed(() => {
  const ingredient = existing.data.value
  const userId = session.user?.id

  return (
    editing.value &&
    ingredient !== undefined &&
    userId !== undefined &&
    ingredient.creatorId != null &&
    ingredient.creatorId === userId
  )
})
const usage = computed(() => {
  const ingredient = existing.data.value
  const text = ingredient === undefined ? '' : usageText(t, ingredient)

  return text === ''
    ? t('ingredients.merge.usedNowhere')
    : t('ingredients.merge.usedIn', { usage: text })
})
const picking = ref(false)
const candidate = ref<{ slug: string; name: string } | null>(null)
const confirming = computed({
  get: () => candidate.value !== null,
  set: (value) => {
    if (!value) candidate.value = null
  },
})

// Après la fusion le slug de cet ingrédient n'existe plus : on repart du rayon de celui qu'on a gardé
function merged(departmentSlug: string) {
  void router.push({ name: 'department', params: { slug: departmentSlug || form.departmentSlug } })
}

const back = computed(() =>
  form.departmentSlug !== ''
    ? { name: 'department', params: { slug: form.departmentSlug } }
    : { name: 'departments' },
)
</script>

<template>
  <main class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
    <RouterLink :to="back" class="self-start font-bold text-primary underline">{{
      t('departments.title')
    }}</RouterLink>
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ editing ? t('ingredients.editTitle') : t('ingredients.newTitle') }}
    </h1>

    <p v-if="editing && existing.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p
      v-else-if="editing && hasFailed(existing)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.notFound') }}
    </p>

    <form
      v-else
      class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4"
      novalidate
      @submit.prevent="submit"
    >
      <UiField
        :label="t('ingredients.name')"
        :error="errors.name"
        v-slot="{ id, describedby, invalid }"
      >
        <UiTextInput
          :id="id"
          v-model="form.name"
          autocomplete="off"
          :aria-describedby="describedby"
          :invalid="invalid"
        />
      </UiField>
      <UiField :label="t('ingredients.department')" v-slot="{ id }">
        <UiSelect :id="id" v-model="form.departmentSlug">
          <option
            v-for="department in departments.data.value?.member ?? []"
            :key="department.slug"
            :value="department.slug"
          >
            {{ department.name }}
          </option>
        </UiSelect>
      </UiField>
      <div class="grid gap-4 sm:grid-cols-2">
        <UiField
          :label="t('ingredients.cookingUnit')"
          :hint="t('ingredients.cookingUnitHint')"
          v-slot="{ id, describedby }"
        >
          <UiSelect :id="id" v-model="form.cookingUnit" :aria-describedby="describedby">
            <option
              v-for="unit in units.data.value?.member ?? []"
              :key="unit.slug"
              :value="unit.slug"
            >
              {{ unit.name }}
            </option>
          </UiSelect>
        </UiField>
        <UiField
          :label="t('ingredients.purchaseUnit')"
          :hint="t('ingredients.purchaseUnitHint')"
          v-slot="{ id, describedby }"
        >
          <UiSelect :id="id" v-model="form.purchaseUnit" :aria-describedby="describedby">
            <option
              v-for="unit in units.data.value?.member ?? []"
              :key="unit.slug"
              :value="unit.slug"
            >
              {{ unit.name }}
            </option>
          </UiSelect>
        </UiField>
      </div>
      <div v-if="needsCoefficient" class="flex flex-col gap-1.5">
        <ConversionEquation
          v-model="equation"
          :units="unitList"
          :start-units="startUnits"
          :end-units="endUnits"
          :ingredient-name="form.name.trim()"
          :submitted="submitted && rightFilled"
          :hint="alreadyConvertible ? t('conversion.alreadyConvertible') : undefined"
        />
        <p class="text-sm text-muted">{{ t('ingredients.conversionHint') }}</p>
      </div>

      <UiSwitch
        v-if="canSetBase"
        v-model="form.isBase"
        :label="t('ingredients.baseSwitch')"
        :hint="t('ingredients.baseHint')"
      />

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <UiButton v-if="editing" variant="ghost" @click="deleting = true">{{
          t('common.delete')
        }}</UiButton>
        <span v-else />
        <div class="flex flex-wrap gap-2">
          <UiButton variant="ghost" @click="router.push(back)">{{ t('common.cancel') }}</UiButton>
          <UiButton type="submit" :disabled="save.isPending.value">{{ t('common.save') }}</UiButton>
        </div>
      </div>
    </form>

    <!-- Les conversions propres de l'ingrédient (planche L1) : seulement pour celui qui peut le modifier -->
    <IngredientConversionsSection
      v-if="editing && existing.data.value?.canEdit === true"
      :slug="slug ?? ''"
      :name="existing.data.value.name"
    />

    <section
      v-if="canMerge"
      class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <p class="text-[15px] text-muted" data-testid="ingredient-usage">{{ usage }}</p>
      <UiButton variant="secondary" class="min-h-12" @click="picking = true">{{
        t('ingredients.merge.action')
      }}</UiButton>
    </section>

    <MergePickerSheet
      v-if="picking && canMerge"
      v-model:open="picking"
      :absorbed="{ slug: slug ?? '', name: existing.data.value?.name ?? form.name }"
      @pick="candidate = { slug: $event.slug, name: $event.name }"
    />
    <MergeConfirmSheet
      v-if="candidate"
      v-model:open="confirming"
      :absorbed="{ slug: slug ?? '', name: existing.data.value?.name ?? form.name }"
      :kept="candidate"
      @merged="merged"
      @gone="candidate = null"
    />

    <UiConfirmDialog
      v-model:open="deleting"
      :title="t('ingredients.deleteTitle')"
      :description="t('ingredients.deleteHelp', { name: form.name })"
      :confirm-label="t('common.delete')"
      :pending="remove.isPending.value"
      @confirm="confirmDelete"
    />
  </main>
</template>
