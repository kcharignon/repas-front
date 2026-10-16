<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AdminPage from './AdminPage.vue'
import { useChangeUserStatus, useDeleteUser, useUsers } from './queries'
import { ApiError, type UserStatus, type UserSummary } from '@/api'
import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import { messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

const { t, d } = useI18n()
const session = useSessionStore()
const notifications = useNotificationsStore()

const users = useUsers()
const changeStatus = useChangeUserStatus()
const remove = useDeleteUser()

const items = computed(() => users.data.value?.member ?? [])
const statuses: readonly UserStatus[] = ['PENDING', 'ACTIVE', 'DISABLED']

const deleting = ref<UserSummary | null>(null)
const confirming = computed({
  get: () => deleting.value !== null,
  set: (open: boolean) => {
    if (!open) deleting.value = null
  },
})

/** Le back nomme ses refus de gestion de compte par un code, pas par une phrase (ADR 0021 du back). */
function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) {
    if (error.message === 'PROTECTED_ACCOUNT') return t('admin.errors.protectedAccount')
    if (error.message === 'CANNOT_DELETE_OWN_ACCOUNT') return t('admin.errors.ownAccount')
  }

  return messageForFailure(error)
}

function setStatus(user: UserSummary, status: UserStatus) {
  if (user.status === status) return
  changeStatus.mutate(
    { id: user.id, status },
    {
      onSuccess: () =>
        notifications.push('success', t('admin.statusChanged', { email: user.email })),
      onError: (error) => notifications.push('error', failureMessage(error)),
    },
  )
}

function confirmDelete() {
  const user = deleting.value
  if (user === null) return
  remove.mutate(user.id, {
    onSuccess: () => {
      deleting.value = null
      notifications.push('success', t('admin.userDeleted', { email: user.email }))
    },
    onError: (error) => {
      deleting.value = null
      notifications.push('error', failureMessage(error))
    },
  })
}
</script>

<template>
  <AdminPage :title="t('admin.users')" :loading="users.isPending.value" :failed="hasFailed(users)">
    <p v-if="items.length === 0" class="text-muted">{{ t('admin.none') }}</p>
    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="user in items"
        :key="user.id"
        class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
      >
        <div class="flex flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-bold">{{ user.email }}</span>
            <span
              v-if="user.isAdmin"
              class="rounded-full bg-soft px-2.5 py-0.5 text-xs font-bold text-primary"
            >
              {{ t('admin.administrator') }}
            </span>
            <span
              v-if="user.status !== 'ACTIVE'"
              class="rounded-full border border-line px-2.5 py-0.5 text-xs font-bold text-muted"
            >
              {{ t(`admin.status.${user.status}`) }}
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
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div
            role="group"
            :aria-label="t('admin.statusOf', { email: user.email })"
            class="flex flex-wrap gap-2"
          >
            <UiButton
              v-for="status in statuses"
              :key="status"
              :variant="user.status === status ? 'primary' : 'secondary'"
              :aria-pressed="user.status === status"
              :disabled="changeStatus.isPending.value"
              @click="setStatus(user, status)"
            >
              {{ t(`admin.status.${status}`) }}
            </UiButton>
          </div>
          <UiButton
            variant="ghost"
            :disabled="user.id === session.user?.id"
            :aria-label="t('admin.deleteNamed', { email: user.email })"
            @click="deleting = user"
          >
            {{ t('common.delete') }}
          </UiButton>
        </div>
      </li>
    </ul>

    <UiConfirmDialog
      v-model:open="confirming"
      :title="t('admin.deleteUserTitle')"
      :description="t('admin.deleteUserHelp', { email: deleting?.email ?? '' })"
      :confirm-label="t('common.delete')"
      :pending="remove.isPending.value"
      @confirm="confirmDelete"
    />
  </AdminPage>
</template>
