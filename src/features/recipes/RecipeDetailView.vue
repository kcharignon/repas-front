<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api'
import { notifyDeleteFailure } from '@/notifications/failures'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import { formatQuantity, imageUrl } from '@/features/shopping-lists/format'
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
        <PlanButton :recipe-id="recipe.data.value.id" :name="recipe.data.value.name" />
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

      <section>
        <h2 class="mb-2 font-display text-2xl font-bold">{{ t('recipes.ingredients') }}</h2>
        <ul
          class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
        >
          <li
            v-for="row in recipe.data.value.rows"
            :key="row.ingredientSlug"
            class="flex min-h-14 items-center gap-3"
          >
            <img
              :src="imageUrl(row.ingredientImage)"
              alt=""
              class="size-8 shrink-0 object-contain"
            />
            <span class="flex-1 font-medium">{{ row.ingredientName }}</span>
            <span class="text-sm font-semibold text-muted">{{
              formatQuantity(row.quantity, row.unitSymbol)
            }}</span>
          </li>
        </ul>
      </section>

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
      v-else-if="recipe.isError.value"
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
