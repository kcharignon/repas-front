<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import LoadError from '@/design/LoadError.vue'
import UiButton from '@/design/UiButton.vue'
import { useDepartments } from '@/features/ingredients/queries'
import NewListTypeDialog from './NewListTypeDialog.vue'
import { useListTypes } from './queries'

// « Moi, Types de liste » (LST-006) : les types du compte, puis la liste principale (celle d'aujourd'hui, qui n'est pas un type et ne
// se supprime pas). Un compte sans type voit l'écran vide et « Ajouter un type ».
const { t } = useI18n()

const types = useListTypes()
const departments = useDepartments()
const items = computed(() => types.data.value?.member ?? [])
const adding = ref(false)

const departmentNames = computed(
  () =>
    new Map(
      (departments.data.value?.member ?? []).map((department) => [
        department.slug,
        department.name,
      ]),
    ),
)

/** « Viandes, Charcuterie · 2 produits à part » : les rayons du type par leur nom, puis ses produits à part. */
function summary(type: { departmentSlugs: string[]; ingredientCount: number }): string {
  if (type.departmentSlugs.length === 0 && type.ingredientCount === 0)
    return t('listTypes.noDepartments')
  const parts = [
    type.departmentSlugs
      .map((slug) => departmentNames.value.get(slug))
      .filter((name) => name !== undefined)
      .join(', '),
  ]
  if (type.ingredientCount > 0)
    parts.push(t('listTypes.standalone', { count: type.ingredientCount }, type.ingredientCount))

  return parts.filter((part) => part !== '').join(' · ')
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <RouterLink
      :to="{ name: 'account' }"
      class="inline-flex min-h-11 items-center gap-1 self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ChevronLeft class="size-5" aria-hidden="true" />{{ t('account.title') }}
    </RouterLink>

    <header>
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t('listTypes.title') }}
      </h1>
      <p class="mt-1 text-muted">{{ t('listTypes.intro') }}</p>
    </header>

    <p v-if="types.isPending.value" class="text-muted" role="status">{{ t('common.loading') }}</p>
    <LoadError v-else-if="hasFailed(types)" />
    <template v-else>
      <p v-if="items.length === 0" class="text-muted">{{ t('listTypes.none') }}</p>

      <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        <li v-for="type in items" :key="type.id">
          <RouterLink
            :to="{ name: 'list-type', params: { id: type.id } }"
            class="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <span class="flex min-w-0 flex-col">
              <span class="text-lg font-bold [overflow-wrap:anywhere]">{{ type.name }}</span>
              <span class="text-sm text-muted [overflow-wrap:anywhere]">{{ summary(type) }}</span>
            </span>
            <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
          </RouterLink>
        </li>
        <!-- La liste principale : la liste d'avant les types, elle existe pour tous et ne s'ouvre pas ici -->
        <li class="flex min-h-16 flex-col justify-center bg-soft px-4 py-3">
          <span class="text-lg font-bold">{{ t('listTypes.main') }}</span>
          <span class="text-sm text-muted">{{ t('listTypes.mainHelp') }}</span>
        </li>
      </ul>

      <div>
        <UiButton @click="adding = true">{{ t('listTypes.add') }}</UiButton>
      </div>
    </template>

    <NewListTypeDialog v-model:open="adding" />
  </main>
</template>
