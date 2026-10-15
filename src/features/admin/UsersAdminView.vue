<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AdminPage from './AdminPage.vue'
import { useUsers } from './queries'

const { t, d } = useI18n()

const users = useUsers()
const items = computed(() => users.data.value?.member ?? [])
</script>

<template>
  <AdminPage
    :title="t('admin.users')"
    :loading="users.isPending.value"
    :failed="users.isError.value"
  >
    <p v-if="items.length === 0" class="text-muted">{{ t('admin.none') }}</p>
    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="user in items"
        :key="user.id"
        class="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-bold">{{ user.email }}</span>
          <span
            v-if="user.isAdmin"
            class="rounded-full bg-soft px-2.5 py-0.5 text-xs font-bold text-primary"
          >
            {{ t('admin.administrator') }}
          </span>
          <span
            v-if="user.isDisabled"
            class="rounded-full border border-line px-2.5 py-0.5 text-xs font-bold text-muted"
          >
            {{ t('admin.disabled') }}
          </span>
        </div>
        <p class="text-sm text-muted">
          {{
            t('admin.userStats', {
              recipes: user.recipeCount,
              ingredients: user.ingredientCount,
              lists: user.shoppingListCount,
            })
          }}
          · {{ t('admin.since', { date: d(new Date(user.createdAt), 'long') }) }}
        </p>
      </li>
    </ul>
  </AdminPage>
</template>
