<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { hasFailed } from '@/api/query'
import type { DepartmentIcon } from '@/api'
import DepartmentMarker from '@/design/DepartmentMarker.vue'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiSelect from '@/design/UiSelect.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useDepartments } from '@/features/ingredients/queries'
import UiImage from '@/design/UiImage.vue'
import { messageForFailure } from '@/notifications/failures'
import AdminFormDialog from './AdminFormDialog.vue'
import AdminPage from './AdminPage.vue'
import { useSaveDepartment } from './queries'
import { useResourceDialog } from './useResourceDialog'

const { t } = useI18n()

const departments = useDepartments()
const save = useSaveDepartment()
const items = computed(() => departments.data.value?.member ?? [])

// L'icône du rayon (ING-016) : '' = aucune. Les valeurs que ce front sait dessiner ; une autre (valeur future du back) se garde telle quelle
const ICONS: DepartmentIcon[] = ['snowflake', 'can']
const iconOf = (department: { icon?: string | null }) => department.icon ?? ''

const dialog = useResourceDialog(() => ({ name: '', image: '', icon: '' }))
// L'icône que le rayon avait à l'ouverture de la fenêtre : on n'envoie `icon` que si elle a changé (absente, elle reste intacte côté back)
const originalIcon = ref('')
const errors = computed(() => ({
  name:
    dialog.submitted.value && dialog.form.name.trim() === '' ? t('admin.errors.name') : undefined,
  image:
    dialog.submitted.value && dialog.form.image.trim() === '' ? t('admin.errors.image') : undefined,
}))

function create() {
  originalIcon.value = ''
  dialog.create()
}

function edit(department: { slug: string; name: string; image: string; icon?: string | null }) {
  originalIcon.value = iconOf(department)
  dialog.edit(department.slug, {
    name: department.name,
    image: department.image,
    icon: iconOf(department),
  })
}

function submit() {
  dialog.submitted.value = true
  dialog.error.value = null
  if (errors.value.name || errors.value.image) return

  const iconChanged = dialog.form.icon !== originalIcon.value
  save.mutate(
    {
      slug: dialog.editing.value,
      form: {
        name: dialog.form.name.trim(),
        image: dialog.form.image.trim(),
        ...(iconChanged ? { icon: (dialog.form.icon || null) as DepartmentIcon | null } : {}),
      },
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
    :failed="hasFailed(departments)"
    :create-label="t('admin.newDepartment')"
    @create="create"
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
        <UiImage :src="department.image" class="size-8 shrink-0" />
        <span class="flex-1 font-medium">{{ department.name }}</span>
        <DepartmentMarker :icon="department.icon" />
        <UiButton
          variant="ghost"
          :aria-label="t('admin.editNamed', { name: department.name })"
          @click="edit(department)"
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
    <UiField :label="t('admin.icon')" :hint="t('admin.iconHint')" v-slot="{ id, describedby }">
      <UiSelect :id="id" v-model="dialog.form.icon" :aria-describedby="describedby">
        <option value="">{{ t('admin.iconNone') }}</option>
        <option v-for="icon in ICONS" :key="icon" :value="icon">
          {{ t(`admin.icons.${icon}`) }}
        </option>
      </UiSelect>
    </UiField>
  </AdminFormDialog>
</template>
