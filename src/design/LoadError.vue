<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import SeasonArt from './season/SeasonArt.vue'

/**
 * « Le serveur est injoignable » (lecture qui a échoué, rien à montrer) : la phrase d'erreur, avec en saison la pièce `error` au-dessus
 * (ADR 0012). Un texte propre à la vue peut remplacer la phrase par défaut.
 */
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-3">
    <SeasonArt name="error" class="size-24 self-start" />
    <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft">
      <slot>{{ t('errors.unreachable') }}</slot>
    </p>
  </div>
</template>
