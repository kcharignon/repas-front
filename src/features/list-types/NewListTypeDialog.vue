<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiSheet from '@/design/UiSheet.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useCreateListType } from './queries'
import { NAME_MAX_LENGTH } from './name'

// La fenêtre « Ajouter un type » (LST-006) : le nom seul, puis Enregistrer. Les rayons se rattachent ensuite, sur la fiche du type.
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const notifications = useNotificationsStore()
const create = useCreateListType()

const name = ref('')
const error = ref<string | null>(null)

const field = ref<ComponentPublicInstance | null>(null)

// Une fenêtre rouverte repart vide, sans l'ancien refus, et le curseur est déjà dans le champ (le seul geste qui reste est d'écrire)
watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = ''
  error.value = null
  setTimeout(() => (field.value?.$el as HTMLElement | undefined)?.focus(), 0)
})

function submit() {
  const trimmed = name.value.trim()
  if (trimmed === '') {
    error.value = t('listTypes.nameRequired')

    return
  }
  error.value = null
  create.mutate(trimmed, {
    onSuccess: () => {
      open.value = false
      notifications.push('success', t('listTypes.created', { name: trimmed }))
    },
    onError: (failure) => (error.value = messageForFailure(failure)),
  })
}
</script>

<template>
  <UiSheet
    v-model:open="open"
    :title="t('listTypes.addTitle')"
    :description="t('listTypes.addHelp')"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <UiField v-slot="{ id, describedby, invalid }" :label="t('listTypes.name')" :error="error">
        <UiTextInput
          :id="id"
          ref="field"
          v-model="name"
          :maxlength="NAME_MAX_LENGTH"
          :aria-describedby="describedby"
          :invalid="invalid"
          autocomplete="off"
        />
      </UiField>
      <div class="flex flex-wrap justify-end gap-2">
        <UiButton variant="ghost" @click="open = false">{{ t('common.cancel') }}</UiButton>
        <UiButton type="submit" :disabled="create.isPending.value">{{
          t('listTypes.save')
        }}</UiButton>
      </div>
    </form>
  </UiSheet>
</template>
