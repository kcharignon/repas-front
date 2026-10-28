<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

import LoadError from '@/design/LoadError.vue'
import SeasonEmpty from '@/design/season/SeasonEmpty.vue'
import UiButton from '@/design/UiButton.vue'
import UiSearchField from '@/design/UiSearchField.vue'
import { useDebounced } from '@/features/ingredients/useDebounced'
import OtherRecipeItem from './OtherRecipeItem.vue'
import { capitalized, groupByType } from './otherRecipeGroups'
import { MIN_OTHERS_SEARCH_LENGTH, useCopyRecipe, useOtherPeopleRecipes } from './queries'

const { t } = useI18n()
const router = useRouter()

// La requête attend une pause dans la frappe (comme la recherche d'ingrédients) ; effacer le champ revient tout de suite à la liste.
const search = ref('')
const paused = useDebounced(search)
const term = computed(() => (search.value.trim() === '' ? '' : paused.value.trim()))
const isSearching = computed(() => term.value.length >= MIN_OTHERS_SEARCH_LENGTH)

const others = useOtherPeopleRecipes(() => term.value)
const copy = useCopyRecipe()
const items = computed(() => others.data.value?.pages.flatMap((page) => page.member) ?? [])
// Sans recherche, le back range les recettes par catégorie : une section par catégorie. Avec une recherche, l'ordre est la pertinence.
const groups = computed(() => (isSearching.value ? [] : groupByType(items.value)))
const total = computed(() => others.data.value?.pages[0]?.totalItems ?? 0)

// Une relecture ratée garde ce qui est affiché ; mais les résultats d'une autre recherche ne remplacent pas une erreur
const failed = computed(
  () =>
    others.isError.value &&
    (others.data.value === undefined || others.isPlaceholderData.value === true),
)
const refining = computed(() => others.isPlaceholderData.value === true)
// Rien à chercher quand le back n'a aucune recette à proposer
const nothingToSearch = computed(
  () =>
    search.value.trim() === '' &&
    !others.isPending.value &&
    !failed.value &&
    items.value.length === 0,
)

function copyRecipe(id: string) {
  copy.mutate(id, {
    onSuccess: (copyId) => {
      if (copyId !== null) void router.push({ name: 'recipe', params: { id: copyId } })
    },
  })
}
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <RouterLink :to="{ name: 'recipes' }" class="self-start font-bold text-primary underline">
      {{ t('recipes.title') }}
    </RouterLink>
    <header>
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t('recipes.othersTitle') }}
      </h1>
      <p class="mt-1 text-muted">{{ t('recipes.othersHelp') }}</p>
    </header>

    <UiSearchField
      v-if="!nothingToSearch"
      v-model="search"
      :label="t('recipes.othersSearch')"
      :maxlength="100"
    />

    <p v-if="others.isPending.value" class="text-muted" role="status">{{ t('common.loading') }}</p>
    <LoadError v-else-if="failed" />
    <SeasonEmpty v-else-if="items.length === 0 && !isSearching" name="empty-recipes">
      <p class="text-muted">{{ t('recipes.othersNone') }}</p>
    </SeasonEmpty>
    <SeasonEmpty v-else-if="items.length === 0" name="empty-search">
      <p class="text-muted" role="status">{{ t('recipes.othersNoMatch', { search: term }) }}</p>
    </SeasonEmpty>

    <template v-else>
      <p class="sr-only" role="status">
        {{ refining ? t('common.loading') : t('recipes.othersCount', { count: total }, total) }}
      </p>

      <!-- Avec une recherche : une liste simple, la catégorie sur chaque ligne -->
      <ul
        v-if="isSearching"
        :aria-label="t('recipes.othersResults')"
        :aria-busy="refining"
        class="flex flex-col gap-3 transition-opacity"
        :class="{ 'opacity-60': refining }"
      >
        <OtherRecipeItem
          v-for="recipe in items"
          :key="recipe.id"
          :recipe="recipe"
          show-type
          :busy="copy.isPending.value"
          @copy="copyRecipe"
        />
      </ul>

      <!-- Sans recherche : une section par catégorie, dans l'ordre du produit -->
      <template v-else>
        <section
          v-for="group in groups"
          :key="group.typeSlug"
          :aria-labelledby="`others-type-${group.typeSlug}`"
          class="flex flex-col gap-3"
        >
          <h2 :id="`others-type-${group.typeSlug}`" class="font-display text-xl font-bold">
            {{ capitalized(group.typeName) }}
          </h2>
          <ul class="flex flex-col gap-3">
            <OtherRecipeItem
              v-for="recipe in group.recipes"
              :key="recipe.id"
              :recipe="recipe"
              :show-type="false"
              :busy="copy.isPending.value"
              @copy="copyRecipe"
            />
          </ul>
        </section>
      </template>
    </template>

    <UiButton
      v-if="others.hasNextPage.value"
      variant="secondary"
      class="self-center"
      :disabled="others.isFetchingNextPage.value"
      @click="others.fetchNextPage()"
    >
      {{ t('recipes.othersMore') }}
    </UiButton>
  </main>
</template>
