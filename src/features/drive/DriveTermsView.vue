<script setup lang="ts">
import { useRetailerI18n } from './useRetailerI18n'
import { RouterLink } from 'vue-router'

// Les conditions d'utilisation du drive (DRV-628, ex-note de vie privée DRV-504) : la seule page qui parle des risques, de la vie privée et des
// engagements. On l'ouvre si on le veut (lien discret dans « Moi » et dans l'aide) ; rien dans le parcours ne l'impose. Le texte vient de
// `driveTerms` ; les clés ci-dessous ne font que l'ordonner.
const { t, retailer } = useRetailerI18n()

const sections = [
  { key: 'how', items: ['start', 'session', 'local', 'resume', 'order'] },
  {
    key: 'saves',
    items: [
      'store',
      'choices',
      'products',
      'searches',
      'packSizes',
      'estimate',
      'lists',
      'appVersion',
    ],
  },
  { key: 'never', items: ['credentials', 'cookies', 'address', 'basket', 'photos'] },
  { key: 'where', items: ['server', 'duration', 'backups', 'phone', 'sheets'] },
  { key: 'erase', items: ['product', 'store', 'all', 'rights'] },
  { key: 'before', items: ['account', 'specific', 'stop', 'manual'] },
] as const

/** Le texte d'un élément ; ce qui est propre à l'enseigne vient de sa section (`driveTerms.retailers.<id>`), le reste est commun. */
const textKey = (section: string, item: string): string =>
  item === 'specific'
    ? `driveTerms.retailers.${retailer.value.id}.specific`
    : `driveTerms.${section}.${item}`
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
    <RouterLink
      :to="{ name: 'account' }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('driveTerms.back') }}
    </RouterLink>
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t('driveTerms.title') }}
    </h1>
    <p class="max-w-prose">{{ t('driveTerms.intro') }}</p>
    <section
      v-for="section in sections"
      :key="section.key"
      :aria-labelledby="`conditions-${section.key}`"
      class="flex flex-col gap-2"
    >
      <h2 :id="`conditions-${section.key}`" class="font-display text-xl font-bold">
        {{ t(`driveTerms.${section.key}.title`) }}
      </h2>
      <ul class="flex max-w-prose list-disc flex-col gap-2 pl-6">
        <li v-for="item in section.items" :key="item">
          {{ t(textKey(section.key, item)) }}
        </li>
      </ul>
    </section>
    <!-- Les conditions du drive et la confidentialité de tout Repas (STORE-010) se renvoient l'une à l'autre -->
    <RouterLink
      :to="{ name: 'privacy' }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('driveTerms.privacyLink') }}
    </RouterLink>
  </main>
</template>
