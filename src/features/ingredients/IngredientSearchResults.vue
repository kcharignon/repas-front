<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { hasFailed } from '@/api/query'
import DepartmentMarker from '@/design/DepartmentMarker.vue'
import LoadError from '@/design/LoadError.vue'
import SeasonEmpty from '@/design/season/SeasonEmpty.vue'
import UiImage from '@/design/UiImage.vue'
import { useActiveSummary } from '@/features/shopping-lists/queries'
import { useDepartmentIcons } from './departmentMarkers'
import IngredientStepper from './IngredientStepper.vue'
import { useChangeIngredientQuantity, useSearchIngredients } from './queries'

/** Résultats d'une recherche d'ingrédient : le plus pertinent d'abord, avec l'icône de son rayon et de quoi l'ajouter à la liste. */
const props = defineProps<{ search: string }>()

const { t } = useI18n()

const results = useSearchIngredients(() => props.search)
const summary = useActiveSummary()
const change = useChangeIngredientQuantity()

const items = computed(() => results.data.value?.member ?? [])
// Le repère du rayon devant le nom (ING-017) ; le rayon, lui, se lit déjà sous chaque nom
const { iconOf, anyIcon } = useDepartmentIcons()
const markers = computed(() => anyIcon(items.value.map((ingredient) => ingredient.departmentSlug)))
const hasActiveList = computed(() => summary.data.value?.shoppingListId != null)
const quantityOf = (slug: string) => summary.data.value?.quantityByIngredientSlug[slug] ?? 0
</script>

<template>
  <section :aria-label="t('departments.results')" class="flex flex-col gap-3">
    <LoadError v-if="hasFailed(results)" />
    <p v-else-if="results.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <SeasonEmpty v-else-if="items.length === 0" name="empty-search">
      <p class="text-muted" role="status">
        {{ t('departments.noMatch', { search }) }}
      </p>
    </SeasonEmpty>

    <template v-else>
      <p class="sr-only" role="status">
        {{ t('departments.count', { count: items.length }, items.length) }}
      </p>
      <ul
        class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
      >
        <li
          v-for="ingredient in items"
          :key="ingredient.slug"
          class="flex min-h-16 flex-wrap items-center gap-3 py-2"
        >
          <RouterLink
            :to="{ name: 'department', params: { slug: ingredient.departmentSlug } }"
            :aria-label="t('departments.goTo', { name: ingredient.departmentName })"
            class="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            <UiImage :src="ingredient.departmentImage" class="size-8" />
          </RouterLink>
          <DepartmentMarker :icon="iconOf(ingredient.departmentSlug)" :reserve="markers" />
          <span class="min-w-0 flex-1">
            <RouterLink
              v-if="ingredient.canEdit"
              :to="{ name: 'ingredient-edit', params: { slug: ingredient.slug } }"
              class="flex min-h-11 items-center font-medium [overflow-wrap:anywhere] hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
              >{{ ingredient.name }}</RouterLink
            >
            <span v-else class="block font-medium">{{ ingredient.name }}</span>
            <span class="block text-sm text-muted">{{ ingredient.departmentName }}</span>
          </span>
          <IngredientStepper
            :name="ingredient.name"
            :quantity="quantityOf(ingredient.slug)"
            :unit-symbol="ingredient.purchaseUnitSymbol"
            :busy="change.isPending.value"
            @less="change.mutate({ slug: ingredient.slug, delta: -1, hasActiveList })"
            @more="change.mutate({ slug: ingredient.slug, delta: 1, hasActiveList })"
          />
        </li>
      </ul>
    </template>
  </section>
</template>
