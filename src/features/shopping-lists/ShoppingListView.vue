<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { hasFailed } from '@/api/query'
import LoadError from '@/design/LoadError.vue'
import SeasonArt from '@/design/season/SeasonArt.vue'
import UiButton from '@/design/UiButton.vue'
import { useOnline } from '@/offline/useOnline'
import ShoppingListContent from './ShoppingListContent.vue'
import ShoppingListHeader from './ShoppingListHeader.vue'
import ShoppingListPills from './ShoppingListPills.vue'
import {
  isTyped,
  useActiveShoppingList,
  useEnsureActiveShoppingList,
  useOpenShoppingLists,
} from './queries'
import type { OpenShoppingList } from '@/api'

const { t, d } = useI18n()
const online = useOnline()
const route = useRoute()
const router = useRouter()

// Les pastilles n'existent que s'il y a au moins une liste d'un type : sans type, l'écran est celui de la liste principale, inchangé.
// Une lecture qui échoue ne change rien non plus (pas de pastilles).
const open = useOpenShoppingLists()
const openLists = computed(() => open.data.value?.member ?? [])
const showPills = computed(() => openLists.value.some(isTyped))
// La pastille choisie est dans l'adresse (`?liste=`) : « Voir » du message de planification y mène, et un rechargement la garde.
// Une liste qui n'est plus en cours (terminée) n'est plus trouvée : on retombe sur la principale.
const requested = computed(() => (typeof route.query.liste === 'string' ? route.query.liste : null))
const selected = computed(
  () =>
    (showPills.value ? openLists.value.find((list) => list.id === requested.value)?.id : null) ??
    null,
)
// Sans liste principale en cours (seulement des types), la première liste en cours est montrée au lieu de « Aucune liste »
const fallback = computed(() => (showPills.value ? (openLists.value[0]?.id ?? null) : null))
// Une adresse qui demande une liste précise attend de savoir lesquelles sont en cours, pour ne pas montrer la principale un instant
const waitingForOpen = computed(() => requested.value !== null && open.isPending.value)

const { summary, id, detail, forget } = useActiveShoppingList(
  () => selected.value,
  () => fallback.value,
)
const ensure = useEnsureActiveShoppingList()

function choose(list: OpenShoppingList) {
  void router.replace({
    query: { ...route.query, liste: isTyped(list) ? list.id : undefined },
  })
}

function createList() {
  ensure.mutate(undefined, { onSuccess: forget })
}
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <ShoppingListPills v-if="showPills" :lists="openLists" :current="id" @select="choose" />

    <p v-if="summary.isPending.value || waitingForOpen" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>

    <LoadError v-else-if="hasFailed(summary)" />

    <section v-else-if="id === null" class="flex flex-col items-start gap-4 py-10">
      <SeasonArt name="empty-list" class="size-32 md:size-40" />
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
      <p v-if="!online" class="-mb-2 text-sm text-muted">
        {{ t('offline.savedAt', { date: d(new Date(detail.dataUpdatedAt.value), 'short') }) }}
      </p>
      <ShoppingListHeader :list="detail.data.value" :several="showPills" />
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

    <LoadError v-else-if="hasFailed(detail)" />
    <p v-else class="text-muted" role="status">{{ t('common.loading') }}</p>
  </main>
</template>
