<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Layers, Plus } from 'lucide-vue-next'

import { ApiError } from '@/api'
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
import { useNotificationsStore } from '@/notifications/store'
import RecipeComponentsSection from './RecipeComponentsSection.vue'
import RecipeRowEditor from './RecipeRowEditor.vue'
import RecipeUsedInSheet from './RecipeUsedInSheet.vue'
import SecretRecipeSwitch from './SecretRecipeSwitch.vue'
import type { EditableComponent } from './RecipeComponentRow.vue'
import type { EditableRow } from './RecipeRowEditor.vue'
import { parseTimes } from './componentsText'
import { fromRecipeComponent, toPayload } from './editableComponents'
import { useIngredientOptions, useRecipeTypes, useRecipeUsages, useSaveRecipe } from './queries'
import { useRecipeStance } from './useRecipeStance'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Création (`/recettes/nouvelle/ecrire`, après le choix de `/recettes/nouvelle`) ou modification (`/recettes/:id/modifier`) : le même formulaire.
const recipeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const editing = computed(() => recipeId.value !== null)

const types = useRecipeTypes()
const ingredients = useIngredientOptions()
// La recette à modifier, et si c'est la version commune d'une recette Marmiton, que seul l'administrateur corrige (MAR-005) : ni
// interrupteur « secrète » (elle n'a pas d'auteur), une ligne le dit en tête, et un message confirme l'enregistrement.
const { recipe: existing, ownership, isCommon } = useRecipeStance(() => recipeId.value ?? '')
const save = useSaveRecipe()
// Les recettes dans lesquelles celle qu'on modifie est déjà utilisée : elle ne peut alors pas en utiliser d'autres (profondeur 1), la section est
// remplacée par une phrase. Lu seulement pour une recette qu'on modifie, jamais pour la version commune (sans propriétaire) ; une lecture qui
// échoue ne cache rien (le back refusera, avec son texte).
const usages = useRecipeUsages(
  () => recipeId.value ?? '',
  () => editing.value && existing.data.value !== undefined && !isCommon.value,
)
const servedIn = computed(() => (usages.data.value?.member ?? []).map((recipe) => recipe.name))
const sectionShown = computed(
  () => !isCommon.value && (!editing.value || usages.status.value !== 'pending'),
)

let nextKey = 1
const blankRow = (): EditableRow => ({
  key: nextKey++,
  ingredientSlug: '',
  unitSlug: '',
  quantity: '',
})

