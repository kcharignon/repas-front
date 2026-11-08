<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Layers,
  Trash2,
  TriangleAlert,
} from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import { ApiError } from '@/api'
import type { RecipeRow } from '@/api'
import { notifyDeleteFailure, notifyFailure } from '@/notifications/failures'
import DepartmentMarker from '@/design/DepartmentMarker.vue'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiDialog from '@/design/UiDialog.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import SeasonArt from '@/design/season/SeasonArt.vue'
import {
  isAmbiguousName,
  namesInSeveralDepartments,
  useDepartmentIcons,
} from '@/features/ingredients/departmentMarkers'
import type { EquationValue } from '@/features/ingredients/equationMath'
import OwnConversionSheet from '@/features/ingredients/OwnConversionSheet.vue'
import { countsFor } from '@/features/ingredients/partsText'
import { useUnits } from '@/features/ingredients/queries'
import { useSessionStore } from '@/session/session'
import { formatQuantity } from '@/features/shopping-lists/format'
import FavoriteButton from './FavoriteButton.vue'
import PlanButton from './PlanButton.vue'
import SecretBadge from './SecretBadge.vue'
import { useDeleteRecipe } from './queries'
import { useCopyRecipeAction } from './useCopyRecipeAction'
import { useRecipeStance } from './useRecipeStance'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const session = useSessionStore()
const removeOwn = useDeleteRecipe()
// La version commune dit elle-même ses refus (409 : sa propre fenêtre)
const removeCommon = useDeleteRecipe(true)

// Le détail d'une recette est lisible par tous : `useRecipeStance` dit à qui elle est (`canEdit` du back, et pour l'administrateur la liste de
// SES recettes du même type). Tant que ce n'est pas su, `unknown` : la zone des actions reste vide (réservée, sans saut de mise en page)
// au lieu de proposer un jeu d'actions qui changerait aussitôt.
//  - `mine` : Ajouter à la liste, Modifier, Supprimer (le back refuse de toute façon les écritures d'un autre : 403) ;
//  - `other` : « Copier » seulement. Pas d'ajout à la liste : on copie d'abord, puis on planifie sa propre recette ;
//  - `common` (administrateur seul) : la version commune d'une recette Marmiton, sans propriétaire : Modifier, Copier, Supprimer (MAR-005).
const { recipe, sourceUrl, copyId, ownership, isMine, isCommon } = useRecipeStance(() =>
  String(route.params.id),
)
// Sa copie d'une recette Marmiton : l'administrateur peut remonter à l'original, celui que copient les autres (MAR-005)
const commonOriginalId = computed(() => {
  const data = recipe.data.value
  if (!session.isAdmin || !isMine.value || data === undefined || sourceUrl.value === null)
    return null

  return data.originalId ?? null
})
const copying = useCopyRecipeAction()
const deleting = ref(false)
// La version commune est encore dans une liste de courses : rien n'est supprimé, on le dit (409)
const stillInLists = ref(false)

// Un ingrédient que le back ne sait pas convertir dans son unité d'achat (`convertible` faux) : repéré sur sa ligne, et réglé ici par
// l'auteur de la recette (les ingrédients sont les siens). Pour la recette d'un autre, rien : ce ne sont pas ses ingrédients, et une
// copie recopie les conversions propres. Un vieux back sans `convertible` ne signale rien.
const toFix = computed<RecipeRow[]>(() =>
  isMine.value ? (recipe.data.value?.rows ?? []).filter((row) => row.convertible === false) : [],
)
const blocked = computed(() => toFix.value.length > 0)

// Le repère du rayon devant chaque ingrédient, et son rayon sous le nom quand ce nom existe dans deux rayons de la recette (ING-017)
const { iconOf, anyIcon } = useDepartmentIcons()
const ambiguous = computed(() =>
  namesInSeveralDepartments(recipe.data.value?.rows ?? [], (row) => ({
    name: row.ingredientName,
    departmentSlug: row.departmentSlug,
  })),
)
const markers = computed(() =>
  anyIcon((recipe.data.value?.rows ?? []).map((row) => row.departmentSlug)),
)

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

const remove = computed(() => (isCommon.value ? removeCommon : removeOwn))

