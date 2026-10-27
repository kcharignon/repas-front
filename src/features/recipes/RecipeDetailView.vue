<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { TriangleAlert } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import { ApiError } from '@/api'
import type { RecipeRow } from '@/api'
import { notifyDeleteFailure } from '@/notifications/failures'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import type { EquationValue } from '@/features/ingredients/equationMath'
import OwnConversionSheet from '@/features/ingredients/OwnConversionSheet.vue'
import { useUnits } from '@/features/ingredients/queries'
import { formatQuantity } from '@/features/shopping-lists/format'
import PlanButton from './PlanButton.vue'
import { useDeleteRecipe, useRecipe, useRecipesByType } from './queries'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const recipe = useRecipe(() => String(route.params.id))
const mine = useRecipesByType(() => recipe.data.value?.typeSlug ?? null)
const remove = useDeleteRecipe()

// Le détail d'une recette est lisible par tous ; on ne propose de la modifier ou de la supprimer que si elle est à soi
// (le back refuse de toute façon : 403).
const isMine = computed(
  () => mine.data.value?.member?.some((candidate) => candidate.id === route.params.id) === true,
)
const deleting = ref(false)

// Un ingrédient que le back ne sait pas convertir dans son unité d'achat (`convertible` faux) : repéré sur sa ligne, et réglé ici par
// l'auteur de la recette (les ingrédients sont les siens). Pour la recette d'un autre, rien : ce ne sont pas ses ingrédients, et une
// copie recopie les conversions propres. Un vieux back sans `convertible` ne signale rien.
const toFix = computed<RecipeRow[]>(() =>
  isMine.value ? (recipe.data.value?.rows ?? []).filter((row) => row.convertible === false) : [],
)
const blocked = computed(() => toFix.value.length > 0)

const units = useUnits(() => blocked.value)
const unitList = computed(() => units.data.value?.member ?? [])

const rows = ref<HTMLElement | null>(null)
const fixing = reactive<{ open: boolean; slug: string; name: string; initial: EquationValue }>({
  open: false,
  slug: '',
  name: '',
  initial: { start: '', end: '', left: '1', right: '' },
})

// « 1 [unité d'achat] = ? [unité de la ligne] » : la question facile à répondre (« 1 kilo = ? cuillères à soupe »), l'équation
// n'attend que le nombre
function openFix(row: RecipeRow) {
  fixing.slug = row.ingredientSlug
  fixing.name = row.ingredientName
  fixing.initial = {
    start: row.purchaseUnitSlug ?? '',
    end: row.unitSlug,
    left: '1',
    right: '',
  }
  fixing.open = true
}

function rowElement(slug: string): HTMLElement | undefined {
  return Array.from(rows.value?.querySelectorAll<HTMLElement>('[data-row]') ?? []).find(
    (element) => element.dataset.row === slug,
  )
}

// La pastille « N à régler » mène à la première ligne signalée
function goToFirstFix() {
  const first = rows.value?.querySelector<HTMLElement>('[data-fix]')
  first?.scrollIntoView({ block: 'center' })
  first?.focus()
}

// Après l'enregistrement le bouton « Régler » disparaît avec l'avertissement : le focus revient à la ligne, pas à la page
const refocus = ref<string | null>(null)
function fixed() {
  refocus.value = fixing.slug
  void nextTick(() => rowElement(fixing.slug)?.focus())
}
watch(
  () => recipe.isFetching.value,
  async (fetching) => {
    if (fetching || refocus.value === null) return
    const slug = refocus.value
    refocus.value = null
    await nextTick()
    const active = document.activeElement
    if (active === null || active === document.body) rowElement(slug)?.focus()
  },
)

