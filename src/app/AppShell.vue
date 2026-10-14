<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { House, User } from 'lucide-vue-next'

import logo from '@/assets/logo.png'
import { cn } from '@/design/cn'

const { t } = useI18n()

// Les entrées de navigation s'ajoutent avec les écrans : liste de courses, recettes, rayons.
const nav = [
  { name: 'home', label: 'nav.home', icon: House },
  { name: 'account', label: 'nav.account', icon: User },
] as const

const link =
  'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:min-h-12 md:flex-row md:justify-start md:gap-3 md:px-3.5 md:text-base'
</script>

<template>
  <div class="flex min-h-dvh flex-col md:flex-row">
    <aside
      class="hidden shrink-0 border-r border-line bg-surface p-4 md:flex md:w-64 md:flex-col md:gap-1.5"
    >
      <div class="flex items-center gap-3 px-2 pb-5">
        <span class="flex size-11 items-center justify-center rounded-2xl bg-[#1e6b4c]">
          <img :src="logo" alt="" class="h-6 w-7 object-contain" />
        </span>
        <span class="font-display text-2xl font-bold">{{ t('app.name') }}</span>
      </div>
      <nav :aria-label="t('nav.label')" class="flex flex-col gap-1.5">
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

    <div class="min-w-0 flex-1 pb-20 md:pb-0">
      <RouterView />
    </div>

    <nav
      :aria-label="t('nav.label')"
      class="fixed inset-x-0 bottom-0 flex gap-1 border-t border-line bg-surface px-2 pt-2 pb-3 md:hidden"
    >
      <RouterLink
        v-for="item in nav"
        :key="item.name"
        :to="{ name: item.name }"
        :class="cn(link, 'flex-1')"
        active-class="text-primary"
      >
        <component :is="item.icon" class="size-6" aria-hidden="true" />{{ t(item.label) }}
      </RouterLink>
    </nav>
  </div>
</template>
