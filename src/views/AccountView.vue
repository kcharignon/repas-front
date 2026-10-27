<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

import UiButton from '@/design/UiButton.vue'
import UiChip from '@/design/UiChip.vue'
import UiSwitch from '@/design/UiSwitch.vue'
import { useSeasonStore } from '@/design/season'
import { useThemeStore } from '@/design/theme'
import AccountCredits from '@/features/account/AccountCredits.vue'
import SettingsForms from '@/features/account/SettingsForms.vue'
import AppHelpLink from '@/features/drive/AppHelpLink.vue'
import AppUpdateBanner from '@/features/drive/AppUpdateBanner.vue'
import DriveAccountLinks from '@/features/drive/DriveAccountLinks.vue'
import VoiceAssistantSection from '@/features/voice/VoiceAssistantSection.vue'
import { useSessionStore } from '@/session/session'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const theme = useThemeStore()
const season = useSeasonStore()

async function logout() {
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
    <header>
      <h1 class="font-display text-4xl leading-tight font-bold">{{ t('account.title') }}</h1>
      <p class="mt-1 text-muted">{{ session.user?.email }}</p>
    </header>

    <AppUpdateBanner />

    <SettingsForms />

    <section class="flex flex-col gap-3">
      <h2 class="font-display text-2xl font-bold">{{ t('theme.label') }}</h2>
      <div role="group" :aria-label="t('theme.label')" class="flex flex-wrap gap-2">
        <UiChip
          v-for="preference in theme.preferences"
          :key="preference"
          :pressed="theme.preference === preference"
          @update:pressed="theme.preference = preference"
        >
          {{ t(`theme.${preference}`) }}
        </UiChip>
      </div>
      <!-- Le décor saisonnier (ADR 0010) : l'interrupteur n'existe que du 15 octobre au 1er novembre -->
      <UiSwitch v-if="season.inSeason" v-model="season.enabled" :label="t('season.halloween')" />
    </section>

    <AppHelpLink />

    <DriveAccountLinks />

    <VoiceAssistantSection />

    <RouterLink
      v-if="session.isAdmin"
      :to="{ name: 'admin' }"
      class="flex min-h-14 items-center rounded-2xl border border-line bg-surface px-4 text-lg font-bold hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('account.administration') }}
    </RouterLink>

    <AccountCredits />

    <!-- La confidentialité de tout Repas (STORE-010) : un lien discret, la page est publique -->
    <RouterLink
      :to="{ name: 'privacy' }"
      class="inline-flex min-h-11 items-center self-start text-sm text-muted underline hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('privacy.link') }}
    </RouterLink>

    <div>
      <UiButton variant="secondary" @click="logout">{{ t('account.logout') }}</UiButton>
    </div>
  </main>
</template>
