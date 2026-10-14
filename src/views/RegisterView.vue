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
const password = ref('')
const serving = ref<string | number>(4)
const error = ref<string | null>(null)
const pending = ref(false)

function messageFor(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 409) return t('register.emailTaken')
  // Le back valide le corps (422) et l'explique : on l'affiche tel quel.
  if (failure instanceof ApiError && failure.status === 422) return failure.message
  if (failure instanceof ApiError && failure.status === 429) return t('register.tooMany')

  return t('errors.unreachable')
}

async function submit() {
  error.value = null
  pending.value = true
  try {
    await session.register(email.value, password.value, Number(serving.value))
    await router.push({ name: 'home' })
  } catch (failure) {
    error.value = messageFor(failure)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthLayout :title="t('register.title')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <UiField :label="t('login.email')" v-slot="{ id }">
        <UiTextInput :id="id" v-model="email" type="email" autocomplete="email" required />
      </UiField>
      <UiField
        :label="t('login.password')"
        :hint="t('register.passwordHint')"
        v-slot="{ id, describedby }"
      >
        <UiTextInput
          :id="id"
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          required
          :aria-describedby="describedby"
        />
      </UiField>
      <UiField
        :label="t('register.serving')"
        :hint="t('register.servingHint')"
        v-slot="{ id, describedby }"
      >
        <UiTextInput
          :id="id"
          v-model="serving"
          type="number"
          inputmode="numeric"
          min="1"
          required
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
