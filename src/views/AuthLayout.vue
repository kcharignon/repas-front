<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import logo from '@/assets/logo.png'

defineProps<{ title: string }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg md:flex-row">
    <header
      class="relative overflow-hidden bg-[#1e6b4c] px-7 pt-12 pb-10 text-white md:flex md:w-1/2 md:flex-col md:justify-center md:px-16"
    >
      <div
        class="pointer-events-none absolute -top-14 -right-16 size-64 rounded-full bg-white/10"
      />
      <div
        class="pointer-events-none absolute -bottom-24 right-10 size-44 rounded-full bg-accent/25"
      />
      <img :src="logo" alt="" class="relative h-[75px] w-[84px] object-contain" />
      <p class="relative mt-5 font-display text-4xl leading-none font-bold">{{ t('app.name') }}</p>
      <p class="relative mt-2 max-w-72 text-lg leading-snug">{{ t('auth.pitch') }}</p>
    </header>

    <main class="flex flex-1 flex-col justify-center px-6 py-8 md:px-16">
      <div class="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 class="font-display text-2xl font-bold">{{ title }}</h1>
        <slot />
      </div>
    </main>
  </div>
</template>
