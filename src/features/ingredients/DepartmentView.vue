<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { Minus, Plus } from 'lucide-vue-next'

import UiLinkButton from '@/design/UiLinkButton.vue'
import { useActiveSummary } from '@/features/shopping-lists/queries'
import { formatQuantity } from '@/features/shopping-lists/format'
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

const stepClass =
  'flex size-11 cursor-pointer items-center justify-center rounded-xl text-ink hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40'
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
      v-if="ingredients.isError.value"
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
        <span class="inline-flex items-center rounded-2xl border-[1.5px] border-line">
          <button
            type="button"
            :aria-label="t('ingredients.less', { name: ingredient.name })"
            :disabled="quantityOf(ingredient.slug) <= 0 || change.isPending.value"
            :class="stepClass"
            @click="change.mutate({ slug: ingredient.slug, delta: -1, hasActiveList })"
          >
            <Minus class="size-5" aria-hidden="true" />
          </button>
          <span class="min-w-14 text-center text-base font-bold" aria-live="polite">{{
            formatQuantity(quantityOf(ingredient.slug), ingredient.purchaseUnitSymbol)
          }}</span>
          <button
            type="button"
            :aria-label="t('ingredients.more', { name: ingredient.name })"
            :disabled="change.isPending.value"
            :class="stepClass"
            @click="change.mutate({ slug: ingredient.slug, delta: 1, hasActiveList })"
          >
            <Plus class="size-5" aria-hidden="true" />
          </button>
        </span>
      </li>
    </ul>
  </main>
</template>
