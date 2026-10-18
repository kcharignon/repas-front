<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { ShoppingList } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiDialog from '@/design/UiDialog.vue'
import UiField from '@/design/UiField.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useDriveSettings } from '@/features/drive/queries'
import { useOnline } from '@/offline/useOnline'
import {
  useChangeListStatus,
  useDeleteShoppingList,
  useRenameShoppingList,
  useReopenShoppingList,
  useSendShoppingList,
} from './queries'

const props = defineProps<{ list: ShoppingList }>()

const { t, d } = useI18n()
const router = useRouter()
const online = useOnline()

const status = useChangeListStatus()
const rename = useRenameShoppingList()
const remove = useDeleteShoppingList()
const send = useSendShoppingList()
const reopen = useReopenShoppingList()

// L'envoi n'est proposé que si la fonction est allumée, pour une liste en cours qui a des articles.
const settings = useDriveSettings(() => props.list.isActive)
const canSend = computed(
  () => props.list.isActive && props.list.rowCount > 0 && settings.data.value?.enabled === true,
)

/** Sans magasin enregistré, l'envoi mène aux réglages du drive (DRV-403) au lieu de la confirmation. */
function askToSend() {
  if (settings.data.value?.store) sending.value = true
  else void router.push({ name: 'drive-settings', query: { magasin: 'requis' } })
}

const renaming = ref(false)
const deleting = ref(false)
const sending = ref(false)
const reopening = ref(false)
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

function confirmSend() {
  send.mutate(
    { id: props.list.id, version: props.list.version },
    {
      onSuccess: async () => {
        sending.value = false
        await router.push({ name: 'drive-send', params: { listId: props.list.id } })
      },
      onError: () => (sending.value = false),
    },
  )
}

function confirmReopen() {
  reopen.mutate(
    { id: props.list.id, version: props.list.version },
    { onSettled: () => (reopening.value = false) },
  )
}

const statusLabel = (list: ShoppingList) =>
  list.isActive ? 'active' : list.isPaused ? 'paused' : list.isSent ? 'sent' : 'completed'
</script>

<template>
  <header class="flex flex-col gap-3">
    <div>
      <p class="text-sm font-bold text-primary">
        {{
          list.isSent && list.sentAt
            ? t('shoppingList.sentOn', { date: d(new Date(list.sentAt), 'long') })
            : t(`shoppingList.status.${statusLabel(list)}`)
        }}
      </p>
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ list.displayName }}
      </h1>
      <p v-if="list.name" class="mt-1 text-muted">
        {{ t('shoppingList.dateLabel', { date: list.dateLabel }) }}
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <!-- Liste envoyée au drive : lecture seule, seules la reprise de l'envoi, la fin, la réouverture et la suppression sont permises. -->
      <template v-if="list.isSent">
        <UiLinkButton :to="{ name: 'drive-send', params: { listId: list.id } }">
          {{ t('shoppingList.resumeSend') }}
        </UiLinkButton>
        <UiButton
          variant="secondary"
          :disabled="status.isPending.value"
          @click="status.mutate({ id: list.id, action: 'complete' })"
        >
          {{ t('shoppingList.complete') }}
        </UiButton>
        <UiButton variant="secondary" :disabled="!online" @click="reopening = true">
          {{ t('shoppingList.reopen') }}
        </UiButton>
      </template>
      <template v-else>
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
        <UiButton v-if="canSend" variant="accent" :disabled="!online" @click="askToSend">
          {{ t('shoppingList.send') }}
        </UiButton>
        <UiButton
          v-if="!list.isActive"
          :disabled="status.isPending.value"
          @click="status.mutate({ id: list.id, action: 'activate' })"
        >
          {{ t('shoppingList.activate') }}
        </UiButton>
      </template>
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
      v-model:open="sending"
      variant="primary"
      :title="t('shoppingList.sendTitle')"
      :description="t('shoppingList.sendHelp')"
      :confirm-label="t('shoppingList.send')"
      :pending="send.isPending.value"
      @confirm="confirmSend"
    />

    <UiConfirmDialog
      v-model:open="reopening"
      variant="primary"
      :title="t('shoppingList.reopenTitle')"
      :description="t('shoppingList.reopenHelp')"
      :confirm-label="t('shoppingList.reopen')"
      :pending="reopen.isPending.value"
      @confirm="confirmReopen"
    />

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
