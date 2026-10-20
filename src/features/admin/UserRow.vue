<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { lastLoginAge, usersGrid, type AdminUser } from './users'
import type { UserStatus } from '@/api'
import UiActionMenu, { type UiAction } from '@/design/UiActionMenu.vue'
import UiButton from '@/design/UiButton.vue'

/*
 * Un compte : une carte sur téléphone et tablette, une ligne de tableau dès `xl` (le menu latéral prend 256 px dès `md` : il faut
 * environ 1000 px de large pour six colonnes). `usersGrid` décrit les colonnes, celles de l'en-tête de `UsersAdminView`. Les libellés
 * des champs restent dans la ligne, cachés à l'œil dès `xl` (l'en-tête les porte) mais lus par les lecteurs d'écran.
 */
const props = defineProps<{
  user: AdminUser
  now: Date
  /** Le compte de l'administrateur connecté : il ne peut pas le supprimer. */
  self: boolean
  busy: boolean
}>()

const emit = defineEmits<{ status: [status: UserStatus]; remove: [] }>()

const { t, d } = useI18n()

const age = computed(() => lastLoginAge(props.user.lastLoginAt, props.now))
const lastLogin = computed(() => {
  const value = age.value
  if (value.unit === 'date') return d(value.date, 'long')
  if (value.unit === 'minutes' || value.unit === 'hours' || value.unit === 'days')
    return t(`admin.lastLogin.${value.unit}`, { n: value.n })

  return t(`admin.lastLogin.${value.unit}`)
})
const lastLoginExact = computed(() =>
  age.value.unit === 'never' || props.user.lastLoginAt == null
    ? null
    : d(new Date(props.user.lastLoginAt), 'full'),
)

/** Une seule action visible, celle que l'administrateur vient faire ; le reste est dans « Plus d'actions ». */
const primary = computed<{ label: string; named: string; status: UserStatus } | null>(() => {
  if (props.user.status === 'PENDING')
    return {
      label: t('admin.activate'),
      named: t('admin.activateNamed', { email: props.user.email }),
      status: 'ACTIVE',
    }
  if (props.user.status === 'DISABLED')
    return {
      label: t('admin.reactivate'),
      named: t('admin.reactivateNamed', { email: props.user.email }),
      status: 'ACTIVE',
    }

  return null
})

const actions = computed<UiAction[]>(() => {
  const list: UiAction[] = []
  if (props.user.status === 'ACTIVE' || props.user.status === 'DISABLED')
    list.push({
      key: 'pending',
      label: t('admin.setPending'),
      disabled: props.busy,
      run: () => emit('status', 'PENDING'),
    })
  if (props.user.status !== 'DISABLED')
    list.push({
      key: 'disable',
      label: t('admin.disable'),
      disabled: props.busy,
      run: () => emit('status', 'DISABLED'),
    })
  list.push({
    key: 'delete',
    label: t('common.delete'),
    tone: 'danger',
    disabled: props.self,
    hint: props.self ? t('admin.ownAccountHint') : undefined,
    run: () => emit('remove'),
  })

  return list
})

const statusClass: Record<UserStatus, string> = {
  PENDING: 'bg-accent text-on-accent',
  ACTIVE: 'bg-soft text-primary',
  DISABLED: 'border border-line bg-surface text-muted',
}
const pill = 'inline-flex items-center whitespace-nowrap rounded-full px-3 py-0.5 text-sm font-bold'
</script>

<template>
  <li
    :data-status="user.status"
    :class="[
      'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface p-4 xl:items-center',
      usersGrid,
    ]"
  >
    <div class="col-span-2 min-w-0 xl:col-span-1 xl:col-start-1 xl:row-start-1">
      <p class="font-bold [overflow-wrap:anywhere]">{{ user.email }}</p>
      <p class="text-sm text-muted">
        {{ t('admin.registered', { date: d(new Date(user.createdAt), 'long') }) }}
      </p>
    </div>

    <div
      :class="[
        'col-span-2 flex flex-wrap items-center gap-2 xl:col-span-1 xl:flex-col xl:items-start xl:row-start-1',
        'xl:col-start-5',
      ]"
    >
      <span v-if="user.isAdmin" :class="[pill, 'bg-primary text-on-primary']">
        {{ t('admin.administrator') }}
      </span>
      <span :class="[pill, statusClass[user.status]]">
        {{ t(`admin.status.${user.status}`) }}
      </span>
    </div>

    <p class="col-span-2 text-sm xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:text-base">
      <span class="text-muted xl:sr-only">{{ t('admin.lastLoginLabel') }}</span>
      {{ ' ' }}
      <span v-if="lastLoginExact === null" class="text-muted">{{ lastLogin }}</span>
      <template v-else>
        <time :datetime="user.lastLoginAt ?? undefined" :title="lastLoginExact">{{
          lastLogin
        }}</time>
        <span class="sr-only"> ({{ lastLoginExact }})</span>
      </template>
    </p>

    <p
      :class="[
        'col-span-2 flex flex-wrap gap-x-1.5 text-sm text-muted xl:col-span-1 xl:row-start-1 xl:flex-col xl:text-base',
        'xl:col-start-3',
      ]"
    >
      <span>{{ t('admin.recipeCount', user.recipeCount) }}</span>
      <span aria-hidden="true" class="xl:hidden">·</span>
      <span>{{ t('admin.ingredientCount', user.ingredientCount) }}</span>
      <span aria-hidden="true" class="xl:hidden">·</span>
      <span>{{ t('admin.listCount', user.shoppingListCount) }}</span>
    </p>

    <p
      :class="[
        'flex flex-wrap items-center gap-2 text-sm text-muted xl:row-start-1 xl:text-base',
        'xl:col-start-4',
      ]"
    >
      <span>
        <span class="xl:sr-only">{{ t('admin.appLabel') }}</span>
        {{ ' ' }}{{ user.appVersion ?? t('admin.appVersionUnknown') }}
      </span>
      <span v-if="user.appOutdated" :class="[pill, 'border border-line text-ink']">
        {{ t('admin.appOutdated') }}
      </span>
    </p>

    <div :class="['flex items-center justify-end gap-2 xl:row-start-1', 'xl:col-start-6']">
      <UiButton
        v-if="primary"
        :disabled="busy"
        :aria-label="primary.named"
        @click="emit('status', primary.status)"
      >
        {{ primary.label }}
      </UiButton>
      <UiActionMenu :label="t('admin.moreActions', { email: user.email })" :actions="actions" />
    </div>
  </li>
</template>
