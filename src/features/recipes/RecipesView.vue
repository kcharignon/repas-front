<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import LoadError from '@/design/LoadError.vue'
import SeasonEmpty from '@/design/season/SeasonEmpty.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import SeasonArt from '@/design/season/SeasonArt.vue'
import UiTile from '@/design/UiTile.vue'
import UiImage from '@/design/UiImage.vue'
import PlanButton from './PlanButton.vue'
import { useRecipeTypes, useRecipesByType } from './queries'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const types = useRecipeTypes()
const search = ref('')

// Le type affiché est dans l'adresse (`?type=plat`) : on peut partager ou recharger la page ; à défaut, le premier.
// Un type sans recette de la personne n'est pas montré. Un back plus ancien ne rend pas `recipeCount` : le type reste affiché.
const shownTypes = computed(() =>
  (types.data.value?.member ?? []).filter(
    (type) => (type as { recipeCount?: number }).recipeCount !== 0,
  ),
)

const current = computed<string | null>(() => {
  const asked = typeof route.query.type === 'string' ? route.query.type : null
  const known = shownTypes.value

  return known.find((type) => type.slug === asked)?.slug ?? known[0]?.slug ?? null
})

const recipes = useRecipesByType(() => current.value)
const shown = computed(() => {
  const needle = search.value.trim().toLowerCase()

  return (recipes.data.value?.member ?? []).filter((recipe) =>
    recipe.name.toLowerCase().includes(needle),
  )
})

// Les noms de types sont saisis librement (« plat », « Boisson ») : on les affiche tous avec une majuscule.
function capitalized(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function choose(slug: string) {
  void router.replace({ query: { ...route.query, type: slug } })
}
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        <SeasonArt name="title-recipes" class="mr-2 size-9 align-middle md:size-10" />{{
          t('recipes.title')
        }}
      </h1>
      <div class="flex flex-wrap items-center gap-3">
        <RouterLink :to="{ name: 'recipes-others' }" class="font-bold text-primary underline">
          {{ t('recipes.others') }}
        </RouterLink>
        <UiLinkButton :to="{ name: 'recipe-new' }">{{ t('recipes.new') }}</UiLinkButton>
      </div>
    </header>

    <label
      class="flex min-h-12 items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-surface px-3.5 text-muted focus-within:border-primary"
    >
      <Search class="size-5 shrink-0" aria-hidden="true" />
      <span class="sr-only">{{ t('recipes.search') }}</span>
      <input
        v-model="search"
        type="search"
        :placeholder="t('recipes.search')"
        class="min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
      />
    </label>

    <!-- Une grille et non un défilement : tous les types sont visibles, un type de plus passe à la ligne tout seul. -->
    <div
      v-if="shownTypes.length > 0"
      role="group"
      :aria-label="t('recipes.types')"
      class="grid grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))] gap-1.5 md:grid-cols-[repeat(auto-fit,minmax(5.5rem,6.5rem))]"
    >
      <UiTile
        v-for="type in shownTypes"
        :key="type.slug"
        :pressed="type.slug === current"
        @update:pressed="choose(type.slug)"
      >
        <template #icon>
          <UiImage :src="type.image" class="size-8" />
        </template>
        {{ capitalized(type.name) }}
      </UiTile>
    </div>

    <LoadError v-if="hasFailed(types) || hasFailed(recipes)" />
    <p
      v-else-if="types.isPending.value || (current !== null && recipes.isPending.value)"
      class="text-muted"
      role="status"
    >
      {{ t('common.loading') }}
    </p>
    <SeasonEmpty
      v-else-if="shown.length === 0"
      :name="search.trim() === '' ? 'empty-recipes' : 'empty-search'"
    >
      <p class="text-muted">
        {{ search.trim() === '' ? t('recipes.none') : t('recipes.noMatch') }}
      </p>
    </SeasonEmpty>

    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="recipe in shown"
        :key="recipe.id"
        class="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
      >
        <RouterLink
          :to="{ name: 'recipe', params: { id: recipe.id } }"
          class="min-w-0 flex-1 text-lg font-bold [overflow-wrap:anywhere] hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          {{ recipe.name }}
        </RouterLink>
        <PlanButton :recipe-id="recipe.id" :name="recipe.name" variant="icon" />
      </li>
    </ul>
  </main>
</template>
