<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { Minus, Plus, Trash2 } from 'lucide-vue-next'

import type { ShoppingList } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiCheckbox from '@/design/UiCheckbox.vue'
import UiProgressBar from '@/design/UiProgressBar.vue'
import { formatQuantity, imageUrl } from './format'
import { useChangeServing, useToggleRow, useUnplanRecipe } from './queries'

const props = defineProps<{ list: ShoppingList; startingNew?: boolean }>()
const emit = defineEmits<{ startNew: [] }>()

const { t } = useI18n()

const toggle = useToggleRow(() => props.list.id)
const changeServing = useChangeServing()
const unplan = useUnplanRecipe()

const tab = ref<'ingredients' | 'recipes'>('ingredients')

const rows = computed(() => props.list.departments.flatMap((department) => department.rows))
const done = computed(() => rows.value.filter((row) => row.checked).length)
const meals = computed(() => props.list.recipeTypes.flatMap((type) => type.meals))

const tabClass =
  'min-h-11 flex-1 cursor-pointer rounded-xl text-[15px] font-semibold text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm'
const stepClass =
  'flex size-11 cursor-pointer items-center justify-center rounded-xl text-ink hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40'
</script>

<template>
  <div class="flex flex-col gap-5">
    <section v-if="list.isSent" role="status" class="rounded-2xl bg-soft px-5 py-4">
      <p class="font-semibold">{{ t('shoppingList.sentHelp') }}</p>
    </section>

    <section
      v-else-if="list.isCompleted"
      role="status"
      class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
    >
      <h2 class="font-display text-xl font-bold">{{ t('shoppingList.completedTitle') }}</h2>
      <p class="text-muted">{{ t('shoppingList.completedHelp') }}</p>
      <UiButton variant="secondary" :disabled="startingNew" @click="emit('startNew')">
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
      <TabsList :aria-label="t('shoppingList.sections')" class="flex gap-1 rounded-2xl bg-soft p-1">
        <TabsTrigger value="ingredients" :class="tabClass">
          {{ t('shoppingList.ingredientsTab', { count: rows.length }) }}
        </TabsTrigger>
        <TabsTrigger value="recipes" :class="tabClass">
          {{ t('shoppingList.recipesTab', { count: meals.length }) }}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ingredients" class="flex flex-col gap-4">
        <p v-if="rows.length === 0" class="text-muted">{{ t('shoppingList.emptyIngredients') }}</p>
        <section v-for="department in list.departments" :key="department.slug">
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
                :disabled="list.isSent"
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
        <section v-for="type in list.recipeTypes" :key="type.slug">
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
                  v-if="list.isActive"
                  type="button"
                  :aria-label="t('shoppingList.unplan', { name: meal.recipeName })"
                  :class="stepClass"
                  @click="unplan.mutate({ recipeId: meal.recipeId, version: list.version })"
                >
                  <Trash2 class="size-5" aria-hidden="true" />
                </button>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-muted">{{
                  t('shoppingList.serving')
                }}</span>
                <span v-if="list.isSent" class="min-w-8 text-center text-lg font-bold">{{
                  meal.serving
                }}</span>
                <span
                  v-else
                  class="inline-flex items-center rounded-2xl border-[1.5px] border-line"
                >
                  <button
                    type="button"
                    :aria-label="t('shoppingList.fewer', { name: meal.recipeName })"
                    :disabled="meal.serving <= 1"
                    :class="stepClass"
                    @click="
                      changeServing.mutate({
                        mealId: meal.id,
                        serving: meal.serving - 1,
                        version: list.version,
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
                        version: list.version,
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
  </div>
</template>
