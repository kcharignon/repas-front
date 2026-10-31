<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

// Le chemin pour changer de liste (LST-010) : une pastille en tête de l'écran « Liste » et de la page d'une liste envoyée ou terminée.
// Même forme que les anciennes pastilles de listes ; aucun nombre, aucun décor de saison.
const { t } = useI18n()
</script>

<template>
  <RouterLink
    :to="{ name: 'shopping-lists' }"
    class="inline-flex min-h-11 cursor-pointer items-center gap-1 self-start rounded-full border-[1.5px] border-line bg-surface pr-4 pl-2.5 text-base font-bold text-ink transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
  >
    <ChevronLeft
      class="size-[22px] text-primary"
      :stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    />
    {{ t('shoppingList.allLists') }}
  </RouterLink>
</template>
