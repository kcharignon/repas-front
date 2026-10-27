<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronLeft, TriangleAlert } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import type { IngredientToFix } from '@/api'
import UiButton from '@/design/UiButton.vue'
import type { EquationValue } from './equationMath'
import OwnConversionSheet from './OwnConversionSheet.vue'
import { useIngredientsToFix, useUnits } from './queries'

/**
 * « Ingrédients à régler » : les ingrédients de l'utilisateur dont l'unité des recettes ne se convertit pas en unité d'achat (le back les
 * liste, `GET /api/v1/ingredients/to-fix`). Une carte chacun, avec le bouton « Régler » qui ouvre la même feuille que la ligne d'une
 * recette : « 1 [unité d'achat] = ? [unité des recettes] », le nombre à trouver. L'ingrédient disparaît de la liste dès que la
 * conversion est enregistrée (la lecture est renouvelée par l'écriture).
 */
const { t } = useI18n()

const toFix = useIngredientsToFix()
const items = computed<IngredientToFix[]>(() => toFix.data.value?.member ?? [])
const total = computed(() => toFix.data.value?.totalItems ?? 0)
// Le back n'en donne que 200 : au-delà, on dit combien il en reste (ils apparaissent à mesure qu'on règle les premiers)
const remaining = computed(() => Math.max(0, total.value - items.value.length))

const units = useUnits(() => items.value.length > 0)
const unitList = computed(() => units.data.value?.member ?? [])

const fixing = reactive<{ open: boolean; slug: string; name: string; initial: EquationValue }>({
  open: false,
  slug: '',
  name: '',
  initial: { start: '', end: '', left: '1', right: '' },
})

// « 1 [unité d'achat] = ? [unité des recettes] » : la question facile à répondre, l'équation n'attend que le nombre
function openFix(item: IngredientToFix) {
  fixing.slug = item.slug
  fixing.name = item.name
  fixing.initial = { start: item.purchaseUnitSlug, end: item.cookingUnitSlug, left: '1', right: '' }
  fixing.open = true
}

// Une carte qui disparaît emporte le focus : il revient au titre, d'où l'on repart
const heading = ref<HTMLElement | null>(null)
async function settle() {
  await nextTick()
  setTimeout(() => heading.value?.focus(), 0)
}
</script>

<template>
  <main class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
    <RouterLink
      :to="{ name: 'departments' }"
      class="inline-flex min-h-11 items-center gap-1 self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ChevronLeft class="size-5" aria-hidden="true" />{{ t('departments.title') }}
    </RouterLink>

    <header>
      <h1
        ref="heading"
        tabindex="-1"
        class="font-display text-3xl leading-tight font-bold focus:outline-none md:text-4xl"
      >
        {{ t('ingredients.toFix.title') }}
      </h1>
      <p v-if="items.length > 0" class="mt-1 text-muted">{{ t('ingredients.toFix.help') }}</p>
    </header>

    <template v-if="hasFailed(toFix)">
      <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft">
        {{ t('ingredients.toFix.failed') }}
      </p>
      <UiButton class="self-start" @click="toFix.refetch()">{{
        t('ingredients.toFix.retry')
      }}</UiButton>
    </template>
    <p v-else-if="toFix.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="items.length === 0" class="font-semibold text-primary" role="status">
      {{ t('ingredients.toFix.none') }}
    </p>

    <template v-else>
      <p class="text-sm font-semibold text-on-warning-soft" aria-live="polite" role="status">
        {{ t('ingredients.toFix.count', { count: total }, total) }}
      </p>

      <ul class="flex flex-col gap-3" data-testid="to-fix-list">
        <li
          v-for="item in items"
          :key="item.slug"
          class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4"
          data-testid="to-fix-card"
        >
          <span class="min-w-0 flex-1">
            <RouterLink
              :to="{ name: 'ingredient-edit', params: { slug: item.slug } }"
              class="block text-[17px] font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              :aria-label="t('ingredients.toFix.openNamed', { name: item.name })"
            >
              {{ item.name }}
            </RouterLink>
            <span class="block text-sm text-muted">{{ item.departmentName }}</span>
            <span
              class="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-on-warning-soft"
            >
              <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
              {{
                t('ingredients.toFix.units', {
                  cooking: item.cookingUnitName,
                  purchase: item.purchaseUnitName,
                })
              }}
            </span>
          </span>
          <button
            type="button"
            class="min-h-11 shrink-0 cursor-pointer rounded-lg px-3 text-sm font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="t('ingredients.toFix.fixNamed', { name: item.name })"
            @click="openFix(item)"
          >
            {{ t('ingredients.toFix.fix') }}
          </button>
        </li>
      </ul>

      <p v-if="remaining > 0" class="text-sm text-muted">
        {{ t('ingredients.toFix.more', { count: remaining }, remaining) }}
      </p>
    </template>

    <OwnConversionSheet
      v-model:open="fixing.open"
      :ingredient-slug="fixing.slug"
      :ingredient-name="fixing.name"
      :units="unitList"
      :initial="fixing.initial"
      @saved="settle"
    />
  </main>
</template>
