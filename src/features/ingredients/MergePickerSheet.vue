<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from 'lucide-vue-next'

import type { MergeCandidate } from '@/api'
import UiSheet from '@/design/UiSheet.vue'
import { useMergeCandidates } from './queries'
import { usageText } from './mergeText'
import { useDebounced } from './useDebounced'

/**
 * Le choix de l'ingrédient à garder, depuis la fiche de `absorbed` : une recherche, ses candidats du même rayon d'abord, puis ceux des
 * autres rayons. À monter à l'ouverture (`v-if`) : la recherche part du début du nom, sans appel à vide.
 */
const props = defineProps<{ absorbed: { slug: string; name: string } }>()

const open = defineModel<boolean>('open', { default: true })

const emit = defineEmits<{ pick: [candidate: MergeCandidate] }>()

const { t } = useI18n()

// « Tomates » ouvre la recherche sur « tomates » : le premier mot suffit à retrouver « Tomate » et « Tomate cerise »
const search = ref(props.absorbed.name.trim().split(/\s+/)[0]?.toLowerCase() ?? '')
const searched = useDebounced(search)
const term = computed(() => searched.value.trim())

const candidates = useMergeCandidates(
  () => props.absorbed.slug,
  () => term.value,
  () => open.value,
)

const items = computed(() => candidates.data.value?.member ?? [])
// Le même rayon d'abord (le back classe déjà : les plus ressemblants en tête), puis les autres
const groups = computed(() => {
  const same = items.value.filter((candidate) => candidate.sameDepartment)
  const others = items.value.filter((candidate) => !candidate.sameDepartment)

  return [
    {
      key: 'same',
      title: t('ingredients.merge.sameDepartment', {
        department: same[0]?.departmentName ?? '',
      }),
      items: same,
    },
    { key: 'others', title: t('ingredients.merge.otherDepartments'), items: others },
  ].filter((group) => group.items.length > 0)
})

/** « 12 recettes · 3 listes · kilo » dans le même rayon ; « Surgelé · 1 recette » dans un autre. */
function detail(candidate: MergeCandidate): string {
  const usage = usageText(t, candidate)
  const parts = candidate.sameDepartment
    ? [usage, candidate.purchaseUnitName]
    : [candidate.departmentName, usage]

  return parts.filter((part) => part !== '').join(' · ')
}

function pick(candidate: MergeCandidate) {
  open.value = false
  emit('pick', candidate)
}
</script>

<template>
  <UiSheet
    v-model:open="open"
    :title="t('ingredients.merge.pickerTitle', { name: absorbed.name })"
    :description="t('ingredients.merge.pickerHelp', { name: absorbed.name })"
  >
    <label
      class="flex min-h-12 items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-bg px-3.5 text-muted focus-within:border-primary"
    >
      <Search class="size-5 shrink-0" aria-hidden="true" />
      <span class="sr-only">{{ t('ingredients.merge.search') }}</span>
      <input
        v-model="search"
        type="search"
        maxlength="100"
        autocomplete="off"
        :placeholder="t('ingredients.merge.search')"
        class="min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
      />
    </label>

    <p
      v-if="candidates.isError.value && candidates.data.value === undefined"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('ingredients.merge.searchFailed') }}
    </p>
    <p v-else-if="candidates.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="items.length === 0" class="text-muted" role="status">
      {{ t('ingredients.merge.noMatch', { search: term }) }}
    </p>

    <div v-else class="flex flex-col gap-4">
      <section v-for="group in groups" :key="group.key" class="flex flex-col gap-2">
        <h3 class="text-xs font-semibold tracking-wide text-muted uppercase">{{ group.title }}</h3>
        <ul class="flex flex-col gap-2">
          <li v-for="candidate in group.items" :key="candidate.slug">
            <button
              type="button"
              class="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 py-2 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
              @click="pick(candidate)"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-[17px] font-semibold">{{ candidate.name }}</span>
                <span class="block text-sm text-muted">{{ detail(candidate) }}</span>
              </span>
              <span
                v-if="candidate.veryClose"
                class="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-on-primary"
                >{{ t('ingredients.merge.veryClose') }}</span
              >
            </button>
          </li>
        </ul>
      </section>
    </div>
  </UiSheet>
</template>
