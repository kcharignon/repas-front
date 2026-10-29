<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Check, Copy } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import { capitalized, type OtherRecipe } from './otherRecipeGroups'

/**
 * Une recette d'un autre : son nom (qui mène à sa fiche), sa catégorie quand l'écran ne la dit pas déjà, et « Copier ».
 * Une fois copiée, le bouton dit « Copiée » et reste grisé pour la visite : pas de seconde copie par erreur.
 */
defineProps<{ recipe: OtherRecipe; showType: boolean; busy: boolean; copied: boolean }>()
defineEmits<{ copy: [recipe: OtherRecipe] }>()

const { t } = useI18n()
</script>

<template>
  <li
    class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
  >
    <RouterLink
      :to="{ name: 'recipe', params: { id: recipe.id } }"
      class="flex min-w-0 flex-1 flex-col hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span class="text-lg font-bold [overflow-wrap:anywhere]">{{ recipe.name }}</span>
      <span v-if="showType" class="text-sm text-muted">{{ capitalized(recipe.typeName) }}</span>
    </RouterLink>
    <UiButton
      v-if="copied"
      variant="ghost"
      class="bg-soft text-primary disabled:opacity-100"
      :aria-label="t('recipes.copiedNamed', { name: recipe.name })"
      disabled
    >
      <Check class="size-5" aria-hidden="true" />{{ t('recipes.copied') }}
    </UiButton>
    <UiButton
      v-else
      variant="secondary"
      :aria-label="t('recipes.copyNamed', { name: recipe.name })"
      :disabled="busy"
      @click="$emit('copy', recipe)"
    >
      <Copy class="size-5" aria-hidden="true" />{{ t('recipes.copy') }}
    </UiButton>
  </li>
</template>