const form = reactive({
  name: '',
  serving: 4 as string | number,
  typeSlug: '',
  secret: false,
  rows: [blankRow()],
  // Les recettes utilisées (COMP-006) : vides tant que la section n'est pas touchée
  components: [] as EditableComponent[],
})
// Un back qui ne connaît pas encore `secret` ne le rend pas : à la modification on n'affiche pas l'interrupteur (il ne dirait pas
// vrai) et on n'envoie pas la clé. À la création il est toujours là : un ancien back ignore la clé inconnue.
const secretKnown = ref(true)
const version = ref<number | null>(null)
const submitted = ref(false)
const failure = ref<string | null>(null)
// Ce que l'utilisateur peut faire tout de suite d'un refus de recettes utilisées : rendre la recette secrète, ou voir lesquelles l'utilisent
const failureAction = ref<'makeSecret' | 'seeWhich' | null>(null)
const seeWhich = ref(false)
// Les recettes utilisées : envoyées seulement si la section a été touchée ou si la recette en avait (absent = inchangé côté back)
const componentsTouched = ref(false)
const hadComponents = ref(false)

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
    secretKnown.value = 'secret' in recipe
    form.secret = recipe.secret === true
    form.rows = recipe.rows.map((row) => ({
      key: nextKey++,
      ingredientSlug: row.ingredientSlug,
      unitSlug: row.unitSlug,
      quantity: row.quantity,
    }))
    // Un back qui ne connaît pas encore les recettes utilisées ne rend pas la clé : aucune, et rien n'est envoyé
    form.components = (recipe.components ?? []).map(fromRecipeComponent)
    hadComponents.value = form.components.length > 0
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
  const listed = ingredients.data.value?.member ?? []
  // Les ingrédients d'une version commune appartiennent à un propriétaire réservé et ne sont dans la liste de personne : le nom de chaque
  // ligne existante vient alors de la ligne elle-même (nom et rayon), sinon le champ resterait vide. Renvoyé tel quel, le slug est gardé.
  const known = new Set(listed.map((option) => option.slug))
  const missing = new Map<string, (typeof listed)[number]>()
  for (const row of existing.data.value?.rows ?? []) {
    if (known.has(row.ingredientSlug) || missing.has(row.ingredientSlug)) continue
    missing.set(row.ingredientSlug, {
      slug: row.ingredientSlug,
      name: row.ingredientName,
      departmentSlug: row.departmentSlug,
      departmentName: row.departmentName,
    })
  }
  const members = [...listed, ...missing.values()]
  const ambiguous = namesInSeveralDepartments(members, (option) => option)

  return members.map((option) => {
    // Sous le nom : son rayon quand ce nom existe dans deux rayons, et de quoi il est une partie (SUB-007)
    const hint = [
      isAmbiguousName(ambiguous, option.name) && option.departmentName ? option.departmentName : '',
      option.partOfName ? t('ingredients.parts.partOf', { name: option.partOfName }) : '',
    ]
      .filter((part) => part !== '')
      .join(' · ')

    return {
      value: option.slug,
      label: option.name,
      icon: iconOf(option.departmentSlug),
      ...(hint !== '' ? { hint } : {}),
    }
  })
})

