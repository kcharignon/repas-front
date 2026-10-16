<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'

import { hasFailed } from '@/api/query'
import UiLinkButton from '@/design/UiLinkButton.vue'
import { useActiveSummary } from '@/features/shopping-lists/queries'
import IngredientStepper from './IngredientStepper.vue'
import { useChangeIngredientQuantity, useDepartmentIngredients, useDepartments } from './queries'

const { t } = useI18n()
const route = useRoute()

const slug = computed(() => String(route.params.slug))
const departments = useDepartments()
const ingredients = useDepartmentIngredients(() => slug.value)
const summary = useActiveSummary()
const change = useChangeIngredientQuantity()

const department = computed(() =>
  departments.data.value?.member?.find((candidate) => candidate.slug === slug.value),
)
const items = computed(() => ingredients.data.value?.member ?? [])
const hasActiveList = computed(() => summary.data.value?.shoppingListId != null)
const quantityOf = (ingredientSlug: string) =>
  summary.data.value?.quantityByIngredientSlug[ingredientSlug] ?? 0
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <RouterLink :to="{ name: 'departments' }" class="self-start font-bold text-primary underline">
      {{ t('departments.title') }}
    </RouterLink>

    <header class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ department?.name ?? '' }}
      </h1>
      <UiLinkButton variant="secondary" :to="{ name: 'ingredient-new', query: { rayon: slug } }">
        {{ t('ingredients.new') }}
      </UiLinkButton>
    </header>

    <p
      v-if="hasFailed(ingredients)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>
    <p v-else-if="ingredients.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="items.length === 0" class="text-muted">{{ t('ingredients.none') }}</p>

    <ul
      v-else
      class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
    >
      <li
        v-for="ingredient in items"
        :key="ingredient.slug"
        class="flex min-h-16 flex-wrap items-center gap-3 py-2"
      >
        <span class="min-w-0 flex-1 font-medium">{{ ingredient.name }}</span>
        <RouterLink
          v-if="ingredient.canEdit"
          :to="{ name: 'ingredient-edit', params: { slug: ingredient.slug } }"
          class="text-sm font-bold text-primary underline"
        >
          {{ t('ingredients.edit') }}<span class="sr-only"> {{ ingredient.name }}</span>
        </RouterLink>
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
  </main>
</template>
