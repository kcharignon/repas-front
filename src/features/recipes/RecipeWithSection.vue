<script setup lang="ts">
import { computed, reactive, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-vue-next'

import type { RecipeComponent } from '@/api'
import DepartmentMarker from '@/design/DepartmentMarker.vue'
import { lowerFirst } from '@/design/lowerFirst'
import {
  isAmbiguousName,
  namesInSeveralDepartments,
  useDepartmentIcons,
} from '@/features/ingredients/departmentMarkers'
import { formatQuantity } from '@/features/shopping-lists/format'
import { timesLabel, unconvertibleRows } from './componentsText'

/**
 * « Avec » : les recettes que cette recette utilise (COMP-006), une carte chacune. Le nom ouvre la recette, la flèche déplie ses ingrédients,
 * mis à l'échelle (`quantité × fois`, la recette est lue pour ses personnes d'écriture). Jusqu'à deux recettes les cartes sont ouvertes
 * d'office, au-delà repliées ; une carte dont une ligne ne se convertit pas s'ouvre toujours. `canFix` : l'auteur de la recette voit ces
 * lignes à régler (pour la recette d'un autre, qu'on n'a pas encore copiée, rien n'est signalé).
 */
const props = defineProps<{
  components: readonly RecipeComponent[]
  canFix: boolean
}>()

const { t } = useI18n()
const id = useId()
const { iconOf, anyIcon } = useDepartmentIcons()

const fixes = (component: RecipeComponent) => (props.canFix ? unconvertibleRows(component) : [])
const toFix = computed(() =>
  props.components.reduce((sum, component) => sum + fixes(component).length, 0),
)

// Ce que l'utilisateur a ouvert ou replié lui-même l'emporte sur l'état d'office
const chosen = reactive<Record<string, boolean>>({})
const isOpen = (component: RecipeComponent) =>
  chosen[component.recipeId] ?? (props.components.length <= 2 || fixes(component).length > 0)
const toggle = (component: RecipeComponent) => {
  chosen[component.recipeId] = !isOpen(component)
}

const ambiguous = (component: RecipeComponent) =>
  namesInSeveralDepartments(component.rows, (row) => ({
    name: row.ingredientName,
    departmentSlug: row.departmentSlug,
  }))
const markers = (component: RecipeComponent) =>
  anyIcon(component.rows.map((row) => row.departmentSlug))

const root = computed(() => `with-${id}`)

// La pastille « N à régler » mène à la première ligne signalée de la section
function goToFirstFix() {
  const first = document.querySelector<HTMLElement>(`#${root.value} [data-fix]`)
  first?.scrollIntoView({ block: 'center' })
  first?.focus()
}
</script>

<template>
  <section :id="root" class="flex flex-col gap-3" aria-labelledby="with-title">
    <div class="flex items-center justify-between gap-3">
      <h2 id="with-title" class="font-display text-2xl font-bold">{{ t('recipes.with.title') }}</h2>
      <button
        v-if="toFix > 0"
        type="button"
        class="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-warning-soft px-3.5 text-sm font-bold text-on-warning-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :title="t('recipes.toFixHint')"
        @click="goToFirstFix"
      >
        <TriangleAlert class="size-4" aria-hidden="true" />
        {{ t('recipes.toFix', { count: toFix }) }}
      </button>
    </div>

    <div
      v-for="component in components"
      :key="component.recipeId"
      data-with
      class="overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div class="flex min-h-16 items-center gap-1 py-1.5 pr-1.5 pl-4">
        <div class="flex min-w-0 flex-1 flex-col gap-1 py-1.5">
          <RouterLink
            :to="{ name: 'recipe', params: { id: component.recipeId } }"
            class="text-[17px] font-bold [overflow-wrap:anywhere] text-primary underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >{{ component.name }}</RouterLink
          >
          <span class="text-sm text-muted"
            >{{ timesLabel(component.multiplier) }} ·
            {{
              t('recipes.with.ingredients', { count: component.rows.length }, component.rows.length)
            }}</span
          >
        </div>
        <button
          type="button"
          :aria-expanded="isOpen(component)"
          :aria-controls="`${root}-${component.recipeId}`"
          :aria-label="
            t(isOpen(component) ? 'recipes.with.hide' : 'recipes.with.show', {
              name: component.name,
            })
          "
          class="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
          @click="toggle(component)"
        >
          <ChevronUp v-if="isOpen(component)" class="size-[22px]" aria-hidden="true" />
          <ChevronDown v-else class="size-[22px]" aria-hidden="true" />
        </button>
      </div>
      <ul
        v-show="isOpen(component)"
        :id="`${root}-${component.recipeId}`"
        class="divide-y divide-line border-t border-line px-4"
      >
        <li
          v-for="row in component.rows"
          :key="row.ingredientSlug"
          class="flex min-h-12 flex-col justify-center gap-2 py-2"
        >
          <div class="flex items-center gap-3">
            <DepartmentMarker :icon="iconOf(row.departmentSlug)" :reserve="markers(component)" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">{{ row.ingredientName }}</span>
              <span
                v-if="
                  isAmbiguousName(ambiguous(component), row.ingredientName) && row.departmentName
                "
                class="text-sm text-muted"
                >{{ row.departmentName }}</span
              >
            </span>
            <span class="text-sm font-semibold text-muted">{{
              formatQuantity(row.quantity * component.multiplier, row.unitSymbol)
            }}</span>
          </div>
          <div
            v-if="canFix && row.convertible === false"
            data-component-missing
            class="flex flex-col gap-1.5 rounded-xl bg-warning-soft px-3 py-2.5 text-sm font-semibold text-on-warning-soft"
          >
            <p class="flex items-start gap-2">
              <TriangleAlert class="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
              <span>{{
                t('recipes.components.missingConversion', {
                  ingredient: lowerFirst(row.ingredientName),
                  name: component.name,
                })
              }}</span>
            </p>
            <RouterLink
              data-fix
              :to="{ name: 'recipe', params: { id: component.recipeId } }"
              class="inline-flex min-h-11 cursor-pointer items-center self-start rounded-xl border-[1.5px] border-primary bg-surface px-4 text-base font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >{{ t('recipes.components.open', { name: component.name }) }}</RouterLink
            >
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
