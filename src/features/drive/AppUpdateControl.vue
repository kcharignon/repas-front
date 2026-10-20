<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiProgressBar from '@/design/UiProgressBar.vue'
import { useAppUpdateStore } from './appUpdateStore'

// Le geste « Mettre à jour » et ce qu'il fait voir (DRV-639) : le bandeau de « Moi » et la page d'aide l'affichent tous les deux. Un seul
// bouton déclenche tout (recherche, téléchargement avec progression, vérification, écran d'installation d'Android) : la page ne passe ni par
// GitHub, ni par Chrome, ni par le dossier de fichiers. L'état vient de l'application (`update.state`), jamais d'une adresse ou d'un texte reçu.
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' }>(), { variant: 'primary' })

const { t, te } = useI18n()
const updates = useAppUpdateStore()

const state = computed(() => updates.state)
const percent = computed(() => (state.value.status === 'telechargement' ? state.value.progress : 0))

/** Une phrase par cas connu ; tout autre code d'erreur dit la phrase générale. Le code lui-même n'est jamais montré. */
const errorText = computed(() => {
  if (state.value.status !== 'erreur') return ''
  const key = `driveHelp.update.errors.${state.value.code}`

  return t(te(key) ? key : 'driveHelp.update.errors.generic')
})

const offersUpdate = computed(() => state.value.status === 'miseAJourDisponible')
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="app-update">
    <p v-if="state.status === 'inconnu' || state.status === 'verification'" role="status">
      {{ t('driveHelp.update.checking') }}
    </p>
    <p v-else-if="state.status === 'aJour'" role="status">{{ t('driveHelp.update.upToDate') }}</p>
    <template v-else-if="offersUpdate">
      <p class="font-semibold">{{ t('driveHelp.updateBanner.text') }}</p>
      <UiButton
        data-testid="app-update-start"
        :variant="variant"
        class="w-fit"
        @click="updates.start()"
      >
        {{ t('driveHelp.updateBanner.action') }}
      </UiButton>
    </template>
    <template v-else-if="state.status === 'telechargement'">
      <p>{{ t('driveHelp.update.downloading', { percent }) }}</p>
      <UiProgressBar :value="percent" :max="100" :label="t('driveHelp.update.downloadingLabel')" />
    </template>
    <div v-else-if="state.status === 'pretAInstaller'" role="status" class="flex flex-col gap-2">
      <p class="font-semibold">{{ t('driveHelp.update.ready') }}</p>
      <p>{{ t('driveHelp.update.readyProtect') }}</p>
    </div>
    <template v-else>
      <p role="alert" class="font-semibold">{{ errorText }}</p>
      <UiButton
        data-testid="app-update-start"
        :variant="variant"
        class="w-fit"
        @click="updates.start()"
      >
        {{ t('driveHelp.update.retry') }}
      </UiButton>
    </template>
  </div>
</template>
