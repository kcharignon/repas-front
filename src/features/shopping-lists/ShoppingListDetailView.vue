<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { hasFailed } from '@/api/query'
import { ApiError } from '@/api'
import BackToListsLink from './BackToListsLink.vue'
import ShoppingListContent from './ShoppingListContent.vue'
import ShoppingListHeader from './ShoppingListHeader.vue'
import { shoppingListKeys, useCreateShoppingList, useShoppingList } from './queries'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const list = useShoppingList(() => String(route.params.id))
const create = useCreateShoppingList()
const queryClient = useQueryClient()

// Une nouvelle liste prend la place d'une liste terminée : du même type que celle-ci (le détail ne le dit pas, « Mes listes » oui)
function startNew() {
  const id = String(route.params.id)
  const typeId =
    queryClient
      .getQueryData<{ member?: { id: string; typeId?: string | null }[] }>(
        shoppingListKeys.collection,
      )
      ?.member?.find((candidate) => candidate.id === id)?.typeId ?? null
  create.mutate(typeId, {
    onSuccess: (created) =>
      router.push(
        typeId === null || created === ''
          ? { name: 'shopping-list' }
          : { name: 'shopping-list', query: { liste: created } },
      ),
  })
}
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <BackToListsLink />

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