function confirmDelete() {
  remove.mutate(
    { id: String(route.params.id) },
    {
      onSuccess: async () => {
        deleting.value = false
        await router.push({ name: 'recipes', query: { type: recipe.data.value?.typeSlug } })
      },
      onError: (error) => {
        deleting.value = false
        notifyDeleteFailure(error, t('recipes.inUse'))
      },
    },
  )
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <RouterLink :to="{ name: 'recipes' }" class="self-start font-bold text-primary underline">
      {{ t('recipes.title') }}
    </RouterLink>

    <template v-if="recipe.data.value">
      <header class="flex flex-col gap-1">
        <p class="text-sm font-bold text-primary">{{ recipe.data.value.typeName }}</p>
        <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
          {{ recipe.data.value.name }}
        </h1>
        <p class="text-muted">
          {{
            t('recipes.forPeople', { count: recipe.data.value.serving }, recipe.data.value.serving)
          }}
        </p>
      </header>

      <div class="flex flex-wrap gap-2">
        <PlanButton
          :recipe-id="recipe.data.value.id"
          :name="recipe.data.value.name"
          :blocked="blocked"
          describedby="plan-blocked-hint"
        />
        <UiLinkButton
          v-if="isMine"
          variant="secondary"
          :to="{ name: 'recipe-edit', params: { id: recipe.data.value.id } }"
        >
          {{ t('recipes.edit') }}
        </UiLinkButton>
        <UiButton v-if="isMine" variant="ghost" @click="deleting = true">{{
          t('common.delete')
        }}</UiButton>
      </div>

      <p
        v-if="blocked"
        id="plan-blocked-hint"
        class="-mt-2 text-sm font-semibold text-on-warning-soft"
      >
        {{ t('recipes.blockedHint') }}
      </p>

      <section>
        <div class="mb-2 flex items-center justify-between gap-3">
          <h2 class="font-display text-2xl font-bold">{{ t('recipes.ingredients') }}</h2>
          <button
            v-if="blocked"
            type="button"
            class="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-warning-soft px-3.5 text-sm font-bold text-on-warning-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :title="t('recipes.toFixHint')"
            @click="goToFirstFix"
          >
            <TriangleAlert class="size-4" aria-hidden="true" />
            {{ t('recipes.toFix', { count: toFix.length }) }}
          </button>
        </div>
        <ul
          ref="rows"
          class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
        >
          <li
            v-for="row in recipe.data.value.rows"
            :key="row.ingredientSlug"
            :data-row="row.ingredientSlug"
            tabindex="-1"
            class="flex min-h-14 flex-col justify-center py-2 focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <div class="flex min-h-10 items-center gap-3">
              <!-- L'image de l'ingrédient (row.ingredientImage) n'est pas affichée : trop d'ingrédients n'en ont pas encore. -->
              <span class="flex-1 font-medium">{{ row.ingredientName }}</span>
              <span class="text-sm font-semibold text-muted">{{
                formatQuantity(row.quantity, row.unitSymbol)
              }}</span>
            </div>
            <div
              v-if="toFix.includes(row)"
              class="flex items-center gap-2 text-[13px] font-semibold text-on-warning-soft"
            >
              <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1">{{
                t('recipes.cannotConvert', { unit: row.purchaseUnitName })
              }}</span>
              <button
                type="button"
                data-fix
                class="-mr-2 min-h-11 shrink-0 cursor-pointer rounded-lg px-3 text-sm font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
                :aria-label="t('recipes.fixNamed', { name: row.ingredientName })"
                @click="openFix(row)"
              >
                {{ t('recipes.fix') }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <OwnConversionSheet
        v-if="isMine"
        v-model:open="fixing.open"
        :ingredient-slug="fixing.slug"
        :ingredient-name="fixing.name"
        :units="unitList"
        :initial="fixing.initial"
        @saved="fixed"
      />

      <UiConfirmDialog
        v-model:open="deleting"
        :title="t('recipes.deleteTitle')"
        :description="t('recipes.deleteHelp', { name: recipe.data.value.name })"
        :confirm-label="t('common.delete')"
        :pending="remove.isPending.value"
        @confirm="confirmDelete"
      />
    </template>

    <p
      v-else-if="hasFailed(recipe)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{
        recipe.error.value instanceof ApiError && recipe.error.value.status === 404
          ? t('errors.notFound')
          : t('errors.unreachable')
      }}
    </p>
    <p v-else class="text-muted" role="status">{{ t('common.loading') }}</p>
  </main>
</template>
