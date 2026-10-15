<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

import UiButton from '@/design/UiButton.vue'
import UiChip from '@/design/UiChip.vue'
import { useThemeStore } from '@/design/theme'
import SettingsForms from '@/features/account/SettingsForms.vue'
import { useSessionStore } from '@/session/session'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const theme = useThemeStore()

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
    </section>

    <RouterLink
      v-if="session.isAdmin"
      :to="{ name: 'admin' }"
      class="flex min-h-14 items-center rounded-2xl border border-line bg-surface px-4 text-lg font-bold hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('account.administration') }}
    </RouterLink>

    <div>
      <UiButton variant="secondary" @click="logout">{{ t('account.logout') }}</UiButton>
    </div>
  </main>
</template>
