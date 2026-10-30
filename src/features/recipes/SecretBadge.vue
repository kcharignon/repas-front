<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Lock } from 'lucide-vue-next'

// La pastille « Secrète » (REC-002) : sur la recette de la personne qui a choisi de la garder pour elle, dans « Mes recettes » et
// en tête de la recette. Le cadenas est décoratif, le mot « Secrète » est le texte.
const { t } = useI18n()
</script>

<template>
  <span
    data-secret-badge
    class="inline-flex items-center gap-1.5 self-start rounded-full bg-secret-soft px-2.5 py-1 text-sm font-semibold text-on-secret-soft"
  >
    <Lock class="size-3.5" stroke-width="2.2" aria-hidden="true" />{{ t('recipes.secretBadge') }}
  </span>
</template>
