<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2 } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useRecipeTypes } from '@/features/recipes/queries'
import UiImage from '@/design/UiImage.vue'
import { messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import AdminFormDialog from './AdminFormDialog.vue'
import AdminPage from './AdminPage.vue'
import RecipeTypeDeleteDialog from './RecipeTypeDeleteDialog.vue'
import { useRemoveRecipeType, useSaveRecipeType } from './queries'
import { useResourceDialog } from './useResourceDialog'

const { t } = useI18n()

const types = useRecipeTypes()
const save = useSaveRecipeType()
const remove = useRemoveRecipeType()
const notifications = useNotificationsStore()
const items = computed(() => types.data.value?.member ?? [])

const dialog = useResourceDialog(() => ({ name: '', image: '', order: '' as string | number }))
const errors = computed(() => ({
  name:
    dialog.submitted.value && dialog.form.name.trim() === '' ? t('admin.errors.name') : undefined,
  image:
    dialog.submitted.value && dialog.form.image.trim() === '' ? t('admin.errors.image') : undefined,
  order: dialog.submitted.value && dialog.form.order === '' ? t('admin.errors.order') : undefined,
}))

// Supprimer un type : on choisit d'abord le type qui reçoit ses recettes (celles de tous les utilisateurs)
const deleting = ref<{ slug: string; name: string } | null>(null)
const deleteError = ref<string | null>(null)

function askDelete(type: { slug: string; name: string }) {
  deleteError.value = null
  deleting.value = { slug: type.slug, name: type.name }
}

function confirmDelete(transferTo: string) {
  const type = deleting.value
  if (type === null) return
  deleteError.value = null
  remove.mutate(
    { slug: type.slug, transferTo },
    {
      onSuccess: () => {
        deleting.value = null
        const target = items.value.find((candidate) => candidate.slug === transferTo)
        notifications.push(
          'success',
          t('admin.typeDeleted', { name: type.name, target: target?.name ?? transferTo }),
        )
      },
      onError: (error) => (deleteError.value = messageForFailure(error)),
    },
  )
}

function submit() {
  dialog.submitted.value = true
  dialog.error.value = null
  if (errors.value.name || errors.value.image || errors.value.order) return

  save.mutate(
    {
      slug: dialog.editing.value,
      form: {
        name: dialog.form.name.trim(),
        image: dialog.form.image.trim(),
        order: Number(dialog.form.order),
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
    :title="t('admin.recipeTypes')"
    :loading="types.isPending.value"
    :failed="hasFailed(types)"
    :create-label="t('admin.newRecipeType')"
    @create="dialog.create"
  >
    <p v-if="items.length === 0" class="text-muted">{{ t('admin.none') }}</p>
    <ul
      v-else
      class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
    >
      <li v-for="type in items" :key="type.slug" class="flex min-h-14 items-center gap-3">
        <UiImage :src="type.image" class="size-8 shrink-0" />
        <span class="flex-1 font-medium">{{ type.name }}</span>
        <span class="text-sm whitespace-nowrap text-muted">{{
          t('admin.orderN', { n: type.order })
        }}</span>
        <UiButton
          variant="ghost"
          :aria-label="t('admin.editNamed', { name: type.name })"
          @click="dialog.edit(type.slug, { name: type.name, image: type.image, order: type.order })"
        >
          {{ t('admin.edit') }}
        </UiButton>
        <UiButton
          variant="ghost"
          size="icon"
          :aria-label="t('admin.deleteTypeNamed', { name: type.name })"
          :title="t('admin.deleteTypeNamed', { name: type.name })"
          @click="askDelete(type)"
        >
          <Trash2 class="size-5" aria-hidden="true" />
        </UiButton>
      </li>
    </ul>
  </AdminPage>

  <RecipeTypeDeleteDialog
    :type="deleting"
    :choices="items"
    :pending="remove.isPending.value"
    :error="deleteError"
    @confirm="confirmDelete"
    @close="deleting = null"
  />

  <AdminFormDialog
    v-model:open="dialog.open.value"
    :title="dialog.editing.value ? t('admin.editRecipeType') : t('admin.newRecipeType')"
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
    <UiField
      :label="t('admin.order')"
      :hint="t('admin.orderHint')"
      :error="errors.order"
      v-slot="{ id, describedby, invalid }"
    >
      <UiTextInput
        :id="id"
        v-model="dialog.form.order"
        type="number"
        inputmode="numeric"
        :aria-describedby="describedby"
        :invalid="invalid"
      />
    </UiField>
  </AdminFormDialog>
</template>
