<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import type { UsableRecipe } from '@/api'
import LoadError from '@/design/LoadError.vue'
import UiButton from '@/design/UiButton.vue'
import UiChip from '@/design/UiChip.vue'
import UiSearchField from '@/design/UiSearchField.vue'
import UiSheet from '@/design/UiSheet.vue'
import { useDebounced } from '@/features/ingredients/useDebounced'
import SecretBadge from './SecretBadge.vue'
import { useUsableRecipes } from './queries'

/**
 * « Choisis une de tes recettes » (COMP-006) : la feuille du bas qui propose les recettes qu'on peut utiliser dans celle qu'on écrit. Le back
 * ne propose ni la recette elle-même ni une recette qui en utilise déjà d'autres, et les secrètes seulement quand la recette l'est
 * aussi (`secret`). Toucher une ligne l'ajoute avec 1 fois et ferme la feuille. Les recettes déjà choisies ne sont pas proposées.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  /** La recette qu'on modifie (`null` : on en écrit une nouvelle). */
  forRecipeId: string | null
  /** La recette écrite est, ou va devenir, secrète. */
  secret: boolean
  /** Les recettes déjà utilisées ici : elles ne sont plus proposées. */
  chosen: readonly string[]
}>()

const emit = defineEmits<{ pick: [recipe: UsableRecipe] }>()

const { t } = useI18n()

const search = ref('')
const paused = useDebounced(search)
const term = computed(() => (search.value.trim() === '' ? '' : paused.value.trim()))
const type = ref('')

// Chaque ouverture repart d'une feuille neuve : ni l'ancienne recherche ni l'ancien type
watch(open, (isOpen) => {
  if (!isOpen) return
  search.value = ''
  type.value = ''
})

const usable = useUsableRecipes(
  () => props.forRecipeId,
  () => props.secret,
  () => term.value,
  () => open.value,
)

const offered = computed(() =>
  (usable.data.value?.member ?? []).filter((recipe) => !props.chosen.includes(recipe.id)),
)
// Les types de ce qui est proposé, dans l'ordre où le back les rend (une seule puce « Tous » quand il n'y en a qu'un)
const types = computed(() => {
  const seen = new Map<string, string>()
  for (const recipe of offered.value)
    if (!seen.has(recipe.typeSlug)) seen.set(recipe.typeSlug, recipe.typeName)

  return [...seen].map(([slug, name]) => ({ slug, name }))
})
// Un type qui n'est plus proposé (la recherche a changé) n'est plus un filtre
const filter = computed(() =>
  types.value.some((entry) => entry.slug === type.value) ? type.value : '',
)
const shown = computed(() =>
  filter.value === ''
    ? offered.value
    : offered.value.filter((recipe) => recipe.typeSlug === filter.value),
)
const searching = computed(() => search.value.trim() !== '')

function choose(recipe: UsableRecipe) {
  emit('pick', recipe)
  open.value = false
}
</script>

<template>
  <UiSheet v-model:open="open" :title="t('recipes.pick.title')">
    <p
      v-if="usable.isPending.value && usable.data.value === undefined"
      class="text-muted"
      role="status"
    >
      {{ t('common.loading') }}
    </p>
    <LoadError v-else-if="hasFailed(usable)" />
    <template v-else>
      <!-- Rien à choisir du tout : une phrase, une aide, un bouton (pas de recherche qui ne trouverait rien) -->
      <div v-if="offered.length === 0 && !searching" data-pick-none class="flex flex-col gap-4">
        <div class="flex flex-col gap-2 pt-2">
          <p class="text-lg font-bold">{{ t('recipes.pick.none') }}</p>
          <p class="text-muted">{{ t('recipes.pick.noneHint') }}</p>
        </div>
        <UiButton size="lg" class="w-full" @click="open = false">{{ t('common.close') }}</UiButton>
      </div>
      <template v-else>
        <UiSearchField v-model="search" :label="t('recipes.search')" :maxlength="100" />
        <div
          v-if="types.length > 1"
          role="group"
          :aria-label="t('recipes.types')"
          class="-mr-5 flex gap-2 overflow-x-auto pr-5"
        >
          <UiChip :pressed="filter === ''" @update:pressed="type = ''">{{
            t('recipes.pick.all')
          }}</UiChip>
          <UiChip
            v-for="entry in types"
            :key="entry.slug"
            :pressed="filter === entry.slug"
            @update:pressed="type = entry.slug"
            >{{ entry.name }}</UiChip
          >
        </div>
        <p v-if="shown.length === 0" class="text-muted" role="status">
          {{ t('recipes.noMatch') }}
        </p>
        <ul v-else class="flex flex-col divide-y divide-line">
          <li v-for="recipe in shown" :key="recipe.id">
            <button
              type="button"
              data-usable
              class="flex min-h-16 w-full cursor-pointer items-center gap-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              @click="choose(recipe)"
            >
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-[17px] font-bold [overflow-wrap:anywhere]">{{
                  recipe.name
                }}</span>
                <span class="flex flex-wrap items-center gap-2">
                  <span class="text-sm text-muted"
                    >{{ recipe.typeName }} ·
                    {{ t('recipes.forPeople', { count: recipe.serving }, recipe.serving) }}</span
                  >
                  <SecretBadge v-if="recipe.secret" />
                </span>
              </span>
              <span
                aria-hidden="true"
                class="flex size-9 shrink-0 items-center justify-center rounded-full bg-soft text-primary"
                ><Plus class="size-5"
              /></span>
            </button>
          </li>
        </ul>
      </template>
    </template>
  </UiSheet>
</template>
