<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { hasFailed } from '@/api/query'
import LoadError from '@/design/LoadError.vue'
import SeasonEmpty from '@/design/season/SeasonEmpty.vue'
import UiButton from '@/design/UiButton.vue'
import UiSearchField from '@/design/UiSearchField.vue'
import { useDebounced } from '@/features/ingredients/useDebounced'
import OtherRecipeItem from './OtherRecipeItem.vue'
import OtherRecipeTypeTiles from './OtherRecipeTypeTiles.vue'
import { useCopiedRecipesStore } from './copiedRecipes'
import { capitalized, keepCopied, type CopiedPin, type OtherRecipe } from './otherRecipeGroups'
import {
  MIN_OTHERS_SEARCH_LENGTH,
  useOtherPeopleRecipes,
  useOtherPeopleTypes,
  useRecipeTypes,
} from './queries'
import { useCopyRecipeAction } from './useCopyRecipeAction'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Les tuiles : les catégories qui ont des recettes à copier (le back les range dans l'ordre du produit, le front ne trie rien). Leur image
// vient des types de recette, déjà lus par « Mes recettes » et joints par `typeSlug` : aucune requête de plus par tuile. Sans image
// (type inconnu, lecture qui échoue) : l'icône neutre de `UiImage`.
const typeCounts = useOtherPeopleTypes()
const recipeTypes = useRecipeTypes()
const tiles = computed(() => {
  const images = new Map(
    (recipeTypes.data.value?.member ?? []).map((type) => [type.slug, type.image]),
  )

  return (typeCounts.data.value?.member ?? []).map((type) => ({
    ...type,
    image: images.get(type.typeSlug) ?? '',
  }))
})

// La catégorie ouverte est dans l'adresse (`?categorie=plat`) : on peut recharger ou partager la page. Une catégorie inconnue ou vide
// (ou qui l'est devenue) affiche les tuiles, sans erreur.
const asked = computed(() =>
  typeof route.query.categorie === 'string' ? route.query.categorie : '',
)
const listed = computed(() => tiles.value.find((type) => type.typeSlug === asked.value) ?? null)
// Copier la dernière recette d'une catégorie ouverte la fait disparaître des tuiles à la relecture : la catégorie reste ouverte (avec sa
// recette « Copiée » et le compte du début de la visite) jusqu'à la sortie de l'écran ou de la catégorie.
const opened = shallowRef<(typeof tiles.value)[number] | null>(null)
watch(
  [listed, asked],
  ([found, slug]) => {
    if (slug === '') opened.value = null
    else if (found !== null && opened.value?.typeSlug !== slug) opened.value = found
  },
  { immediate: true },
)
const category = computed(() =>
  opened.value !== null && opened.value.typeSlug === asked.value ? opened.value : listed.value,
)
const categorySlug = computed(() => category.value?.typeSlug ?? null)

// La requête attend une pause dans la frappe (comme la recherche d'ingrédients) ; effacer le champ revient tout de suite à la liste.
// Sur les tuiles le champ cherche partout, dans une catégorie il cherche dans cette catégorie seulement.
const search = ref('')
const paused = useDebounced(search)
// Un texte ne vaut que dans la portée où il a été tapé : en changeant de catégorie (ou en revenant aux tuiles) l'ancien texte ne cherche plus nulle part
const typedIn = ref<string | null>(null)
watch(
  search,
  () => {
    typedIn.value = categorySlug.value
  },
  { flush: 'sync' },
)
const term = computed(() =>
  search.value.trim() === '' || typedIn.value !== categorySlug.value ? '' : paused.value.trim(),
)
const isSearching = computed(() => term.value.length >= MIN_OTHERS_SEARCH_LENGTH)

// Une liste de recettes n'est demandée que dans une catégorie ou pour une recherche : sur les tuiles seules, le compte suffit.
const others = useOtherPeopleRecipes(
  () => term.value,
  () => categorySlug.value,
  () => categorySlug.value !== null || isSearching.value,
)
const copying = useCopyRecipeAction()
// Une nouvelle visite de l'écran repart de zéro : rien n'est « Copiée » d'une visite à l'autre
useCopiedRecipesStore().clear()
// Copier ne quitte pas la liste. La recette copiée n'est plus « à copier » : le back ne la rend plus à la relecture, on la garde
// donc à sa place (avec « Copiée ») pour la visite ; une autre recherche, ou une autre catégorie, repart d'une liste neuve.
const pins = ref<CopiedPin[]>([])
watch([term, categorySlug], () => (pins.value = []))
// Une autre catégorie repart d'un champ vide ; l'ouvrir depuis les tuiles montre son début (le retour d'historique, lui, retrouve sa place)
watch(categorySlug, (now, before) => {
  search.value = ''
  // Le texte en attente de la pause appartient à l'ancienne portée : un nouveau texte tapé tout de suite ne le reprend pas
  paused.value = ''
  if (now !== null && before === null) void nextTick(() => window.scrollTo(0, 0))
})
const fetched = computed(() => others.data.value?.pages.flatMap((page) => page.member) ?? [])
const items = computed(() => keepCopied(fetched.value, pins.value))
const total = computed(() => others.data.value?.pages[0]?.totalItems ?? 0)

// Une relecture ratée garde ce qui est affiché ; mais les résultats d'une autre recherche ne remplacent pas une erreur
const failed = computed(
  () =>
    others.isError.value &&
    (others.data.value === undefined || others.isPlaceholderData.value === true),
)
const refining = computed(() => others.isPlaceholderData.value === true)
const showsList = computed(() => categorySlug.value !== null || isSearching.value)
// Rien à chercher quand le back n'a aucune recette à proposer : ni tuile ni champ
const nothingToCopy = computed(
  () =>
    !typeCounts.isPending.value &&
    !typeCounts.isError.value &&
    tiles.value.length === 0 &&
    category.value === null,
)

// Pas de champ pendant le chargement, ni quand la lecture a échoué, ni quand il n'y a rien à chercher
const canSearch = computed(
  () => !typeCounts.isPending.value && !hasFailed(typeCounts) && !nothingToCopy.value,
)

function copyRecipe(recipe: OtherRecipe) {
  const index = items.value.findIndex((candidate) => candidate.id === recipe.id)
  // Une fois copiée la recette est gardée à sa place ; un refus du back (dit par le retour commun des écritures) ne garde rien
  copying.copy(recipe, () => (pins.value = [...pins.value, { recipe, index }]))
}

// Le lien « Recettes des autres » d'une catégorie fait comme le retour de l'historique quand on vient des tuiles (tuiles, catégorie, tuiles
// n'empile pas trois entrées et le retour du téléphone ne rouvre pas la catégorie) ; ouverte directement par son adresse, il remplace l'adresse.
const tilesHref = computed(() => router.resolve({ name: 'recipes-others' }).fullPath)
function backToTiles(event: MouseEvent) {
  // Un clic avec une touche (nouvel onglet) garde le comportement du navigateur
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const previous = (router.options.history.state as { back?: string | null }).back
  if (previous === tilesHref.value) router.back()
  else void router.replace({ name: 'recipes-others' })
}
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <!-- Une catégorie ouverte : retour aux tuiles, son nom, son compte -->
    <template v-if="category !== null">
      <RouterLink v-slot="{ href }" :to="{ name: 'recipes-others' }" custom>
        <a
          :href="href"
          class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
          @click="backToTiles"
        >
          {{ t('recipes.othersTitle') }}
        </a>
      </RouterLink>
      <header>
        <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
          {{ capitalized(category.typeName) }}
        </h1>
        <p class="mt-1 text-muted">
          {{ t('recipes.othersCount', { count: category.count }, category.count) }}
        </p>
      </header>
    </template>
    <template v-else>
      <RouterLink :to="{ name: 'recipes' }" class="self-start font-bold text-primary underline">
        {{ t('recipes.title') }}
      </RouterLink>
      <header>
        <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
          {{ t('recipes.othersTitle') }}
        </h1>
        <p class="mt-1 text-muted">{{ t('recipes.othersHelp') }}</p>
      </header>
    </template>

    <UiSearchField
      v-if="canSearch"
      v-model="search"
      :label="category !== null ? t('recipes.othersSearchInType') : t('recipes.othersSearch')"
      :maxlength="100"
    />

    <p v-if="typeCounts.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <LoadError v-else-if="hasFailed(typeCounts) && category === null" />
    <SeasonEmpty v-else-if="nothingToCopy" name="empty-recipes">
      <p class="text-muted">{{ t('recipes.othersNone') }}</p>
    </SeasonEmpty>

    <!-- Les tuiles, tant qu'il n'y a ni catégorie ouverte ni recherche -->
    <OtherRecipeTypeTiles v-else-if="!showsList" :types="tiles" />

    <p v-else-if="others.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <LoadError v-else-if="failed" />
    <SeasonEmpty v-else-if="items.length === 0 && !isSearching" name="empty-recipes">
      <p class="text-muted">{{ t('recipes.othersNone') }}</p>
    </SeasonEmpty>
    <SeasonEmpty v-else-if="items.length === 0" name="empty-search">
      <p class="text-muted" role="status">{{ t('recipes.othersNoMatch', { search: term }) }}</p>
    </SeasonEmpty>

    <template v-else>
      <p v-if="isSearching" class="sr-only" role="status">
        {{ refining ? t('common.loading') : t('recipes.othersCount', { count: total }, total) }}
      </p>

      <!-- Une liste simple : par pertinence avec une recherche (la catégorie sur chaque ligne quand elle porte sur tout), sinon par nom -->
      <ul
        :aria-label="
          isSearching ? t('recipes.othersResults') : capitalized(category?.typeName ?? '')
        "
        :aria-busy="refining"
        class="flex flex-col gap-3 transition-opacity"
        :class="{ 'opacity-60': refining }"
      >
        <OtherRecipeItem
          v-for="recipe in items"
          :key="recipe.id"
          :recipe="recipe"
          :show-type="category === null"
          :busy="copying.pending.value"
          :copied="copying.isCopied(recipe.id)"
          @copy="copyRecipe"
        />
      </ul>
    </template>

    <UiButton
      v-if="showsList && others.hasNextPage.value"
      variant="secondary"
      class="self-center"
      :disabled="others.isFetchingNextPage.value"
      @click="others.fetchNextPage()"
    >
      {{ t('recipes.othersMore') }}
    </UiButton>
  </main>
</template>
