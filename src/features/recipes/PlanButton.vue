<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Plus } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import { useActiveSummary } from '@/features/shopping-lists/queries'
import { usePlanRecipe } from './queries'

const props = withDefaults(
  defineProps<{
    recipeId: string
    name: string
    /** `icon` : rond de 44 px sans texte (cartes de la liste) ; `label` : pastille courte avec texte (fiche). */
    variant?: 'icon' | 'label'
    /**
     * La recette a un ingrédient que le back ne sait pas convertir : on ne l'ajoute pas à la liste tant qu'il n'est pas réglé (la planification
     * échouerait). Elle peut toujours être retirée. `describedby` : le texte qui dit pourquoi le bouton est grisé.
     */
    blocked?: boolean
    describedby?: string
  }>(),
  { variant: 'label', blocked: false, describedby: undefined },
)

const { t } = useI18n()
const summary = useActiveSummary()
const plan = usePlanRecipe()

const planned = computed(
  () => summary.data.value?.plannedRecipeIds.includes(props.recipeId) === true,
)
// Le nom complet reste celui des lecteurs d'écran, même quand le texte visible est court ou absent. Avec un texte visible
// (pastille), le nom le contient (WCAG 2.5.3, commande vocale) : « Dans la liste, retirer … ».
const fullLabel = computed(() => {
  if (!planned.value) return t('recipes.planNamed', { name: props.name })

  return t(props.variant === 'label' ? 'recipes.inListNamed' : 'recipes.unplanNamed', {
    name: props.name,
  })
})

const mustWait = computed(() => props.blocked && !planned.value)

function toggle() {
  plan.mutate({
    recipeId: props.recipeId,
    planned: !planned.value,
    hasActiveList: summary.data.value?.shoppingListId != null,
  })
}
</script>

<template>
  <UiButton
    :variant="planned ? 'ghost' : 'secondary'"
    :size="variant === 'icon' ? 'icon' : 'md'"
    :aria-pressed="planned"
    :aria-label="fullLabel"
    :aria-describedby="mustWait ? describedby : undefined"
    :title="variant === 'icon' ? fullLabel : undefined"
    :disabled="plan.isPending.value || summary.isPending.value || mustWait"
    :class="[
      'rounded-full',
      variant === 'icon' ? 'shrink-0' : 'px-4',
      planned ? 'bg-soft text-primary' : '',
    ]"
    @click="toggle"
  >
    <Check v-if="planned" class="size-5" aria-hidden="true" />
    <Plus v-else class="size-5" aria-hidden="true" />
    <template v-if="variant === 'label'">{{
      t(planned ? 'recipes.inList' : 'recipes.add')
    }}</template>
  </UiButton>
</template>
