<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { hasFailed } from '@/api/query'
import { ApiError } from '@/api'
import ShoppingListContent from './ShoppingListContent.vue'
import ShoppingListHeader from './ShoppingListHeader.vue'
import { useCreateShoppingList, useShoppingList } from './queries'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const list = useShoppingList(() => String(route.params.id))
const create = useCreateShoppingList()

function startNew() {
  create.mutate(undefined, { onSuccess: () => router.push({ name: 'shopping-list' }) })
}
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <RouterLink
      :to="{ name: 'shopping-lists' }"
      class="self-start font-bold text-primary underline"
    >
      {{ t('shoppingList.allLists') }}
    </RouterLink>

    <template v-if="list.data.value">
      <ShoppingListHeader :list="list.data.value" />
      <ShoppingListContent
        :list="list.data.value"
        :starting-new="create.isPending.value"
        @start-new="startNew"
      />
    </template>

    <p
      v-else-if="hasFailed(list)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{
        list.error.value instanceof ApiError && [403, 404].includes(list.error.value.status)
          ? t('errors.notFound')
          : t('errors.unreachable')
      }}
    </p>
    <p v-else class="text-muted" role="status">{{ t('common.loading') }}</p>
  </main>
</template>
