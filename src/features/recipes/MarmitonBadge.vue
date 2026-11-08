<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Link } from 'lucide-vue-next'

// La pastille « Marmiton » (MAR-004) : sur une recette copiée de Marmiton dans « Recettes des autres ». Même forme que « Secrète » ;
// l'icône est décorative, le mot est le texte.
const { t } = useI18n()
</script>

<template>
  <span
    data-marmiton-badge
    class="inline-flex items-center gap-1.5 self-start rounded-full bg-secret-soft px-2.5 py-1 text-sm font-semibold text-on-secret-soft"
  >
    <Link class="size-3.5" stroke-width="2.2" aria-hidden="true" />{{ t('recipes.marmitonBadge') }}
  </span>
</template>
