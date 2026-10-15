<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Plus } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import { useActiveSummary } from '@/features/shopping-lists/queries'
import { usePlanRecipe } from './queries'

const props = defineProps<{ recipeId: string; name: string }>()

const { t } = useI18n()
const summary = useActiveSummary()
const plan = usePlanRecipe()

const planned = computed(
  () => summary.data.value?.plannedRecipeIds.includes(props.recipeId) === true,
)

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
    :aria-pressed="planned"
    :aria-label="t(planned ? 'recipes.unplanNamed' : 'recipes.planNamed', { name })"
    :disabled="plan.isPending.value || summary.isPending.value"
    :class="planned ? 'bg-soft text-primary' : ''"
    @click="toggle"
  >
    <Check v-if="planned" class="size-5" aria-hidden="true" />
    <Plus v-else class="size-5" aria-hidden="true" />
    {{ t(planned ? 'recipes.inList' : 'recipes.addToList') }}
  </UiButton>
</template>
