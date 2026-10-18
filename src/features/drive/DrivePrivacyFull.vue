<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// La note de vie privée complète du drive (DRV-504) : ce que Repas garde, ne voit jamais, et comment tout effacer. Le texte vient de
// `drivePrivacy.full` ; les clés ci-dessous ne font que l'ordonner. Elle porte l'ancre `#vie-privee`, cible du lien de la note courte.
const { t } = useI18n()

const sections = [
  { key: 'how', items: ['start', 'session', 'local', 'order'] },
  { key: 'saves', items: ['store', 'choices', 'products', 'lists'] },
  { key: 'never', items: ['credentials', 'cookies', 'address', 'basket', 'photos'] },
  { key: 'where', items: ['server', 'duration', 'backups', 'phone', 'sheets'] },
  { key: 'erase', items: ['product', 'store', 'all', 'rights'] },
  { key: 'before', items: ['account', 'suspension', 'stop', 'manual'] },
] as const
</script>

<template>
  <section
    id="vie-privee"
    tabindex="-1"
    aria-labelledby="vie-privee-titre"
    class="flex scroll-mt-4 flex-col gap-4 outline-none"
  >
    <h2 id="vie-privee-titre" class="font-display text-2xl font-bold">
      {{ t('drivePrivacy.full.title') }}
    </h2>
    <p class="max-w-prose">{{ t('drivePrivacy.full.intro') }}</p>
    <section
      v-for="section in sections"
      :key="section.key"
      :aria-labelledby="`vie-privee-${section.key}`"
      class="flex flex-col gap-2"
    >
      <h3 :id="`vie-privee-${section.key}`" class="font-display text-xl font-bold">
        {{ t(`drivePrivacy.full.${section.key}.title`) }}
      </h3>
      <ul class="flex max-w-prose list-disc flex-col gap-2 pl-6">
        <li v-for="item in section.items" :key="item">
          {{ t(`drivePrivacy.full.${section.key}.${item}`) }}
        </li>
      </ul>
    </section>
  </section>
</template>
