<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useDepartments } from '@/features/ingredients/queries'
import { imageUrl } from '@/features/shopping-lists/format'
import { messageForFailure } from '@/notifications/failures'
import AdminFormDialog from './AdminFormDialog.vue'
import AdminPage from './AdminPage.vue'
import { useSaveDepartment } from './queries'
import { useResourceDialog } from './useResourceDialog'

const { t } = useI18n()

const departments = useDepartments()
const save = useSaveDepartment()
const items = computed(() => departments.data.value?.member ?? [])

const dialog = useResourceDialog(() => ({ name: '', image: '' }))
const errors = computed(() => ({
  name:
    dialog.submitted.value && dialog.form.name.trim() === '' ? t('admin.errors.name') : undefined,
  image:
    dialog.submitted.value && dialog.form.image.trim() === '' ? t('admin.errors.image') : undefined,
}))

function submit() {
  dialog.submitted.value = true
  dialog.error.value = null
  if (errors.value.name || errors.value.image) return

  save.mutate(
    {
      slug: dialog.editing.value,
      form: { name: dialog.form.name.trim(), image: dialog.form.image.trim() },
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
    :title="t('admin.departments')"
    :loading="departments.isPending.value"
    :failed="departments.isError.value"
    :create-label="t('admin.newDepartment')"
    @create="dialog.create"
  >
    <p v-if="items.length === 0" class="text-muted">{{ t('admin.none') }}</p>
    <ul
      v-else
      class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
    >
      <li
        v-for="department in items"
        :key="department.slug"
        class="flex min-h-14 items-center gap-3"
      >
        <img :src="imageUrl(department.image)" alt="" class="size-8 shrink-0 object-contain" />
        <span class="flex-1 font-medium">{{ department.name }}</span>
        <UiButton
          variant="ghost"
          :aria-label="t('admin.editNamed', { name: department.name })"
          @click="dialog.edit(department.slug, { name: department.name, image: department.image })"
        >
          {{ t('admin.edit') }}
        </UiButton>
      </li>
    </ul>
  </AdminPage>

  <AdminFormDialog
    v-model:open="dialog.open.value"
    :title="dialog.editing.value ? t('admin.editDepartment') : t('admin.newDepartment')"
    :pending="save.isPending.value"
    :error="dialog.error.value"
    @submit="submit"
  >
    <UiField :label="t('admin.name')" :error="errors.name" v-slot="{ id, describedby, invalid }">
      <UiTextInput
        :id="id"
        v-model="dialog.form.name"
        autocomplete="off"
        :aria-describedby="describedby"
        :invalid="invalid"
      />
    </UiField>
    <UiField
      :label="t('admin.image')"
      :hint="t('admin.imageHint')"
      :error="errors.image"
      v-slot="{ id, describedby, invalid }"
    >
      <UiTextInput
        :id="id"
        v-model="dialog.form.image"
        autocomplete="off"
        :aria-describedby="describedby"
        :invalid="invalid"
      />
    </UiField>
  </AdminFormDialog>
</template>
