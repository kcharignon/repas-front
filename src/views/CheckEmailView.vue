<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useSessionStore } from '@/session/session'
import AuthLayout from '@/views/AuthLayout.vue'

/** Le back limite les envois par adresse (6 par heure) : le bouton attend une minute entre deux. */
const COOLDOWN_SECONDS = 60

const { t } = useI18n()
const route = useRoute()
const session = useSessionStore()

const known = typeof route.query.email === 'string' ? route.query.email : ''
const email = ref(known)
const message = ref<string | null>(null)
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

const label = computed(() =>
  wait.value > 0 ? t('checkEmail.resendIn', { seconds: wait.value }) : t('checkEmail.resend'),
)

function messageFor(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 429) return t('checkEmail.tooMany')
  if (failure instanceof ApiError && failure.status === 422) return t('checkEmail.invalidEmail')

  return t('errors.unreachable')
}

async function resend() {
  message.value = null
  error.value = null
  pending.value = true
  try {
    // Renvoyer le lien, c'est redemander l'inscription : même route, même réponse pour toute adresse
    await session.register(email.value)
    message.value = t('checkEmail.resent')
    startCooldown()
  } catch (failure) {
    error.value = messageFor(failure)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthLayout :title="t('checkEmail.title')">
    <p v-if="known">{{ t('checkEmail.sent', { email: known }) }}</p>
    <p v-else>{{ t('checkEmail.askAddress') }}</p>
    <p class="text-muted">{{ t('checkEmail.spam') }}</p>
    <form class="flex flex-col gap-4" @submit.prevent="resend">
      <UiField v-if="!known" :label="t('login.email')" v-slot="{ id }">
        <UiTextInput :id="id" v-model="email" type="email" autocomplete="email" required />
      </UiField>
      <p
        v-if="message"
        role="status"
        class="rounded-xl bg-soft px-4 py-3 text-sm font-semibold text-primary"
      >
        {{ message }}
      </p>
      <p
        v-if="error"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ error }}
      </p>
      <UiButton type="submit" size="lg" variant="secondary" :disabled="pending || wait > 0">{{
        label
      }}</UiButton>
    </form>
    <p class="text-center text-muted">
      <RouterLink :to="{ name: 'login' }" class="font-bold text-primary underline">{{
        t('checkEmail.signIn')
      }}</RouterLink>
    </p>
  </AuthLayout>
</template>
