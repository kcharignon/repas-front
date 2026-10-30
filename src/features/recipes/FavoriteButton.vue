<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Star } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import { useSetRecipeFavorite } from './queries'

// L'étoile de la fiche d'une recette à soi : elle la met en favoris (liste « Favoris » en tête des types) ou l'en retire.
// Le nom complet reste celui des lecteurs d'écran, comme pour le bouton d'ajout à la liste.
const props = defineProps<{ recipeId: string; name: string; favorite: boolean }>()

const { t } = useI18n()
const set = useSetRecipeFavorite()

const label = computed(() =>
  t(props.favorite ? 'recipes.favoriteRemove' : 'recipes.favoriteAdd', { name: props.name }),
)

function toggle() {
  set.mutate({ id: props.recipeId, favorite: !props.favorite })
}
</script>

<template>
  <UiButton
    variant="ghost"
    size="icon"
    :aria-pressed="favorite"
    :aria-label="label"
    :title="label"
    :disabled="set.isPending.value"
    class="shrink-0 rounded-full"
    data-favorite-button
    @click="toggle"
  >
    <Star
      class="size-7"
      :class="favorite ? 'fill-star text-star' : 'text-muted'"
      stroke-width="2"
      aria-hidden="true"
    />
  </UiButton>
</template>
