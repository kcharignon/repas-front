<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import { messageForFailure } from '@/notifications/failures'
import AuthLayout from '@/views/AuthLayout.vue'
import { isWebAddress, readAuthorizationRequest } from './authorization'
import { useAuthorizeAlexa } from './queries'

// La page que l'application Alexa ouvre pour lier le compte (VOX-401, ADR 0029 du back, décision 6). L'utilisateur est connecté (la garde
// de session le renvoie sinon à la connexion, qui le ramène ici avec les mêmes paramètres). Rien n'est envoyé avant son geste.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authorize = useAuthorizeAlexa()

const request = readAuthorizationRequest(route.query)

/** Un échec qui ne se rejoue pas avec les mêmes paramètres : la page ne montre plus que la phrase et le chemin de l'accueil. */
const finalMessage = ref<string | null>(request === null ? t('alexaLink.invalid') : null)
/** Un échec passager (réseau, session) : les deux boutons restent, on peut recommencer. */
const retryMessage = ref<string | null>(null)
/** Après « Autoriser » réussi, la page quitte le site : le bouton reste grisé pour ne demander qu'un seul code. */
const leaving = ref(false)

const busy = computed(() => authorize.isPending.value || leaving.value)

function reasonFor(failure: unknown): string | null {
  if (!(failure instanceof ApiError)) return null
  if (failure.status === 404) return t('alexaLink.disabled')
  if (failure.status === 422) return t('alexaLink.refused')
  if (failure.status === 429) return t('alexaLink.tooMany')

  return null
}

async function accept() {
  if (request === null || busy.value) return
  retryMessage.value = null
  try {
    const redirectUrl = await authorize.mutateAsync(request)
    // Seule l'adresse rendue par le back est suivie, et seulement si c'est une adresse web.
    if (!isWebAddress(redirectUrl)) throw new ApiError(0, 'INVALID_REDIRECT_URL')
    leaving.value = true
    window.location.assign(redirectUrl)
  } catch (failure) {
    const reason = reasonFor(failure)
    if (reason === null) retryMessage.value = messageForFailure(failure)
    else finalMessage.value = reason
  }
}

function decline() {
  void router.push('/')
}
</script>

<template>
  <AuthLayout :title="finalMessage === null ? t('alexaLink.title') : t('alexaLink.titleFailed')">
    <template v-if="finalMessage !== null">
      <p role="alert">{{ finalMessage }}</p>
      <UiLinkButton to="/">{{ t('alexaLink.home') }}</UiLinkButton>
    </template>
    <template v-else>
      <p
        v-if="retryMessage"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ retryMessage }}
      </p>
      <UiButton size="lg" :disabled="busy" @click="accept">{{ t('alexaLink.authorize') }}</UiButton>
      <UiButton variant="secondary" size="lg" :disabled="leaving" @click="decline">{{
        t('common.cancel')
      }}</UiButton>
    </template>
  </AuthLayout>
</template>
