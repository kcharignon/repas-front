<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Copy } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import { capitalized, type OtherRecipe } from './otherRecipeGroups'

/** Une recette d'un autre : son nom (qui mène à sa fiche), sa catégorie quand l'écran ne la dit pas déjà, et « Copier ». */
defineProps<{ recipe: OtherRecipe; showType: boolean; busy: boolean }>()
defineEmits<{ copy: [id: string] }>()

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
      variant="secondary"
      :aria-label="t('recipes.copyNamed', { name: recipe.name })"
      :disabled="busy"
      @click="$emit('copy', recipe.id)"
    >
      <Copy class="size-5" aria-hidden="true" />{{ t('recipes.copy') }}
    </UiButton>
  </li>
</template>
