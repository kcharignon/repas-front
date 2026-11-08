<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Link, Pencil } from 'lucide-vue-next'

// « Nouvelle recette » (MAR-004) : rien d'autre que le choix, deux parcours de même poids. Aucun des deux ne commence avant.
const { t } = useI18n()

const card =
  'flex min-h-24 items-center gap-4 rounded-2xl border-[1.5px] border-line bg-surface p-4 transition-colors hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <RouterLink :to="{ name: 'recipes' }" class="self-start font-bold text-primary underline">
      {{ t('recipes.title') }}
    </RouterLink>
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t('editor.newTitle') }}
    </h1>
    <p class="text-lg">{{ t('recipeNew.question') }}</p>

    <ul class="flex flex-col gap-3">
      <li>
        <RouterLink :to="{ name: 'recipe-new-write' }" :class="card">
          <span
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"
            aria-hidden="true"
          >
            <Pencil class="size-6" />
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="text-lg leading-tight font-bold">{{ t('recipeNew.writeTitle') }}</span>
            <span class="text-muted">{{ t('recipeNew.writeHint') }}</span>
          </span>
        </RouterLink>
      </li>
      <li>
        <RouterLink :to="{ name: 'recipe-new-marmiton' }" :class="card">
          <span
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"
            aria-hidden="true"
          >
            <Link class="size-6" />
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="text-lg leading-tight font-bold">{{ t('recipeNew.marmitonTitle') }}</span>
            <span class="text-muted">{{ t('recipeNew.marmitonHint') }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </main>
</template>
