<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { safeRedirect } from '@/session/guard'
import { useSessionStore } from '@/session/session'
import AuthLayout from '@/views/AuthLayout.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const email = ref('')
const password = ref('')
/** Arrivée depuis « Choisis un nouveau mot de passe » : le mot de passe vient d'être changé (ADR 0026 du back). */
const passwordChanged = computed(() => route.query['mot-de-passe'] === 'change')
/** Arrivée depuis « Choisis ton mot de passe » : le premier mot de passe vient d'être choisi, le compte est prêt. */
const accountReady = computed(() => route.query.compte === 'pret')
const error = ref<string | null>(null)
const pending = ref(false)
/** Mot de passe bon, adresse pas encore confirmée : le back répond 403 `EMAIL_NOT_VERIFIED` (ADR 0020 du back). */
const unverified = ref(false)

const isUnverified = (failure: unknown): boolean =>
  failure instanceof ApiError && failure.status === 403 && failure.message === 'EMAIL_NOT_VERIFIED'

function messageFor(failure: unknown): string {
  if (isUnverified(failure)) return t('login.emailNotVerified')
  if (failure instanceof ApiError && failure.status === 401) return t('login.invalid')
  if (failure instanceof ApiError && failure.status === 429) {
    const minutes = Math.max(1, Math.ceil((failure.retryAfter ?? 60) / 60))

    return t('login.tooMany', { minutes }, minutes)
  }

  return t('errors.unreachable')
}

async function submit() {
  error.value = null
  unverified.value = false
  pending.value = true
  try {
    await session.login(email.value, password.value)
    await router.push(safeRedirect(route.query.redirect))
  } catch (failure) {
    unverified.value = isUnverified(failure)
    error.value = messageFor(failure)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthLayout :title="t('login.title')">
    <p
      v-if="passwordChanged || accountReady"
      role="status"
      class="rounded-xl bg-soft px-4 py-3 text-sm font-semibold text-primary"
    >
      {{ t(accountReady ? 'login.accountReady' : 'login.passwordChanged') }}
    </p>
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <UiField :label="t('login.email')" v-slot="{ id }">
        <UiTextInput :id="id" v-model="email" type="email" autocomplete="email" required />
      </UiField>
      <UiField :label="t('login.password')" v-slot="{ id }">
        <UiTextInput
          :id="id"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </UiField>
      <RouterLink
        :to="{ name: 'forgot-password', query: email === '' ? {} : { email } }"
        class="-mt-2 inline-flex min-h-11 items-center self-start font-bold text-primary underline"
        >{{ t('login.forgotPassword') }}</RouterLink
      >
      <p
        v-if="error"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ error }}
      </p>
      <RouterLink
        v-if="unverified"
        :to="{ name: 'check-email', query: { email } }"
        class="font-bold text-primary underline"
        >{{ t('login.resendLink') }}</RouterLink
      >
      <UiButton type="submit" size="lg" :disabled="pending">{{ t('login.submit') }}</UiButton>
    </form>
    <p class="text-center text-muted">
      {{ t('login.noAccount') }}
      <RouterLink :to="{ name: 'register' }" class="font-bold text-primary underline">{{
        t('login.createAccount')
      }}</RouterLink>
    </p>
  </AuthLayout>
</template>
