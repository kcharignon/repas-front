<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useSessionStore } from '@/session/session'
import AuthLayout from '@/views/AuthLayout.vue'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()

const email = ref('')
const error = ref<string | null>(null)
const pending = ref(false)

function messageFor(failure: unknown): string {
  // L'adresse est le seul champ : un corps refusé (422) ne peut que la concerner.
  if (failure instanceof ApiError && failure.status === 422) return t('register.invalidEmail')
  if (failure instanceof ApiError && failure.status === 429) {
    if (failure.retryAfter === null) return t('register.tooManyLater')
    const minutes = Math.max(1, Math.ceil(failure.retryAfter / 60))

    return t('register.tooMany', { minutes }, minutes)
  }

  return t('errors.unreachable')
}

async function submit() {
  error.value = null
  pending.value = true
  try {
    await session.register(email.value)
    // Le back répond pareil pour toute adresse et envoie le lien où choisir le mot de passe : aucune session, rien d'autre à dire.
    await router.push({ name: 'check-email', query: { email: email.value } })
  } catch (failure) {
    error.value = messageFor(failure)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthLayout :title="t('register.title')">
    <p>{{ t('register.intro') }}</p>
    <form class="flex flex-col gap-4" @submit.prevent="submit">
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
        v-if="error"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ error }}
      </p>
      <UiButton type="submit" size="lg" :disabled="pending">{{ t('register.submit') }}</UiButton>
    </form>
    <p class="text-center text-muted">
      {{ t('register.haveAccount') }}
      <RouterLink :to="{ name: 'login' }" class="font-bold text-primary underline">{{
        t('register.signIn')
      }}</RouterLink>
    </p>
  </AuthLayout>
</template>
