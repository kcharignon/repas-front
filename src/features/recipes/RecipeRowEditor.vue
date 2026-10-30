<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { Plus, Trash2 } from 'lucide-vue-next'

import DepartmentMarker from '@/design/DepartmentMarker.vue'
import UiButton from '@/design/UiButton.vue'
import UiCombobox from '@/design/UiCombobox.vue'
import type { ComboboxOption } from '@/design/UiCombobox.vue'
import UiSelect from '@/design/UiSelect.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import NewIngredientSheet from '@/features/ingredients/NewIngredientSheet.vue'
import { addIngredientOption, useCompatibleUnits } from './queries'

export interface EditableRow {
  key: number
  ingredientSlug: string
  unitSlug: string
  quantity: string | number
}

const row = defineModel<EditableRow>({ required: true })

const props = defineProps<{
  options: ComboboxOption[]
  index: number
  /** Les ingrédients sont chargés : ce qu'aucun ne porte peut être créé ici même (sinon on ne sait pas encore s'il existe). */
  canCreate?: boolean
  errors: { ingredient?: string; quantity?: string; unit?: string }
}>()

const emit = defineEmits<{ remove: [] }>()

const { t } = useI18n()

const units = useCompatibleUnits(() => row.value.ingredientSlug)
const queryClient = useQueryClient()

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
// L'ingrédient choisi : son repère de rayon (et son rayon si son nom existe ailleurs) se lisent sous le champ, jamais dedans
const chosen = computed(() => props.options.find((option) => option.value === ingredientSlug.value))
// Ce qui est tapé ne correspond à aucun ingrédient : on propose de le créer ici (ING-017), sans quitter la recette. Même comparaison que
// la liste (casse et accents ignorés, le texte tapé est contenu dans le nom).
const search = ref('')
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
const wanted = computed(() => search.value.trim())
const noMatch = computed(
  () =>
    props.canCreate === true &&
    wanted.value !== '' &&
    !props.options.some((option) => fold(option.label).includes(fold(wanted.value))),
)
const creating = ref(false)
const created = ref(false)
const fieldElement = ref<HTMLElement | null>(null)

// L'ingrédient créé entre dans le choix, est choisi dans CETTE ligne (avec l'unité de sa création) ; le reste de la recette ne bouge pas
function onCreated(ingredient: {
  slug: string
  name: string
  departmentSlug: string
  departmentName: string
  unitSlug: string
}) {
  addIngredientOption(queryClient, {
    slug: ingredient.slug,
    name: ingredient.name,
    departmentSlug: ingredient.departmentSlug,
    departmentName: ingredient.departmentName,
  })
  row.value = { ...row.value, ingredientSlug: ingredient.slug, unitSlug: ingredient.unitSlug }
  search.value = ingredient.name
  created.value = true
}

// Le bouton qui a ouvert la feuille a disparu avec le texte tapé : le focus revient au champ de l'ingrédient, qui vient d'être rempli
function onCloseAutoFocus(event: Event) {
  if (!created.value) return
  created.value = false
  event.preventDefault()
  void nextTick(() => fieldElement.value?.querySelector('input')?.focus())
}
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
    <div ref="fieldElement" class="flex flex-[3] flex-col gap-1">
      <UiCombobox
        v-model="ingredientSlug"
        v-model:search-term="search"
        :hide-empty="noMatch"
        :options="options"
        :label="t('editor.ingredientN', { n: index + 1 })"
        :placeholder="t('editor.ingredientPlaceholder')"
        :empty="t('editor.noIngredient')"
        :invalid="Boolean(errors.ingredient)"
      >
        <!-- Dans le champ (pas à côté) : y passer le focus ne le « quitte » pas, la liste ne se referme pas et ne vide pas le texte cherché -->
        <template #below>
          <div aria-live="polite">
            <div
              v-if="noMatch"
              data-testid="create-ingredient"
              class="mt-2 flex flex-col gap-2 rounded-xl bg-soft p-3"
            >
              <p class="text-[15px] text-ink">
                {{ t('editor.noIngredientNamed', { name: wanted }) }}
              </p>
              <UiButton class="min-h-12" @click="creating = true">
                <Plus class="size-5" aria-hidden="true" />{{
                  t('editor.createIngredient', { name: wanted })
                }}
              </UiButton>
            </div>
          </div>
        </template>
      </UiCombobox>
      <p
        v-if="chosen && (chosen.icon != null || chosen.hint)"
        class="flex items-center gap-2 text-sm text-muted"
        data-testid="chosen-department"
      >
        <DepartmentMarker :icon="chosen.icon" />
        <span v-if="chosen.hint">{{ chosen.hint }}</span>
      </p>
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
    <NewIngredientSheet
      v-model:open="creating"
      :name="wanted"
      @created="onCreated"
      @close-auto-focus="onCloseAutoFocus"
    />
  </li>
</template>
