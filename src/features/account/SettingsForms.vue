<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { useUpdateSettings } from './queries'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const notifications = useNotificationsStore()
const update = useUpdateSettings()

const serving = ref<string | number>(session.user?.defaultServing ?? 4)
const servingError = ref<string | null>(null)

function saveServing() {
  servingError.value = null
  if (Number(serving.value) < 1) {
    servingError.value = t('account.errors.serving')

    return
  }
  update.mutate(
    { defaultServing: Number(serving.value), newPassword: null, actualPassword: null },
    {
      onSuccess: async () => {
        await session.reloadUser()
        notifications.push('success', t('account.saved'))
      },
      onError: (error) => {
        servingError.value = messageForFailure(error)
      },
    },
  )
}

const actual = ref('')
const next = ref('')
const confirmation = ref('')
const submitted = ref(false)
const passwordFailure = ref<string | null>(null)

const errors = computed(() => ({
  actual: submitted.value && actual.value === '' ? t('account.errors.actual') : undefined,
  next: submitted.value && next.value.length < 8 ? t('account.errors.short') : undefined,
  confirmation:
    submitted.value && confirmation.value !== next.value ? t('account.errors.mismatch') : undefined,
}))

function savePassword() {
  submitted.value = true
  passwordFailure.value = null
  if (actual.value === '' || next.value.length < 8 || confirmation.value !== next.value) return

  update.mutate(
    {
      defaultServing: session.user?.defaultServing ?? Number(serving.value),
      newPassword: next.value,
      actualPassword: actual.value,
    },
    {
      // Le back révoque les jetons au changement de mot de passe (ADR 0008 §13) : on se reconnecte.
      onSuccess: async () => {
        await session.logout()
        notifications.push('success', t('account.passwordChanged'), 12000)
        await router.push({ name: 'login' })
      },
      onError: (error) => {
        // Le back nomme ce refus par un code (INVALID_PASSWORD), pas par une phrase
        passwordFailure.value =
          error instanceof ApiError && error.message === 'INVALID_PASSWORD'
            ? t('account.errors.wrongPassword')
            : messageForFailure(error)
      },
    },
  )
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <section class="flex flex-col gap-3">
      <h2 class="font-display text-2xl font-bold">{{ t('account.servingTitle') }}</h2>
      <form
        class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
        novalidate
        @submit.prevent="saveServing"
      >
        <UiField
          :label="t('account.serving')"
          :hint="t('account.servingHint')"
          :error="servingError"
          v-slot="{ id, describedby, invalid }"
        >
          <UiTextInput
            :id="id"
            v-model="serving"
            type="number"
            inputmode="numeric"
            min="1"
            :aria-describedby="describedby"
            :invalid="invalid"
          />
        </UiField>
        <div>
          <UiButton type="submit" :disabled="update.isPending.value">{{
            t('common.save')
          }}</UiButton>
        </div>
      </form>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="font-display text-2xl font-bold">{{ t('account.passwordTitle') }}</h2>
      <form
        class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
        novalidate
        @submit.prevent="savePassword"
      >
        <UiField
          :label="t('account.actualPassword')"
          :error="errors.actual"
          v-slot="{ id, describedby, invalid }"
        >
          <UiTextInput
            :id="id"
            v-model="actual"
            type="password"
            autocomplete="current-password"
            :aria-describedby="describedby"
            :invalid="invalid"
          />
        </UiField>
        <UiField
          :label="t('account.newPassword')"
          :hint="t('register.passwordHint')"
          :error="errors.next"
          v-slot="{ id, describedby, invalid }"
        >
          <UiTextInput
            :id="id"
            v-model="next"
            type="password"
            autocomplete="new-password"
            :aria-describedby="describedby"
            :invalid="invalid"
          />
        </UiField>
        <UiField
          :label="t('account.confirmPassword')"
          :error="errors.confirmation"
          v-slot="{ id, describedby, invalid }"
        >
          <UiTextInput
            :id="id"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            :aria-describedby="describedby"
            :invalid="invalid"
          />
        </UiField>
        <p
          v-if="passwordFailure"
          role="alert"
          class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
        >
          {{ passwordFailure }}
        </p>
        <div>
          <UiButton type="submit" :disabled="update.isPending.value">{{
            t('account.changePassword')
          }}</UiButton>
        </div>
      </form>
    </section>
  </div>
</template>
