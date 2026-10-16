<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import { useSessionStore } from '@/session/session'
import AuthLayout from '@/views/AuthLayout.vue'

type State = 'confirming' | 'confirmed' | 'invalid' | 'failed'

const { t } = useI18n()
const route = useRoute()
const session = useSessionStore()

/** Le secret est dans l'adresse du lien reçu par e-mail (`?token=…`). */
const token = typeof route.query.token === 'string' ? route.query.token : ''
const state = ref<State>(token === '' ? 'invalid' : 'confirming')

async function confirm() {
  state.value = 'confirming'
  try {
    await session.confirmEmail(token)
    state.value = 'confirmed'
  } catch (failure) {
    // 422 : lien inconnu, déjà utilisé ou expiré ; le reste (réseau, plafond, 5xx) se réessaie avec le même lien.
    state.value = failure instanceof ApiError && failure.status === 422 ? 'invalid' : 'failed'
  }
}

onMounted(() => {
  if (token !== '') void confirm()
})
</script>

<template>
  <AuthLayout :title="t('confirmEmail.title')">
    <p v-if="state === 'confirming'" role="status">{{ t('confirmEmail.confirming') }}</p>
    <template v-else-if="state === 'confirmed'">
      <p role="status">{{ t('confirmEmail.done') }}</p>
      <UiLinkButton :to="{ name: 'login' }">{{ t('confirmEmail.signIn') }}</UiLinkButton>
    </template>
    <template v-else-if="state === 'invalid'">
      <p role="alert">{{ t('confirmEmail.invalid') }}</p>
      <p class="text-muted">{{ t('confirmEmail.invalidHelp') }}</p>
      <UiLinkButton :to="{ name: 'check-email' }">{{ t('confirmEmail.newLink') }}</UiLinkButton>
      <UiLinkButton :to="{ name: 'login' }" variant="secondary">{{
        t('confirmEmail.signIn')
      }}</UiLinkButton>
    </template>
    <template v-else>
      <p role="alert">{{ t('errors.unreachable') }}</p>
      <UiButton @click="confirm">{{ t('confirmEmail.retry') }}</UiButton>
    </template>
  </AuthLayout>
</template>
