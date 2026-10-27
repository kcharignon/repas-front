<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import logo from '@/assets/logo.png'
import HalloweenDecor from '@/design/HalloweenDecor.vue'
import { useSeasonStore } from '@/design/season'

defineProps<{ title: string }>()

const { t } = useI18n()
const season = useSeasonStore()
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg md:flex-row">
    <header
      class="relative overflow-hidden bg-brand px-7 pt-6 pb-5 text-white md:flex md:w-1/2 md:flex-col md:justify-center md:px-16 md:pt-12 md:pb-10"
    >
      <div
        class="pointer-events-none absolute -top-14 -right-16 size-64 rounded-full bg-white/10"
      />
      <div
        class="pointer-events-none absolute -bottom-24 right-10 size-44 rounded-full bg-accent/25"
      />
      <HalloweenDecor variant="banner" />
      <!-- La confidentialité (STORE-010) : un lien discret dans l'angle, il ne prend aucune hauteur (le bouton principal reste visible à 360 × 640) -->
      <RouterLink
        :to="{ name: 'privacy' }"
        class="absolute top-1 right-2 z-10 inline-flex min-h-11 items-center px-2 text-sm text-white/90 underline hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        >{{ t('privacy.link') }}</RouterLink
      >
      <!-- Sur téléphone le logo et le nom tiennent sur une ligne : le bouton principal du formulaire se voit sans défiler à 360 × 640 -->
      <div class="relative flex items-center gap-3 md:block">
        <img :src="logo" alt="" class="h-12 w-[54px] object-contain md:h-[75px] md:w-[84px]" />
        <p class="font-display text-3xl leading-none font-bold md:mt-5 md:text-4xl">
          {{ t('app.name') }}
        </p>
      </div>
      <p class="relative mt-3 max-w-72 text-base leading-snug md:mt-2 md:text-lg">
        {{ t(season.active ? 'auth.pitchHalloween' : 'auth.pitch') }}
      </p>
    </header>

    <main class="flex flex-1 flex-col justify-center px-6 py-8 md:px-16">
      <div class="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 class="font-display text-2xl font-bold">{{ title }}</h1>
        <slot />
      </div>
    </main>
  </div>
</template>
