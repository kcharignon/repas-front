<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { Minus, Plus, Trash2 } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import UiCheckbox from '@/design/UiCheckbox.vue'
import UiProgressBar from '@/design/UiProgressBar.vue'
import { formatQuantity, imageUrl } from './format'
import {
  useActiveShoppingList,
  useChangeServing,
  useEnsureActiveShoppingList,
  useToggleRow,
  useUnplanRecipe,
} from './queries'

const { t } = useI18n()

const { summary, id, detail, forget } = useActiveShoppingList()
const ensure = useEnsureActiveShoppingList()
const toggle = useToggleRow(() => id.value)
const changeServing = useChangeServing()
const unplan = useUnplanRecipe()

const tab = ref<'ingredients' | 'recipes'>('ingredients')

function createList() {
  ensure.mutate(undefined, { onSuccess: forget })
}

const rows = computed(
  () => detail.data.value?.departments.flatMap((department) => department.rows) ?? [],
)
const done = computed(() => rows.value.filter((row) => row.checked).length)
const version = computed(() => detail.data.value?.version ?? 0)
const meals = computed(() => detail.data.value?.recipeTypes.flatMap((type) => type.meals) ?? [])

const tabClass =
  'min-h-11 flex-1 cursor-pointer rounded-xl text-[15px] font-semibold text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm'
const stepClass =
  'flex size-11 cursor-pointer items-center justify-center rounded-xl text-ink hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40'
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <p v-if="summary.isPending.value" class="text-muted" role="status">{{ t('common.loading') }}</p>

    <p
      v-else-if="summary.isError.value"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>

    <section v-else-if="id === null" class="flex flex-col items-start gap-4 py-10">
      <h1 class="font-display text-3xl leading-tight font-bold">
        {{ t('shoppingList.noneTitle') }}
      </h1>
      <p class="max-w-md text-muted">{{ t('shoppingList.noneHelp') }}</p>
      <UiButton size="lg" :disabled="ensure.isPending.value" @click="createList">
        {{ t('shoppingList.create') }}
      </UiButton>
    </section>

    <template v-else-if="detail.data.value">
      <header>
        <p class="text-sm font-bold text-primary">{{ t('shoppingList.current') }}</p>
        <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
          {{ detail.data.value.displayName }}
        </h1>
        <p v-if="detail.data.value.name" class="mt-1 text-muted">
          {{ t('shoppingList.dateLabel', { date: detail.data.value.dateLabel }) }}
        </p>
      </header>

      <section
        v-if="detail.data.value.isCompleted"
        role="status"
        class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
      >
        <h2 class="font-display text-xl font-bold">{{ t('shoppingList.completedTitle') }}</h2>
        <p class="text-muted">{{ t('shoppingList.completedHelp') }}</p>
        <UiButton variant="secondary" :disabled="ensure.isPending.value" @click="createList">
          {{ t('shoppingList.startNew') }}
        </UiButton>
      </section>

      <div class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between text-sm text-muted">
          <span>
            <strong class="text-base text-ink">{{
              t('shoppingList.progress', { done, total: rows.length })
            }}</strong>
          </span>
          <span>{{ rows.length === 0 ? 0 : Math.round((done / rows.length) * 100) }} %</span>
        </div>
        <UiProgressBar
          :value="done"
          :max="rows.length"
          :label="t('shoppingList.progress', { done, total: rows.length })"
        />
      </div>

      <TabsRoot v-model="tab" class="flex flex-col gap-4">
        <TabsList
          :aria-label="t('shoppingList.sections')"
          class="flex gap-1 rounded-2xl bg-soft p-1"
        >
          <TabsTrigger value="ingredients" :class="tabClass">
            {{ t('shoppingList.ingredientsTab', { count: rows.length }) }}
          </TabsTrigger>
          <TabsTrigger value="recipes" :class="tabClass">
            {{ t('shoppingList.recipesTab', { count: meals.length }) }}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ingredients" class="flex flex-col gap-4">
          <p v-if="rows.length === 0" class="text-muted">
            {{ t('shoppingList.emptyIngredients') }}
          </p>
          <section v-for="department in detail.data.value.departments" :key="department.slug">
            <h2
              class="mb-1.5 flex items-center gap-2 px-0.5 text-xs font-bold tracking-wider text-muted uppercase"
            >
              <img :src="imageUrl(department.image)" alt="" class="size-6 object-contain" />
              {{ department.name }}
            </h2>
            <ul
              class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
            >
              <li v-for="row in department.rows" :key="row.id">
                <UiCheckbox
                  :model-value="row.checked"
                  @update:model-value="
                    (checked) => toggle.mutate({ rowId: row.id, checked: checked === true })
                  "
                >
                  <span class="flex items-baseline justify-between gap-3">
                    <span>{{ row.ingredientName }}</span>
                    <span class="text-sm font-semibold text-muted no-underline">{{
                      formatQuantity(row.quantity, row.unitSymbol)
                    }}</span>
                  </span>
                </UiCheckbox>
              </li>
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="recipes" class="flex flex-col gap-4">
          <p v-if="meals.length === 0" class="text-muted">{{ t('shoppingList.emptyRecipes') }}</p>
          <section v-for="type in detail.data.value.recipeTypes" :key="type.slug">
            <h2
              class="mb-1.5 flex items-center gap-2 px-0.5 text-xs font-bold tracking-wider text-muted uppercase"
            >
              <img :src="imageUrl(type.image)" alt="" class="size-6 object-contain" />
              {{ type.name }}
            </h2>
            <ul class="flex flex-col gap-3">
              <li
                v-for="meal in type.meals"
                :key="meal.id"
                class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <p class="text-lg font-bold">{{ meal.recipeName }}</p>
                  <button
                    type="button"
                    :aria-label="t('shoppingList.unplan', { name: meal.recipeName })"
                    :class="stepClass"
                    @click="unplan.mutate({ recipeId: meal.recipeId, version })"
                  >
                    <Trash2 class="size-5" aria-hidden="true" />
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm font-semibold text-muted">{{
                    t('shoppingList.serving')
                  }}</span>
                  <span class="inline-flex items-center rounded-2xl border-[1.5px] border-line">
                    <button
                      type="button"
                      :aria-label="t('shoppingList.fewer', { name: meal.recipeName })"
                      :disabled="meal.serving <= 1"
                      :class="stepClass"
                      @click="
                        changeServing.mutate({
                          mealId: meal.id,
                          serving: meal.serving - 1,
                          version,
                        })
                      "
                    >
                      <Minus class="size-5" aria-hidden="true" />
                    </button>
                    <span class="min-w-8 text-center text-lg font-bold" aria-live="polite">{{
                      meal.serving
                    }}</span>
                    <button
                      type="button"
                      :aria-label="t('shoppingList.more', { name: meal.recipeName })"
                      :class="stepClass"
                      @click="
                        changeServing.mutate({
                          mealId: meal.id,
                          serving: meal.serving + 1,
                          version,
                        })
                      "
                    >
                      <Plus class="size-5" aria-hidden="true" />
                    </button>
                  </span>
                </div>
              </li>
            </ul>
          </section>
        </TabsContent>
      </TabsRoot>
    </template>

    <p
      v-else-if="detail.isError.value"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>
    <p v-else class="text-muted" role="status">{{ t('common.loading') }}</p>
  </main>
</template>
