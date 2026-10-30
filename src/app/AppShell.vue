<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { BookOpen, LayoutGrid, ShoppingBasket, User } from 'lucide-vue-next'

import OfflineBanner from '@/app/OfflineBanner.vue'
import logo from '@/assets/logo.png'
import { cn } from '@/design/cn'
import SeasonArt from '@/design/season/SeasonArt.vue'
import { useAppUpdateStore } from '@/features/drive/appUpdateStore'
import { useAppVersionStore } from '@/features/drive/appVersionStore'
import { useAppUpdateAvailable } from '@/features/drive/useAppUpdateAvailable'
import { useSessionStore } from '@/session/session'

const { t } = useI18n()
const session = useSessionStore()
const versions = useAppVersionStore()
const updates = useAppUpdateStore()
const { available: updateAvailable, inApp } = useAppUpdateAvailable()

// La recherche d'une nouvelle version se fait dès l'ouverture de l'application (pas seulement dans « Moi ») et quand elle revient au premier
// plan, au plus toutes les cinq minutes (le plafond de l'application, tenu aussi ici). Rien dans un navigateur.
async function searchNewVersion() {
  if (!inApp || session.user === null) return
  await versions.read()
  if (versions.selfUpdate) void updates.checkIfDue()
}

function onVisible() {
  if (document.visibilityState === 'visible') void searchNewVersion()
}

onMounted(() => {
  void searchNewVersion()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))

// Les entrées de navigation s'ajoutent avec les écrans : liste de courses, recettes, rayons.
const nav = [
  { name: 'shopping-list', label: 'nav.shoppingList', icon: ShoppingBasket },
  { name: 'recipes', label: 'nav.recipes', icon: BookOpen },
  { name: 'departments', label: 'nav.departments', icon: LayoutGrid },
  { name: 'account', label: 'nav.account', icon: User },
] as const

const link =
  'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:min-h-12 md:flex-row md:justify-start md:gap-3 md:px-3.5 md:text-base'
</script>

<template>
  <div class="flex min-h-dvh flex-col md:flex-row">
    <aside
      class="hidden shrink-0 border-r border-line bg-surface p-4 relative md:flex md:w-64 md:flex-col md:gap-1.5"
    >
      <!-- Un motif discret dans l'angle du menu, pendant la saison (ADR 0012) -->
      <SeasonArt name="aside" class="absolute top-3 right-3 size-14 text-line" />
      <div class="relative flex items-center gap-3 px-2 pb-5">
        <span class="flex size-11 items-center justify-center rounded-2xl bg-brand">
          <img :src="logo" alt="" class="h-6 w-7 object-contain" />
        </span>
        <span class="font-display text-2xl font-bold">{{ t('app.name') }}</span>
      </div>
      <nav :aria-label="t('nav.label')" class="relative flex flex-col gap-1.5">
        <RouterLink
          v-for="item in nav"
          :key="item.name"
          :to="{ name: item.name }"
          :class="cn(link)"
          active-class="bg-soft text-primary"
        >
          <component :is="item.icon" class="size-5.5" aria-hidden="true" />{{ t(item.label) }}
        </RouterLink>
      </nav>
    </aside>

    <!-- Au-dessus du coin de saison : le texte et les cartes passent devant ses traits (ADR 0012) -->
    <div class="relative z-10 min-w-0 flex-1 pb-20 md:pb-0">
      <OfflineBanner />
      <RouterView />
    </div>

    <nav
      :aria-label="t('nav.label')"
      class="fixed inset-x-0 bottom-0 z-20 flex gap-1 border-t border-line bg-surface px-2 pt-2 pb-3 md:hidden"
    >
      <RouterLink
        v-for="item in nav"
        :key="item.name"
        :to="{ name: item.name }"
        :class="cn(link, 'flex-1')"
        active-class="text-primary"
      >
        <span class="relative">
          <component :is="item.icon" class="size-6" aria-hidden="true" />
          <span
            v-if="item.name === 'account' && updateAvailable"
            data-testid="account-update-dot"
            aria-hidden="true"
            class="absolute -top-[3px] -right-[5px] size-3 rounded-full border-2 border-surface bg-accent"
          />
        </span>
        {{ item.name === 'account' && updateAvailable ? t('nav.accountUpdate') : t(item.label) }}
      </RouterLink>
    </nav>
  </div>
</template>