const errors = computed(() => {
  if (!submitted.value)
    return { rows: [] as { ingredient?: string; quantity?: string; unit?: string }[] }

  return {
    name: form.name.trim() === '' ? t('editor.errors.name') : undefined,
    serving: Number(form.serving) >= 1 ? undefined : t('editor.errors.serving'),
    rowsEmpty:
      form.rows.length === 0 && form.components.length === 0
        ? t(
            sectionShown.value && servedIn.value.length === 0
              ? 'editor.errors.noRowOrRecipe'
              : 'editor.errors.noRow',
          )
        : undefined,
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
    (form.rows.length > 0 || form.components.length > 0) &&
    form.rows.every(
      (row) => row.ingredientSlug !== '' && row.unitSlug !== '' && Number(row.quantity) > 0,
    ) &&
    form.components.every((component) => parseTimes(component.times) !== null),
)

function addRow() {
  form.rows.push(blankRow())
}

function removeRow(key: number) {
  form.rows = form.rows.filter((row) => row.key !== key)
}

// Une recette utilisée ajoutée à une recette qui n'a que la ligne vide du départ : cette ligne s'en va toute seule
function componentsChanged() {
  componentsTouched.value = true
  failure.value = null
  failureAction.value = null
  const [only] = form.rows
  if (
    form.components.length > 0 &&
    form.rows.length === 1 &&
    only !== undefined &&
    only.ingredientSlug === '' &&
    only.unitSlug === '' &&
    only.quantity === ''
  )
    form.rows = []
}

// Le refus du back dit ce qui ne va pas ; selon le cas, un bouton le règle (une recette utilisée introuvable est le seul 404 qu'on explique ici)
function explain(error: unknown): string {
  failureAction.value = null
  if (error instanceof ApiError) {
    if (error.message === 'RECIPE_COMPONENT_SECRET') failureAction.value = 'makeSecret'
    if (error.message === 'RECIPE_SECRET_USED_BY_PUBLIC') {
      // La recette reste visible : l'interrupteur revient où il était
      failureAction.value = 'seeWhich'
      form.secret = false
    }
    if (
      error.status === 404 &&
      form.components.some((component) => error.message.includes(component.recipeId))
    )
      return t('recipes.componentErrors.gone')
  }

  return messageForFailure(error)
}

function makeSecret() {
  form.secret = true
  failure.value = null
  failureAction.value = null
}

// Le bandeau s'affiche sous le bouton : au téléphone il peut tomber sous la barre du bas, on le ramène à l'écran
// (role="alert" l'annonce déjà : pas de focus en plus)
const failureBox = ref<HTMLElement | null>(null)
async function showFailure() {
  await nextTick()
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  failureBox.value?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
}

function submit() {
  submitted.value = true
  failure.value = null
  failureAction.value = null
  if (!valid.value) return

  const components =
    sectionShown.value &&
    servedIn.value.length === 0 &&
    (componentsTouched.value || hadComponents.value)
      ? toPayload(form.components)
      : null

  save.mutate(
    {
      id: recipeId.value,
      version: version.value,
      form: {
        name: form.name.trim(),
        serving: Number(form.serving),
        typeSlug: form.typeSlug,
        // Création : la clé ne part que pour une recette secrète (absente = publique) ; modification : la valeur choisie, si le back la connaît
        ...(editing.value
          ? secretKnown.value && !isCommon.value
            ? { secret: form.secret }
            : {}
          : form.secret
            ? { secret: true }
            : {}),
        rows: form.rows.map((row) => ({
          ingredientSlug: row.ingredientSlug,
          unitSlug: row.unitSlug,
          quantity: Number(row.quantity),
        })),
        // Absent = inchangé : la clé ne part que si la section a été touchée, ou si la recette avait des recettes utilisées (alors `[]` les retire toutes)
        ...(components !== null ? { components } : {}),
      },
    },
    {
      onSuccess: (id) => {
        if (isCommon.value) useNotificationsStore().push('success', t('recipes.common.saved'))

        return router.push({ name: 'recipe', params: { id } })
      },
      onError: (error) => {
        failure.value = explain(error)
        void showFailure()
      },
    },
  )
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <RouterLink
      :to="editing ? { name: 'recipe', params: { id: recipeId ?? '' } } : { name: 'recipe-new' }"
      class="self-start font-bold text-primary underline"
    >
      {{ editing ? t('editor.backToRecipe') : t('recipes.new') }}
    </RouterLink>
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ editing ? t('editor.editTitle') : t('editor.writeTitle') }}
    </h1>

    <p v-if="isCommon" data-common-note class="-mt-2 flex items-center gap-2 text-sm text-muted">
      <Layers class="size-4.5 shrink-0" aria-hidden="true" />{{ t('recipes.common.editing') }}
    </p>

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

      <SecretRecipeSwitch
        v-if="!editing || (secretKnown && ownership !== 'common')"
        v-model="form.secret"
      />

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

      <RecipeComponentsSection
        v-if="sectionShown"
        v-model="form.components"
        :for-recipe-id="recipeId"
        :secret="form.secret"
        :submitted="submitted"
        :served-in="servedIn"
        @change="componentsChanged"
      />

      <div
        v-if="failure"
        ref="failureBox"
        role="alert"
        class="flex flex-col gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-[15px] font-semibold text-on-danger-soft"
      >
        <p>{{ failure }}</p>
        <UiButton
          v-if="failureAction === 'makeSecret'"
          type="button"
          variant="secondary"
          class="self-start border-on-danger-soft bg-surface text-on-danger-soft"
          @click="makeSecret"
          >{{ t('editor.makeSecret') }}</UiButton
        >
        <UiButton
          v-else-if="failureAction === 'seeWhich'"
          type="button"
          variant="secondary"
          class="self-start border-on-danger-soft bg-surface text-on-danger-soft"
          @click="seeWhich = true"
          >{{ t('recipes.usedIn.see') }}</UiButton
        >
      </div>

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

    <RecipeUsedInSheet v-model:open="seeWhich" :recipes="usages.data.value?.member ?? []" />
  </main>
</template>
