<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useSessionStore } from '@/session/session'
import AuthLayout from '@/views/AuthLayout.vue'

/** Les mêmes règles qu'à l'inscription et la longueur du secret du lien, telles que le contrat du back les fixe (`ResetPasswordPayload`). */
const PASSWORD_MIN = 8
const PASSWORD_MAX = 4096
const TOKEN_MAX = 256

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const form = useTemplateRef<HTMLFormElement>('form')

/** Le secret est dans l'adresse du lien reçu par e-mail (`?token=…`) ; sans lui, c'est un lien qui ne marche plus. */
const token = typeof route.query.token === 'string' ? route.query.token : ''
const invalid = ref(token === '' || token.length > TOKEN_MAX)

const password = ref('')
const confirmation = ref('')
const passwordError = ref<string | null>(null)
const confirmationError = ref<string | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)

watch(password, () => (passwordError.value = null))
watch(confirmation, () => (confirmationError.value = null))

function messageFor(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 429) {
    if (failure.retryAfter === null) return t('resetPassword.tooManyLater')
    const minutes = Math.max(1, Math.ceil(failure.retryAfter / 60))

    return t('resetPassword.tooMany', { minutes }, minutes)
  }

  return t('resetPassword.unreachable')
}

/** Le premier champ en erreur reçoit le focus : le lecteur d'écran en lit le message, le clavier y reste. */
async function focusFirstError() {
  await nextTick()
  form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

async function submit() {
  error.value = null
  if (password.value.length < PASSWORD_MIN) passwordError.value = t('resetPassword.tooShort')
  else if (password.value !== confirmation.value)
    confirmationError.value = t('resetPassword.mismatch')
  if (passwordError.value !== null || confirmationError.value !== null) return focusFirstError()

  pending.value = true
  try {
    await session.resetPassword(token, password.value)
    // Aucune session n'est ouverte (ADR 0026 du back, décision 7) : retour à la connexion, avec la bonne nouvelle.
    await router.push({ name: 'login', query: { 'mot-de-passe': 'change' } })
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 422) {
      // Le lien est inconnu, déjà utilisé ou expiré ; tout autre 422 est le refus du mot de passe, le lien reste valable.
      if (failure.message === 'INVALID_PASSWORD_RESET_TOKEN') invalid.value = true
      else {
        passwordError.value = t('resetPassword.rejected')
        void focusFirstError()
      }
    } else error.value = messageFor(failure)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthLayout v-if="invalid" :title="t('resetPassword.invalidTitle')">
    <p role="alert">{{ t('resetPassword.invalid') }}</p>
    <UiLinkButton :to="{ name: 'forgot-password' }">{{ t('resetPassword.newLink') }}</UiLinkButton>
    <p class="text-center text-muted">
      <RouterLink :to="{ name: 'login' }" class="font-bold text-primary underline">{{
        t('resetPassword.signIn')
      }}</RouterLink>
    </p>
  </AuthLayout>
  <AuthLayout v-else :title="t('resetPassword.title')">
    <form ref="form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <UiField
        :label="t('resetPassword.password')"
        :hint="passwordError === null ? t('resetPassword.passwordHint') : undefined"
        :error="passwordError"
        v-slot="{ id, describedby, invalid: fieldInvalid }"
      >
        <UiTextInput
          :id="id"
          v-model="password"
          type="password"
          autocomplete="new-password"
          :maxlength="PASSWORD_MAX"
          required
          :invalid="fieldInvalid"
          :aria-describedby="describedby"
        />
      </UiField>
      <UiField
        :label="t('resetPassword.confirmation')"
        :error="confirmationError"
        v-slot="{ id, describedby, invalid: fieldInvalid }"
      >
        <UiTextInput
          :id="id"
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
          :maxlength="PASSWORD_MAX"
          required
          :invalid="fieldInvalid"
          :aria-describedby="describedby"
        />
      </UiField>
      <p
        v-if="error"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ error }}
      </p>
      <UiButton type="submit" size="lg" :disabled="pending">{{
        t('resetPassword.submit')
      }}</UiButton>
    </form>
  </AuthLayout>
</template>
