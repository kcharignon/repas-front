<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

// La note de vie privée courte du drive (DRV-504), à afficher dans les réglages du drive avant la première activation de l'envoi : ce que
// Repas retient, ce qu'il ne voit jamais, et le risque pour le compte Leclerc. Elle mène à la note complète de l'aide (`#vie-privee`,
// `DrivePrivacyFull`). Le texte est dans `drivePrivacy.short` ; les deux notes disent la même chose, à garder identiques au fond à
// `docs/drive/note-vie-privee.md` du dépôt back.
const { t } = useI18n()
</script>

<template>
  <section
    aria-labelledby="drive-privacy-note-title"
    class="flex flex-col items-start gap-2 rounded-2xl bg-soft px-5 py-4"
  >
    <h2 id="drive-privacy-note-title" class="font-display text-xl font-bold">
      {{ t('drivePrivacy.short.title') }}
    </h2>
    <p class="max-w-prose">{{ t('drivePrivacy.short.text') }}</p>
    <RouterLink
      :to="{ name: 'drive-help', hash: '#vie-privee' }"
      class="inline-flex min-h-11 items-center font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('drivePrivacy.short.link') }}
    </RouterLink>
  </section>
</template>
