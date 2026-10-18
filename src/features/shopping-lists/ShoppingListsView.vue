<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import { useCreateShoppingList, useShoppingLists } from './queries'

const { t, d } = useI18n()
const router = useRouter()

const lists = useShoppingLists()
const create = useCreateShoppingList()
const items = computed(() => lists.data.value?.member ?? [])

function createList() {
  create.mutate(undefined, { onSuccess: () => router.push({ name: 'shopping-list' }) })
}

const badge = {
  ACTIVE: 'bg-primary text-on-primary',
  PAUSED: 'bg-soft text-ink',
  SENT: 'bg-accent text-on-accent',
  COMPLETED: 'border border-line text-muted',
} as const

// Le badge d'une liste envoyée est court (« Envoyée ») : sa date d'envoi est dans la ligne du dessous.
const label = {
  ACTIVE: 'status.active',
  PAUSED: 'status.paused',
  SENT: 'sentBadge',
  COMPLETED: 'status.completed',
} as const
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t('shoppingList.allLists') }}
      </h1>
      <UiButton :disabled="create.isPending.value" @click="createList">{{
        t('shoppingList.new')
      }}</UiButton>
    </header>

    <p v-if="lists.isPending.value" class="text-muted" role="status">{{ t('common.loading') }}</p>
    <p
      v-else-if="hasFailed(lists)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>
    <p v-else-if="items.length === 0" class="text-muted">
      {{ t('shoppingList.noList') }}
    </p>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="list in items" :key="list.id">
        <RouterLink
          :to="
            list.isActive
              ? { name: 'shopping-list' }
              : { name: 'shopping-list-detail', params: { id: list.id } }
          "
          class="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span class="flex flex-col">
            <span class="text-lg font-bold">{{ list.displayName }}</span>
            <span class="text-sm text-muted">{{
              list.isSent && list.sentAt
                ? t('shoppingList.sentOn', { date: d(new Date(list.sentAt), 'long') })
                : d(new Date(list.createdAt), 'long')
            }}</span>
          </span>
          <span :class="['rounded-full px-3 py-1 text-sm font-semibold', badge[list.status]]">
            {{ t(`shoppingList.${label[list.status]}`) }}
          </span>
        </RouterLink>
      </li>
    </ul>
  </main>
</template>
