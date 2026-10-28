<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { Copy } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import LoadError from '@/design/LoadError.vue'
import SeasonEmpty from '@/design/season/SeasonEmpty.vue'
import UiButton from '@/design/UiButton.vue'
import { useCopyRecipe, useOtherPeopleRecipes } from './queries'

const { t } = useI18n()
const router = useRouter()

const others = useOtherPeopleRecipes()
const copy = useCopyRecipe()
const items = computed(() => others.data.value?.pages.flatMap((page) => page.member) ?? [])

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

    <p v-if="others.isPending.value" class="text-muted" role="status">{{ t('common.loading') }}</p>
    <LoadError v-else-if="hasFailed(others)" />
    <SeasonEmpty v-else-if="items.length === 0" name="empty-recipes">
      <p class="text-muted">{{ t('recipes.othersNone') }}</p>
    </SeasonEmpty>

    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="recipe in items"
        :key="recipe.id"
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
      >
        <RouterLink
          :to="{ name: 'recipe', params: { id: recipe.id } }"
          class="flex min-w-0 flex-1 flex-col hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span class="text-lg font-bold">{{ recipe.name }}</span>
          <span class="text-sm text-muted">{{ recipe.typeName }}</span>
        </RouterLink>
        <UiButton
          variant="secondary"
          :aria-label="t('recipes.copyNamed', { name: recipe.name })"
          :disabled="copy.isPending.value"
          @click="copyRecipe(recipe.id)"
        >
          <Copy class="size-5" aria-hidden="true" />{{ t('recipes.copy') }}
        </UiButton>
      </li>
    </ul>
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
