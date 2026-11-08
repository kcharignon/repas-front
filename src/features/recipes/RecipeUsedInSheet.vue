<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

import type { RecipeSummary } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiSheet from '@/design/UiSheet.vue'
import SecretBadge from './SecretBadge.vue'

/**
 * Les recettes qui utilisent celle-ci (COMP-006) : « Voir lesquelles » de la fiche et de l'éditeur, et le refus de la supprimer
 * (`refusal` : le titre et la phrase du refus, un bouton « Fermer »). Chaque recette est un lien vers sa fiche.
 */
const open = defineModel<boolean>('open', { default: false })

withDefaults(
  defineProps<{
    recipes: readonly RecipeSummary[]
    /** Le refus d'une suppression : « Suppression impossible », ce qui s'est passé, et un bouton pour fermer. */
    refusal?: boolean
  }>(),
  { refusal: false },
)

const { t } = useI18n()
</script>

<template>
  <UiSheet
    v-model:open="open"
    :title="refusal ? t('recipes.usedIn.deleteTitle') : t('recipes.usedIn.title')"
    :description="refusal ? t('recipes.componentErrors.used') : undefined"
  >
    <ul class="flex flex-col divide-y divide-line">
      <li v-for="recipe in recipes" :key="recipe.id">
        <RouterLink
          :to="{ name: 'recipe', params: { id: recipe.id } }"
          data-used-in
          class="flex min-h-16 items-center gap-3 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          @click="open = false"
        >
          <span class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span class="text-[17px] font-bold [overflow-wrap:anywhere]">{{ recipe.name }}</span>
            <SecretBadge v-if="recipe.secret" />
          </span>
          <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>
    <UiButton v-if="refusal" size="lg" class="w-full" @click="open = false">{{
      t('common.close')
    }}</UiButton>
  </UiSheet>
</template>
