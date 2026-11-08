<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { RouterLink, useRouter } from 'vue-router'
import { Check, Copy } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import { useSessionStore } from '@/session/session'
import MarmitonBadge from './MarmitonBadge.vue'
import { findOwnCopy } from './ownCopy'
import { capitalized, type OtherRecipe } from './otherRecipeGroups'

/**
 * Une recette d'un autre : son nom (qui mène à sa fiche), sa catégorie quand l'écran ne la dit pas déjà, et « Copier ».
 * Une fois copiée, le bouton dit « Copiée » et reste grisé pour la visite : pas de seconde copie par erreur.
 */
const props = defineProps<{
  recipe: OtherRecipe
  showType: boolean
  busy: boolean
  copied: boolean
}>()
defineEmits<{ copy: [recipe: OtherRecipe] }>()

const { t } = useI18n()
const session = useSessionStore()
const queryClient = useQueryClient()
const router = useRouter()

// L'administrateur voit la version commune d'une recette Marmiton même quand il l'a déjà copiée (MAR-005) : « Ma copie » mène à SA copie.
// Le back ne dit pas laquelle ; on la retrouve parmi ses recettes. Introuvable (renommée, changée de type) : la version commune s'ouvre,
// d'où il peut la copier de nouveau.
const haveCopy = () => session.isAdmin && props.recipe.alreadyCopied === true
const opening = ref(false)
async function openCopy() {
  opening.value = true
  const id = await findOwnCopy(queryClient, session.api, props.recipe).catch(() => null)
  opening.value = false
  await router.push({ name: 'recipe', params: { id: id ?? props.recipe.id } })
}
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
      <MarmitonBadge v-if="recipe.fromMarmiton === true" class="mt-1" />
      <span
        v-if="haveCopy()"
        data-have-copy
        class="mt-1.5 flex items-center gap-1.5 text-sm text-muted"
        ><Check class="size-4" stroke-width="2.5" aria-hidden="true" />{{
          t('recipes.common.haveCopy')
        }}</span
      >
    </RouterLink>
    <button
      v-if="haveCopy()"
      type="button"
      data-open-copy
      class="min-h-11 shrink-0 cursor-pointer rounded-lg px-3 font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
      :aria-label="t('recipes.common.myCopyNamed', { name: recipe.name })"
      :disabled="opening"
      @click="openCopy"
    >
      {{ t('recipes.common.myCopy') }}
    </button>
    <UiButton
      v-else-if="copied"
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
