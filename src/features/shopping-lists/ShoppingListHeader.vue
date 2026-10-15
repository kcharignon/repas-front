<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { ShoppingList } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiDialog from '@/design/UiDialog.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useChangeListStatus, useDeleteShoppingList, useRenameShoppingList } from './queries'

const props = defineProps<{ list: ShoppingList }>()

const { t } = useI18n()
const router = useRouter()

const status = useChangeListStatus()
const rename = useRenameShoppingList()
const remove = useDeleteShoppingList()

const renaming = ref(false)
const deleting = ref(false)
const name = ref('')

function openRename() {
  name.value = props.list.name ?? ''
  renaming.value = true
}

function saveName() {
  rename.mutate(
    { id: props.list.id, name: name.value, version: props.list.version },
    { onSuccess: () => (renaming.value = false) },
  )
}

function confirmDelete() {
  remove.mutate(props.list.id, {
    onSuccess: async () => {
      deleting.value = false
      await router.push({ name: 'shopping-lists' })
    },
  })
}

const statusLabel = (list: ShoppingList) =>
  list.isActive ? 'active' : list.isPaused ? 'paused' : 'completed'
</script>

<template>
  <header class="flex flex-col gap-3">
    <div>
      <p class="text-sm font-bold text-primary">
        {{ t(`shoppingList.status.${statusLabel(list)}`) }}
      </p>
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ list.displayName }}
      </h1>
      <p v-if="list.name" class="mt-1 text-muted">
        {{ t('shoppingList.dateLabel', { date: list.dateLabel }) }}
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <UiButton variant="secondary" @click="openRename">{{ t('shoppingList.rename') }}</UiButton>
      <UiButton
        v-if="list.isActive"
        variant="secondary"
        :disabled="status.isPending.value"
        @click="status.mutate({ id: list.id, action: 'pause' })"
      >
        {{ t('shoppingList.pause') }}
      </UiButton>
      <UiButton
        v-if="list.isActive"
        :disabled="status.isPending.value"
        @click="status.mutate({ id: list.id, action: 'complete' })"
      >
        {{ t('shoppingList.complete') }}
      </UiButton>
      <UiButton
        v-if="!list.isActive"
        :disabled="status.isPending.value"
        @click="status.mutate({ id: list.id, action: 'activate' })"
      >
        {{ t('shoppingList.activate') }}
      </UiButton>
      <UiButton variant="ghost" @click="deleting = true">{{ t('common.delete') }}</UiButton>
    </div>

    <UiDialog
      v-model:open="renaming"
      :title="t('shoppingList.rename')"
      :description="t('shoppingList.renameHelp')"
    >
      <form class="flex flex-col gap-4" @submit.prevent="saveName">
        <UiField :label="t('shoppingList.name')" v-slot="{ id }">
          <UiTextInput :id="id" v-model="name" autocomplete="off" />
        </UiField>
        <div class="flex flex-wrap justify-end gap-2">
          <UiButton variant="ghost" @click="renaming = false">{{ t('common.cancel') }}</UiButton>
          <UiButton type="submit" :disabled="rename.isPending.value">{{
            t('common.save')
          }}</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiConfirmDialog
      v-model:open="deleting"
      :title="t('shoppingList.deleteTitle')"
      :description="t('shoppingList.deleteHelp', { name: list.displayName })"
      :confirm-label="t('common.delete')"
      :pending="remove.isPending.value"
      @confirm="confirmDelete"
    />
  </header>
</template>
