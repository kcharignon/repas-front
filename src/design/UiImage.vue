<script setup lang="ts">
import { ImageOff } from 'lucide-vue-next'
import { ref, watch } from 'vue'

import { imageUrl } from '@/features/shopping-lists/format'

/**
 * Image décorative du back (rayon, type de recette…). Si le chemin est vide ou si le fichier manque, une icône neutre de même taille
 * prend la place : jamais d'icône cassée. La taille vient de la classe de l'appelant, donc rien ne bouge au moment de la bascule.
 */
const props = defineProps<{ src: string }>()

const failed = ref(false)

// Une nouvelle adresse mérite un nouvel essai ; l'erreur d'une même adresse n'est traitée qu'une fois.
watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <ImageOff
    v-if="failed || props.src === ''"
    class="shrink-0 text-muted"
    data-testid="image-fallback"
    aria-hidden="true"
  />
  <img
    v-else
    :src="imageUrl(props.src)"
    alt=""
    aria-hidden="true"
    class="object-contain"
    @error="failed = true"
  />
</template>