function confirmDelete() {
  remove.value.mutate(
    { id: String(route.params.id) },
    {
      onSuccess: async () => {
        deleting.value = false
        await (isCommon.value
          ? router.push({ name: 'recipes-others' })
          : router.push({ name: 'recipes', query: { type: recipe.data.value?.typeSlug } }))
      },
      onError: (error) => {
        deleting.value = false
        if (!isCommon.value) notifyDeleteFailure(error, t('recipes.inUse'))
        else if (error instanceof ApiError && error.status === 409) stillInLists.value = true
        else notifyFailure(error)
      },
    },
  )
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <!-- Venu de « Recettes des autres » par le nom : le lien de retour y ramène -->
    <RouterLink
      :to="{ name: ownership === 'other' || isCommon ? 'recipes-others' : 'recipes' }"
      class="self-start font-bold text-primary underline"
    >
      {{ ownership === 'other' || isCommon ? t('recipes.othersTitle') : t('recipes.title') }}
    </RouterLink>

    <template v-if="recipe.data.value">
      <!-- Une recette n'a pas de photo : en saison, une pièce de la saison tient la place de la vignette (ADR 0012) -->
      <div class="flex items-center gap-4">
        <SeasonArt name="recipe-placeholder" class="size-20" />
        <header class="flex min-w-0 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-bold text-primary">{{ recipe.data.value.typeName }}</p>
            <SecretBadge v-if="recipe.data.value.secret === true" />
          </div>
          <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
            {{ recipe.data.value.name }}
          </h1>
          <p class="text-muted">
            {{
              t(
                'recipes.forPeople',
                { count: recipe.data.value.serving },
                recipe.data.value.serving,
              )
            }}
          </p>
          <a
            v-if="sourceUrl !== null"
            :href="sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-xl border-[1.5px] border-primary px-4 text-[15px] font-bold text-primary transition-colors hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >{{ t('recipes.viewOnMarmiton') }}<ExternalLink class="size-4.5" aria-hidden="true"
          /></a>
        </header>
        <!-- Le choix de l'auteur : l'étoile n'est proposée que sur ses propres recettes -->
        <FavoriteButton
          v-if="isMine"
          class="ml-auto self-center"
          :recipe-id="recipe.data.value.id"
          :name="recipe.data.value.name"
          :favorite="recipe.data.value.favorite === true"
        />
      </div>

      <!-- La version commune : ce que l'administrateur change est ce que les prochains copieront -->
      <section
        v-if="isCommon"
        data-common-banner
        aria-labelledby="common-title"
        class="flex flex-col gap-1.5 rounded-2xl bg-secret-soft px-4 py-3.5 text-on-secret-soft"
      >
        <h2 id="common-title" class="flex items-center gap-2 font-bold">
          <Layers class="size-5" aria-hidden="true" />{{ t('recipes.common.title') }}
        </h2>
        <p>{{ t('recipes.common.help') }}</p>
      </section>

      <!-- La place des actions est réservée même quand on ne sait pas encore à qui est la recette -->
      <div class="flex min-h-11 flex-wrap gap-2" :aria-busy="ownership === 'unknown'">
        <template v-if="ownership === 'mine'">
          <PlanButton
            :recipe-id="recipe.data.value.id"
            :name="recipe.data.value.name"
            :blocked="blocked"
            describedby="plan-blocked-hint"
          />
          <UiLinkButton
            variant="secondary"
            :to="{ name: 'recipe-edit', params: { id: recipe.data.value.id } }"
          >
            {{ t('recipes.edit') }}
          </UiLinkButton>
          <UiButton variant="ghost" @click="deleting = true">{{ t('common.delete') }}</UiButton>
        </template>
        <template v-else-if="isCommon">
          <UiLinkButton
            variant="primary"
            :to="{ name: 'recipe-edit', params: { id: recipe.data.value.id } }"
          >
            {{ t('recipes.edit') }}
          </UiLinkButton>
          <UiLinkButton
            v-if="copyId !== null"
            variant="secondary"
            :to="{ name: 'recipe', params: { id: copyId } }"
          >
            {{ t('recipes.common.yourCopy') }}
          </UiLinkButton>
          <UiButton
            v-else-if="copying.isCopied(recipe.data.value.id)"
            variant="ghost"
            class="bg-soft text-primary disabled:opacity-100"
            :aria-label="t('recipes.copiedNamed', { name: recipe.data.value.name })"
            disabled
          >
            <Check class="size-5" aria-hidden="true" />{{ t('recipes.copied') }}
          </UiButton>
          <UiButton
            v-else
            variant="secondary"
            :aria-label="t('recipes.copyNamed', { name: recipe.data.value.name })"
            :disabled="copying.pending.value"
            @click="copying.copy(recipe.data.value)"
          >
            <Copy class="size-5" aria-hidden="true" />{{ t('recipes.copy') }}
          </UiButton>
        </template>
        <template v-else-if="ownership === 'other'">
          <UiLinkButton
            v-if="copyId !== null"
            variant="secondary"
            :to="{ name: 'recipe', params: { id: copyId } }"
          >
            {{ t('recipes.common.yourCopy') }}
          </UiLinkButton>
          <UiButton
            v-else-if="copying.isCopied(recipe.data.value.id)"
            variant="ghost"
            class="bg-soft text-primary disabled:opacity-100"
            :aria-label="t('recipes.copiedNamed', { name: recipe.data.value.name })"
            disabled
          >
            <Check class="size-5" aria-hidden="true" />{{ t('recipes.copied') }}
          </UiButton>
          <UiButton
            v-else
            variant="secondary"
            :aria-label="t('recipes.copyNamed', { name: recipe.data.value.name })"
            :disabled="copying.pending.value"
            @click="copying.copy(recipe.data.value)"
          >
            <Copy class="size-5" aria-hidden="true" />{{ t('recipes.copy') }}
          </UiButton>
        </template>
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
              <DepartmentMarker :icon="iconOf(row.departmentSlug)" :reserve="markers" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="font-medium">{{ row.ingredientName }}</span>
                <span
                  v-if="isAmbiguousName(ambiguous, row.ingredientName) && row.departmentName"
                  class="text-sm text-muted"
                  >{{ row.departmentName }}</span
                >
                <!-- Une partie d'un ingrédient (SUB-007) : une mention discrète, pas une alerte -->
                <span v-if="row.partOfName" data-testid="row-part-of" class="text-sm text-muted">{{
                  t('recipes.partMention', { counts: countsFor(row.partOfName) })
                }}</span>
              </span>
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

      <!-- Sa copie d'une recette Marmiton : l'administrateur remonte à la version commune, celle que copient les autres -->
      <RouterLink
        v-if="commonOriginalId !== null"
        data-common-link
        :to="{ name: 'recipe', params: { id: commonOriginalId } }"
        class="flex min-h-16 items-center gap-3 rounded-2xl bg-secret-soft px-3.5 py-2.5 text-on-secret-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-primary"
          ><Layers class="size-5.5" aria-hidden="true"
        /></span>
        <span class="min-w-0 flex-1">
          <span class="block font-bold">{{ t('recipes.common.open') }}</span>
          <span class="block text-sm">{{ t('recipes.common.openHint') }}</span>
        </span>
        <ChevronRight class="size-5.5 shrink-0" aria-hidden="true" />
      </RouterLink>

      <!-- Tout en bas, loin de « Modifier » : une suppression ne se fait pas par erreur -->
      <div v-if="isCommon" class="mt-4 flex">
        <UiButton
          variant="ghost"
          class="min-h-12 flex-1 border-[1.5px] border-danger text-danger hover:bg-danger-soft"
          @click="deleting = true"
        >
          <Trash2 class="size-5" aria-hidden="true" />{{ t('recipes.common.delete') }}
        </UiButton>
      </div>

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
        :title="isCommon ? t('recipes.common.deleteTitle') : t('recipes.deleteTitle')"
        :description="
          isCommon
            ? t('recipes.common.deleteHelp')
            : t('recipes.deleteHelp', { name: recipe.data.value.name })
        "
        :confirm-label="t('common.delete')"
        :pending="remove.isPending.value"
        @confirm="confirmDelete"
      />

      <UiDialog
        v-model:open="stillInLists"
        :title="t('recipes.common.cannotDeleteTitle')"
        :description="t('recipes.common.cannotDelete')"
      >
        <div class="flex justify-end">
          <UiButton size="lg" class="w-full" @click="stillInLists = false">{{
            t('common.close')
          }}</UiButton>
        </div>
      </UiDialog>
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
