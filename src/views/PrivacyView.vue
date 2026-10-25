<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

// La politique de confidentialité publique de tout Repas, `/confidentialite` (STORE-010) : lisible sans connexion, car Google Play et Amazon (skill
// Alexa) en demandent l'adresse. Le texte vient de `privacy` dans `fr.ts` ; les clés ci-dessous ne font que l'ordonner. Le texte des conditions
// du drive (`driveTerms`) reste dans l'application : il parle des risques propres à l'envoi.
const { t } = useI18n()

/** L'adresse de Amazon où se lit sa propre politique de confidentialité (la voix est traitée par Amazon). */
const AMAZON_PRIVACY = 'https://www.amazon.fr/privacy'

const sections = [
  { key: 'who', items: ['publisher', 'contact'] },
  {
    key: 'keeps',
    items: [
      'email',
      'password',
      'settings',
      'status',
      'counters',
      'login',
      'session',
      'content',
      'others',
      'app',
    ],
  },
  { key: 'drive', items: ['store', 'products', 'search', 'lists', 'never', 'own', 'terms'] },
  {
    key: 'voice',
    items: ['intro', 'link', 'access', 'items', 'phrases', 'create', 'not', 'amazon', 'unlink'],
  },
  { key: 'never', items: ['ads', 'sell', 'sensors'] },
  { key: 'share', items: ['host', 'mail', 'amazon', 'logs', 'nobody'] },
  { key: 'duration', items: ['while', 'erase', 'copies', 'shared', 'backups'] },
  { key: 'rights', items: ['ask', 'delete', 'self'] },
  { key: 'children', items: ['text'] },
  { key: 'changes', items: ['date', 'why'] },
] as const

const linkClass =
  'font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary'
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
    <RouterLink
      :to="{ name: 'home' }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('privacy.back') }}
    </RouterLink>
    <header class="flex flex-col gap-2">
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t('privacy.title') }}
      </h1>
      <p class="text-muted">{{ t('privacy.updated') }}</p>
    </header>
    <p class="max-w-prose">{{ t('privacy.intro') }}</p>
    <section
      v-for="section in sections"
      :key="section.key"
      :aria-labelledby="`confidentialite-${section.key}`"
      class="flex flex-col gap-2"
    >
      <h2 :id="`confidentialite-${section.key}`" class="font-display text-xl font-bold">
        {{ t(`privacy.${section.key}.title`) }}
      </h2>
      <ul class="flex max-w-prose list-disc flex-col gap-2 pl-6">
        <li v-for="item in section.items" :key="item">
          {{ t(`privacy.${section.key}.${item}`) }}
          <!-- L'adresse de contact, cliquable, à la suite de la phrase qui l'annonce -->
          <a
            v-if="section.key === 'who' && item === 'contact'"
            :href="`mailto:${t('privacy.address')}`"
            :class="linkClass"
            >{{ t('privacy.address') }}</a
          >
          <!-- La politique d'Amazon, à la suite de la phrase qui la cite -->
          <a
            v-if="section.key === 'voice' && item === 'amazon'"
            :href="AMAZON_PRIVACY"
            target="_blank"
            rel="noopener noreferrer"
            :class="linkClass"
            >{{ t('privacy.voice.amazonLink') }}</a
          >
        </li>
      </ul>
    </section>
  </main>
</template>
