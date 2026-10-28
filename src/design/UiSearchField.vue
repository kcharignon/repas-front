<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, X } from 'lucide-vue-next'

/**
 * Un champ de recherche : loupe, saisie (`type="search"`, étiquette lue par les lecteurs d'écran) et, dès qu'il y a du texte, un
 * bouton de 44 px pour l'effacer (le focus revient dans le champ). Le bouton natif de Chromium est masqué : un seul geste, le même partout.
 */
defineProps<{ label: string; maxlength?: number }>()
const model = defineModel<string>({ required: true })

const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)

function clear() {
  model.value = ''
  input.value?.focus()
}
</script>

<template>
  <div
    class="flex min-h-12 items-center gap-1 rounded-xl border-[1.5px] border-line bg-surface pl-3.5 text-muted focus-within:border-primary"
  >
    <label class="flex min-w-0 flex-1 items-center gap-2.5">
      <Search class="size-5 shrink-0" aria-hidden="true" />
      <span class="sr-only">{{ label }}</span>
      <input
        ref="input"
        v-model="model"
        type="search"
        :maxlength="maxlength"
        autocomplete="off"
        :placeholder="label"
        class="min-w-0 flex-1 bg-transparent py-2 text-base text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
      />
    </label>
    <button
      v-if="model !== ''"
      type="button"
      :aria-label="t('common.clearSearch')"
      class="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
      @click="clear"
    >
      <X class="size-5" aria-hidden="true" />
    </button>
  </div>
</template>
