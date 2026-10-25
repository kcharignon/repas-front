<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import { useVoiceLinks, useUnlinkAlexa } from './queries'
import { ALEXA_SKILL_NAME } from './skill'

// La section « Assistant vocal » de « Moi » (VOX-402) : absente tant que la fonction est coupée (le back répond `404 VOICE_DISABLED`)
// ou que la lecture échoue, comme les entrées du drive.
const { t } = useI18n()
const voice = useVoiceLinks()
const unlink = useUnlinkAlexa()
const confirming = ref(false)

function unlinkAlexa() {
  const links = voice.data.value?.links ?? []
  unlink.mutate(links, { onSettled: () => (confirming.value = false) })
}
</script>

<template>
  <section v-if="voice.data.value?.available" class="flex flex-col gap-3">
    <h2 class="font-display text-2xl font-bold">{{ t('voice.title') }}</h2>
    <template v-if="voice.data.value.links.length > 0">
      <p>{{ t('voice.linked', { skill: ALEXA_SKILL_NAME }) }}</p>
      <div>
        <UiButton variant="secondary" @click="confirming = true">{{ t('voice.unlink') }}</UiButton>
      </div>
    </template>
    <p v-else>{{ t('voice.notLinked', { skill: ALEXA_SKILL_NAME }) }}</p>
    <p class="text-sm text-muted">{{ t('voice.help') }}</p>

    <UiConfirmDialog
      v-model:open="confirming"
      :title="t('voice.unlinkTitle')"
      :description="t('voice.unlinkDescription')"
      :confirm-label="t('voice.unlinkConfirm')"
      :pending="unlink.isPending.value"
      @confirm="unlinkAlexa"
    />
  </section>
</template>
