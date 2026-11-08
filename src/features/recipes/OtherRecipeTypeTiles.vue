<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import UiImage from '@/design/UiImage.vue'
import { capitalized } from './otherRecipeGroups'

/**
 * Une tuile par catégorie qui a des recettes à copier : la même que celle des rayons (`DepartmentsView`), avec en plus le nombre de
 * recettes sous le nom. Toute la tuile est le lien ; il s'ouvre avec `push`, donc le bouton retour du téléphone ramène ici.
 */
defineProps<{ types: { typeSlug: string; typeName: string; count: number; image: string }[] }>()

const { t } = useI18n()
</script>

<template>
  <ul :aria-label="t('recipes.types')" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
    <li v-for="type in types" :key="type.typeSlug" class="flex">
      <RouterLink
        :to="{ name: 'recipes-others', query: { categorie: type.typeSlug } }"
        class="flex min-h-32 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface p-4 text-center font-bold hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <UiImage :src="type.image" class="size-12" />
        <span class="flex min-w-0 flex-col gap-0.5">
          <span class="[overflow-wrap:anywhere]">{{ capitalized(type.typeName) }}</span>
          <span class="text-sm font-normal text-muted">{{
            t('recipes.othersCount', { count: type.count }, type.count)
          }}</span>
        </span>
      </RouterLink>
    </li>
  </ul>
</template>
