<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AdminPage from './AdminPage.vue'
import { useChangeUserStatus, useDeleteUser, useUsers } from './queries'
import UserRow from './UserRow.vue'
import {
  countByStatus,
  filterUsers,
  sortUsers,
  userFilters,
  usersGrid,
  type AdminUser,
  type UserFilter,
} from './users'
import { ApiError, type UserStatus, type UserSummary } from '@/api'
import { hasFailed } from '@/api/query'
import UiChip from '@/design/UiChip.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import { messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

const { t } = useI18n()
const session = useSessionStore()
const notifications = useNotificationsStore()

const users = useUsers()
const changeStatus = useChangeUserStatus()
const remove = useDeleteUser()

const items = computed<AdminUser[]>(() => users.data.value?.member ?? [])
const filter = ref<UserFilter>('ALL')
const counts = computed(() => countByStatus(items.value))
const shown = computed(() => filterUsers(sortUsers(items.value), filter.value))

// Les dates relatives (« il y a 2 h ») se remettent à l'heure toutes les minutes
const now = ref(new Date())
const timer = setInterval(() => (now.value = new Date()), 60_000)
onBeforeUnmount(() => clearInterval(timer))

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
  <AdminPage
    :title="t('admin.users')"
    :loading="users.isPending.value"
    :failed="hasFailed(users)"
    wide
  >
    <p v-if="items.length === 0" class="text-muted">{{ t('admin.none') }}</p>
    <template v-else>
      <p class="text-muted">
        {{ t('admin.summary', counts.ALL)
        }}<template v-if="counts.PENDING > 0">
          · {{ t('admin.summaryPending', { n: counts.PENDING }) }}</template
        >
      </p>
      <!-- Un compte inscrit par son adresse seule n'a pas de mot de passe : l'activer à la main n'en pose pas -->
      <p v-if="counts.PENDING > 0" class="-mt-2 text-sm text-muted">
        {{ t('admin.pendingHint') }}
      </p>

      <div role="group" :aria-label="t('admin.filtersLabel')" class="flex flex-wrap gap-2">
        <UiChip
          v-for="option in userFilters"
          :key="option"
          :pressed="filter === option"
          @update:pressed="filter = option"
        >
          {{ t(`admin.filters.${option}`, { n: counts[option] }) }}
        </UiChip>
      </div>

      <p v-if="shown.length === 0" class="text-muted">{{ t('admin.noneInFilter') }}</p>
      <div v-else class="flex flex-col gap-3">
        <div
          aria-hidden="true"
          :class="['hidden gap-x-3 px-4 text-sm font-bold text-muted xl:grid', usersGrid]"
        >
          <span>{{ t('admin.columns.user') }}</span>
          <span>{{ t('admin.columns.lastLogin') }}</span>
          <span>{{ t('admin.columns.activity') }}</span>
          <span>{{ t('admin.columns.app') }}</span>
          <span>{{ t('admin.columns.status') }}</span>
        </div>
        <ul class="flex flex-col gap-3">
          <UserRow
            v-for="user in shown"
            :key="user.id"
            :user="user"
            :now="now"
            :self="user.id === session.user?.id"
            :busy="changeStatus.isPending.value"
            @status="setStatus(user, $event)"
            @remove="deleting = user"
          />
        </ul>
      </div>
    </template>

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
