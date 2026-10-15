<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import UiButton from '@/design/UiButton.vue'
import ShoppingListContent from './ShoppingListContent.vue'
import ShoppingListHeader from './ShoppingListHeader.vue'
import { useActiveShoppingList, useEnsureActiveShoppingList } from './queries'

const { t } = useI18n()

const { summary, id, detail, forget } = useActiveShoppingList()
const ensure = useEnsureActiveShoppingList()

function createList() {
  ensure.mutate(undefined, { onSuccess: forget })
}
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
      <div class="flex flex-wrap gap-2">
        <UiButton size="lg" :disabled="ensure.isPending.value" @click="createList">
          {{ t('shoppingList.create') }}
        </UiButton>
        <RouterLink
          :to="{ name: 'shopping-lists' }"
          class="inline-flex min-h-13 items-center px-4 font-bold text-primary underline"
        >
          {{ t('shoppingList.allLists') }}
        </RouterLink>
      </div>
    </section>

    <template v-else-if="detail.data.value">
      <ShoppingListHeader :list="detail.data.value" />
      <ShoppingListContent
        :list="detail.data.value"
        :starting-new="ensure.isPending.value"
        @start-new="createList"
      />
      <RouterLink
        :to="{ name: 'shopping-lists' }"
        class="self-start font-bold text-primary underline"
      >
        {{ t('shoppingList.allLists') }}
      </RouterLink>
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
