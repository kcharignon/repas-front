<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { hasFailed } from '@/api/query'
import DepartmentMarker from '@/design/DepartmentMarker.vue'
import LoadError from '@/design/LoadError.vue'
import SeasonEmpty from '@/design/season/SeasonEmpty.vue'
import UiImage from '@/design/UiImage.vue'
import { lowerFirst } from '@/design/lowerFirst'
import { useNotificationsStore } from '@/notifications/store'
import { useActiveSummary } from '@/features/shopping-lists/queries'
import { useDepartmentIcons } from './departmentMarkers'
import { countsIn } from './partsText'
import { unitLabel } from './equationMath'
import { formatQuantity } from '@/features/shopping-lists/format'
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

type Found = (typeof items.value)[number]
const notifications = useNotificationsStore()

/**
 * Ajouter une PARTIE à la main (SUB-007) ajoute au total de son entier : le back ne répond rien (204), le total se lit dans le résumé de
 * la liste que l'ajout vient de relire (aucun appel de plus). Il se dit seulement pour un entier compté à l'unité (« 3 œufs ») : l'unité
 * d'un autre entier n'est pas connue ici, la phrase ne cite alors que son nom (« C'est ajouté à tes œufs. »), sans inventer de nombre.
 */
function addPart(part: Found) {
  const wholeSlug = part.partOfSlug ?? ''
  const wholeName = part.partOfName ?? ''
  change.mutate(
    { slug: part.slug, delta: 1, hasActiveList: hasActiveList.value },
    {
      onSuccess: async () => {
        await nextTick()
        const total = summary.data.value?.quantityByIngredientSlug[wholeSlug]
        const whole = items.value.find((candidate) => candidate.slug === wholeSlug)
        const counted = whole !== undefined && whole.purchaseUnitSymbol === ''
        notifications.push(
          'success',
          typeof total === 'number' && total > 0 && counted
            ? t('ingredients.parts.added', {
                count: formatQuantity(total, ''),
                name: unitLabel(lowerFirst(wholeName), total),
              })
            : t('ingredients.parts.addedTo', { counts: countsIn(wholeName) }),
        )
      },
    },
  )
}
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
            <!-- Une partie d'un autre ingrédient (SUB-007) : de quoi elle fait partie -->
            <span v-if="ingredient.partOfName" class="block text-sm text-muted">{{
              t('ingredients.parts.partOf', { name: ingredient.partOfName })
            }}</span>
          </span>
          <IngredientStepper
            :name="ingredient.name"
            :quantity="quantityOf(ingredient.slug)"
            :unit-symbol="ingredient.purchaseUnitSymbol"
            :busy="change.isPending.value"
            :plus-only="Boolean(ingredient.partOfSlug)"
            @less="change.mutate({ slug: ingredient.slug, delta: -1, hasActiveList })"
            @more="
              ingredient.partOfSlug
                ? addPart(ingredient)
                : change.mutate({ slug: ingredient.slug, delta: 1, hasActiveList })
            "
          />
        </li>
      </ul>
    </template>
  </section>
</template>
