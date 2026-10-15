<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useUnits } from '@/features/ingredients/queries'
import { messageForFailure } from '@/notifications/failures'
import AdminFormDialog from './AdminFormDialog.vue'
import AdminPage from './AdminPage.vue'
import { useSaveUnit } from './queries'
import { useResourceDialog } from './useResourceDialog'

const { t } = useI18n()

const units = useUnits()
const save = useSaveUnit()
const items = computed(() => units.data.value?.member ?? [])

const dialog = useResourceDialog(() => ({ name: '', symbol: '' }))
const nameError = computed(() =>
  dialog.submitted.value && dialog.form.name.trim() === '' ? t('admin.errors.name') : undefined,
)

function submit() {
  dialog.submitted.value = true
  dialog.error.value = null
  if (dialog.form.name.trim() === '') return

  save.mutate(
    {
      slug: dialog.editing.value,
      form: { name: dialog.form.name.trim(), symbol: dialog.form.symbol.trim() },
    },
    {
      onSuccess: () => (dialog.open.value = false),
      onError: (error) => (dialog.error.value = messageForFailure(error)),
    },
  )
}
</script>

<template>
  <AdminPage
    :title="t('admin.units')"
    :loading="units.isPending.value"
    :failed="hasFailed(units)"
    :create-label="t('admin.newUnit')"
    @create="dialog.create"
  >
    <p v-if="items.length === 0" class="text-muted">{{ t('admin.none') }}</p>
    <ul
      v-else
      class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
    >
      <li v-for="unit in items" :key="unit.slug" class="flex min-h-14 items-center gap-3">
        <span class="flex-1 font-medium">{{ unit.name }}</span>
        <span class="text-sm text-muted">{{ unit.symbol === '' ? '—' : unit.symbol }}</span>
        <UiButton
          variant="ghost"
          :aria-label="t('admin.editNamed', { name: unit.name })"
          @click="dialog.edit(unit.slug, { name: unit.name, symbol: unit.symbol })"
        >
          {{ t('admin.edit') }}
        </UiButton>
      </li>
    </ul>
  </AdminPage>

  <AdminFormDialog
    v-model:open="dialog.open.value"
    :title="dialog.editing.value ? t('admin.editUnit') : t('admin.newUnit')"
    :pending="save.isPending.value"
    :error="dialog.error.value"
    @submit="submit"
  >
    <UiField :label="t('admin.name')" :error="nameError" v-slot="{ id, describedby, invalid }">
      <UiTextInput
        :id="id"
        v-model="dialog.form.name"
        autocomplete="off"
        :aria-describedby="describedby"
        :invalid="invalid"
      />
    </UiField>
    <UiField :label="t('admin.symbol')" :hint="t('admin.symbolHint')" v-slot="{ id, describedby }">
      <UiTextInput
        :id="id"
        v-model="dialog.form.symbol"
        autocomplete="off"
        :aria-describedby="describedby"
      />
    </UiField>
  </AdminFormDialog>
</template>
