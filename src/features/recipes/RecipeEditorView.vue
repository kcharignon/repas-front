<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Plus } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import {
  isAmbiguousName,
  namesInSeveralDepartments,
  useDepartmentIcons,
} from '@/features/ingredients/departmentMarkers'
import UiField from '@/design/UiField.vue'
import UiSelect from '@/design/UiSelect.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { messageForFailure } from '@/notifications/failures'
import RecipeRowEditor from './RecipeRowEditor.vue'
import type { EditableRow } from './RecipeRowEditor.vue'
import { useIngredientOptions, useRecipe, useRecipeTypes, useSaveRecipe } from './queries'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Création (`/recettes/nouvelle`) ou modification (`/recettes/:id/modifier`) : le même formulaire.
const recipeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const editing = computed(() => recipeId.value !== null)

const types = useRecipeTypes()
const ingredients = useIngredientOptions()
const existing = useRecipe(() => recipeId.value ?? '')
const save = useSaveRecipe()

let nextKey = 1
const blankRow = (): EditableRow => ({
  key: nextKey++,
  ingredientSlug: '',
  unitSlug: '',
  quantity: '',
})

const form = reactive({ name: '', serving: 4 as string | number, typeSlug: '', rows: [blankRow()] })
const version = ref<number | null>(null)
const submitted = ref(false)
const failure = ref<string | null>(null)

// La recette à modifier remplit le formulaire une seule fois (le travail en cours n'est pas écrasé par une relecture).
let loaded = false
watch(
  () => existing.data.value,
  (recipe) => {
    if (!editing.value || loaded || !recipe) return
    loaded = true
    form.name = recipe.name
    form.serving = recipe.serving
    form.typeSlug = recipe.typeSlug
    form.rows = recipe.rows.map((row) => ({
      key: nextKey++,
      ingredientSlug: row.ingredientSlug,
      unitSlug: row.unitSlug,
      quantity: row.quantity,
    }))
    version.value = recipe.version
  },
  { immediate: true },
)

// Un nouveau type par défaut : le premier.
watch(
  () => types.data.value,
  (list) => {
    if (form.typeSlug === '' && list?.member?.[0]) form.typeSlug = list.member[0].slug
  },
  { immediate: true },
)

// Le repère du rayon devant chaque ingrédient (icône jointe par `departmentSlug` à la liste des rayons) ; son nom sous le nom
// seulement quand ce nom existe dans deux rayons (ING-017). Un ancien back (ni rayon ni icône) : des options sans repère.
const { iconOf } = useDepartmentIcons()
const options = computed(() => {
  const members = ingredients.data.value?.member ?? []
  const ambiguous = namesInSeveralDepartments(members, (option) => option)

  return members.map((option) => ({
    value: option.slug,
    label: option.name,
    icon: iconOf(option.departmentSlug),
    ...(isAmbiguousName(ambiguous, option.name) && option.departmentName
      ? { hint: option.departmentName }
      : {}),
  }))
})

const errors = computed(() => {
  if (!submitted.value)
    return { rows: [] as { ingredient?: string; quantity?: string; unit?: string }[] }

  return {
    name: form.name.trim() === '' ? t('editor.errors.name') : undefined,
    serving: Number(form.serving) >= 1 ? undefined : t('editor.errors.serving'),
    rowsEmpty: form.rows.length === 0 ? t('editor.errors.noRow') : undefined,
    rows: form.rows.map((row) => ({
      ingredient: row.ingredientSlug === '' ? t('editor.errors.ingredient') : undefined,
      quantity: Number(row.quantity) > 0 ? undefined : t('editor.errors.quantity'),
      unit: row.unitSlug === '' ? t('editor.errors.unit') : undefined,
    })),
  }
})

const valid = computed(
  () =>
    form.name.trim() !== '' &&
    Number(form.serving) >= 1 &&
    form.rows.length > 0 &&
    form.rows.every(
      (row) => row.ingredientSlug !== '' && row.unitSlug !== '' && Number(row.quantity) > 0,
    ),
)

function addRow() {
  form.rows.push(blankRow())
}

function removeRow(key: number) {
  form.rows = form.rows.filter((row) => row.key !== key)
}

function submit() {
  submitted.value = true
  failure.value = null
  if (!valid.value) return

  save.mutate(
    {
      id: recipeId.value,
      version: version.value,
      form: {
        name: form.name.trim(),
        serving: Number(form.serving),
        typeSlug: form.typeSlug,
        rows: form.rows.map((row) => ({
          ingredientSlug: row.ingredientSlug,
          unitSlug: row.unitSlug,
          quantity: Number(row.quantity),
        })),
      },
    },
    {
      onSuccess: (id) => router.push({ name: 'recipe', params: { id } }),
      onError: (error) => {
        failure.value = messageForFailure(error)
      },
    },
  )
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <RouterLink
      :to="editing ? { name: 'recipe', params: { id: recipeId ?? '' } } : { name: 'recipes' }"
      class="self-start font-bold text-primary underline"
    >
      {{ editing ? t('editor.backToRecipe') : t('recipes.title') }}
    </RouterLink>
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ editing ? t('editor.editTitle') : t('editor.newTitle') }}
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

    <form v-else class="flex flex-col gap-5" novalidate @submit.prevent="submit">
      <section class="grid gap-4 rounded-2xl border border-line bg-surface p-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <UiField
            :label="t('editor.name')"
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
        </div>
        <UiField
          :label="t('editor.serving')"
          :error="errors.serving"
          v-slot="{ id, describedby, invalid }"
        >
          <UiTextInput
            :id="id"
            v-model="form.serving"
            type="number"
            inputmode="numeric"
            min="1"
            :aria-describedby="describedby"
            :invalid="invalid"
          />
        </UiField>
        <UiField :label="t('editor.type')" v-slot="{ id }">
          <UiSelect :id="id" v-model="form.typeSlug">
            <option
              v-for="type in types.data.value?.member ?? []"
              :key="type.slug"
              :value="type.slug"
            >
              {{ type.name }}
            </option>
          </UiSelect>
        </UiField>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="font-display text-2xl font-bold">{{ t('recipes.ingredients') }}</h2>
        <p v-if="errors.rowsEmpty" class="text-sm font-semibold text-danger">
          {{ errors.rowsEmpty }}
        </p>
        <ul class="flex flex-col gap-3">
          <RecipeRowEditor
            v-for="(row, index) in form.rows"
            :key="row.key"
            :model-value="row"
            @update:model-value="(updated) => (form.rows[index] = updated)"
            :index="index"
            :options="options"
            :can-create="ingredients.isSuccess.value"
            :errors="errors.rows[index] ?? {}"
            @remove="removeRow(row.key)"
          />
        </ul>
        <div>
          <UiButton variant="secondary" @click="addRow"
            ><Plus class="size-5" aria-hidden="true" />{{ t('editor.addRow') }}</UiButton
          >
        </div>
      </section>

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <div class="flex flex-wrap justify-end gap-2">
        <UiButton
          variant="ghost"
          @click="
            router.push(
              editing ? { name: 'recipe', params: { id: recipeId ?? '' } } : { name: 'recipes' },
            )
          "
        >
          {{ t('common.cancel') }}
        </UiButton>
        <UiButton type="submit" size="lg" :disabled="save.isPending.value">{{
          t('common.save')
        }}</UiButton>
      </div>
    </form>
  </main>
</template>
