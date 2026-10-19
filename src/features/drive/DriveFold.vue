<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

// Un bloc replié (« Voir les articles », « Détails », DRV-622) : ce qui sert au dépannage ou à la vérification ne prend pas la place de la
// seule décision de l'écran. Un élément natif : clavier, lecteurs d'écran et mouvement réduit sans code de plus.
defineProps<{ label: string }>()
</script>

<template>
  <details class="group rounded-xl border border-line bg-surface">
    <summary
      class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
    >
      {{ label }}
      <ChevronRight
        class="size-5 shrink-0 text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </summary>
    <div class="flex flex-col gap-3 px-4 pb-4"><slot /></div>
  </details>
</template>
