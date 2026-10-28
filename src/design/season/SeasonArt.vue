<script setup lang="ts">
import { ref, useAttrs, watch } from 'vue'

import { useSeasonStore } from '../season'
import { loadPiece } from './art'

/**
 * Une illustration de la saison ACTIVE (ADR 0012), ou rien : hors saison, saison coupée ou emplacement inconnu, le composant ne rend
 * rien et ne télécharge rien. `name` est un emplacement de `art/index.ts` (`empty-list`, `title-recipes`…), jamais un nom de pièce :
 * la même vue sert toutes les saisons. Le contenu par défaut (slot) ne sert que de repli quand la pièce n'est pas là (hors saison, ou jamais chargée et hors connexion). La taille vient des classes du parent (`class="size-10"`). Décorative : cachée des lecteurs d'écran,
 * sans événement de souris, jamais de `title` ; l'information passe par le texte voisin. Le SVG vient de NOS fichiers versionnés
 * (`art/<saison>/`), jamais d'une donnée de l'utilisateur : `v-html` est sans risque ici (la CSP reste stricte).
 */
// Les classes du parent vont à la pièce seulement : le contenu de repli (slot) garde les siennes.
defineOptions({ inheritAttrs: false })
const props = defineProps<{ name: string }>()
const attrs = useAttrs()

const season = useSeasonStore()
const svg = ref<string | null>(null)

watch(
  () => [season.activeSeason, props.name] as const,
  async ([active, name], _previous, onCleanup) => {
    let stale = false
    onCleanup(() => (stale = true))
    if (active === null) {
      svg.value = null

      return
    }
    const piece = await loadPiece(active, name)
    if (!stale) svg.value = piece
  },
  { immediate: true },
)
</script>

<template>
  <span
    v-if="svg"
    v-bind="attrs"
    aria-hidden="true"
    class="pointer-events-none inline-block shrink-0 [&>svg]:block [&>svg]:size-full"
    v-html="svg"
  />
  <slot v-else />
</template>
