<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useSessionStore } from '@/session/session'
import AuthLayout from '@/views/AuthLayout.vue'

/** Le back n'envoie qu'un lien par minute et par compte, sans le dire (ADR 0026 du back) : le bouton attend autant. */
const COOLDOWN_SECONDS = 60

const { t } = useI18n()
const route = useRoute()
const session = useSessionStore()

/** La connexion transmet l'adresse déjà saisie : l'utilisateur n'a pas à la retaper. */
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const sent = ref(false)
const error = ref<string | null>(null)
const pending = ref(false)
const wait = ref(0)

let timer: ReturnType<typeof setInterval> | undefined

function startCooldown() {
  wait.value = COOLDOWN_SECONDS
  clearInterval(timer)
  timer = setInterval(() => {
    wait.value -= 1
    if (wait.value <= 0) clearInterval(timer)
  }, 1000)
}

onUnmounted(() => clearInterval(timer))

// Une autre adresse est une autre demande : le message d'envoi et l'attente ne la concernent plus.
watch(email, () => {
  if (!sent.value) return
  sent.value = false
  wait.value = 0
  clearInterval(timer)
})

const label = computed(() => {
  if (!sent.value) return t('forgotPassword.submit')

  return wait.value > 0
    ? t('forgotPassword.resendIn', { seconds: wait.value })
    : t('forgotPassword.resend')
})

function messageFor(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 429) {
    if (failure.retryAfter === null) return t('forgotPassword.tooManyLater')
    const minutes = Math.max(1, Math.ceil(failure.retryAfter / 60))

    return t('forgotPassword.tooMany', { minutes }, minutes)
  }
  if (failure instanceof ApiError && failure.status === 422) return t('forgotPassword.invalidEmail')

  return t('forgotPassword.unreachable')
}

async function send() {
  error.value = null
  pending.value = true
  try {
    await session.sendPasswordReset(email.value)
    sent.value = true
    startCooldown()
  } catch (failure) {
    sent.value = false
    error.value = messageFor(failure)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthLayout :title="t('forgotPassword.title')">
    <p>{{ t('forgotPassword.intro') }}</p>
    <form class="flex flex-col gap-4" @submit.prevent="send">
      <UiField :label="t('login.email')" v-slot="{ id }">
        <UiTextInput
          :id="id"
          v-model="email"
          type="email"
          autocomplete="email"
          maxlength="255"
          required
        />
      </UiField>
      <p
        v-if="sent"
        role="status"
        class="rounded-xl bg-soft px-4 py-3 text-sm font-semibold text-primary"
      >
        {{ t('forgotPassword.sent') }}
      </p>
      <p
        v-if="error"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ error }}
      </p>
      <UiButton
        type="submit"
        size="lg"
        :variant="sent ? 'secondary' : 'primary'"
        :disabled="pending || wait > 0"
        >{{ label }}</UiButton
      >
    </form>
    <p class="text-center text-muted">
      <RouterLink :to="{ name: 'login' }" class="font-bold text-primary underline">{{
        t('forgotPassword.signIn')
      }}</RouterLink>
    </p>
  </AuthLayout>
</template>
