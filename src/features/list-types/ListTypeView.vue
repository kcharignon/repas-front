<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ChevronLeft, X } from 'lucide-vue-next'

import { ApiError } from '@/api'
import { hasFailed } from '@/api/query'
import LoadError from '@/design/LoadError.vue'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiField from '@/design/UiField.vue'
import UiSwitch from '@/design/UiSwitch.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useDepartments } from '@/features/ingredients/queries'
import { messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useOnline } from '@/offline/useOnline'
import { NAME_CODES, NAME_MAX_LENGTH } from './name'
import {
  useListType,
  useListTypes,
  useRemoveListType,
  useSaveListType,
  useUnsetProductDestination,
} from './queries'

// La fiche d'un type de liste (LST-006) : son nom, un interrupteur par rayon, ses produits à part. « Enregistrer » envoie le nom ET le
// jeu complet des rayons en une seule requête ; retirer un produit à part, lui, part tout de suite (c'est une action, pas un réglage).
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const notifications = useNotificationsStore()
const online = useOnline()

const id = computed(() => String(route.params.id))
const detail = useListType(() => id.value)
const departments = useDepartments()
const types = useListTypes()
const save = useSaveListType(() => id.value)
const remove = useRemoveListType(() => id.value)
const unset = useUnsetProductDestination()

// Le brouillon, et l'état enregistré dont il se distingue : une relecture (retour sur l'onglet, produit retiré) n'écrase jamais ce qu'on
// est en train de taper.
interface Form {
  name: string
  slugs: string[]
}
const draft = ref<Form>({ name: '', slugs: [] })
const baseline = ref<Form | null>(null)

const sameSlugs = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((slug, index) => slug === [...b].sort()[index])
const dirty = computed(
  () =>
    baseline.value !== null &&
    (draft.value.name.trim() !== baseline.value.name ||
      !sameSlugs(draft.value.slugs, baseline.value.slugs)),
)

function load(next: NonNullable<typeof detail.data.value>) {
  const form = { name: next.name, slugs: next.departments.map((department) => department.slug) }
  baseline.value = form
  draft.value = { name: form.name, slugs: [...form.slugs] }
}
watch(
  () => detail.data.value,
  (next) => {
    if (next !== undefined && (baseline.value === null || !dirty.value)) load(next)
  },
  { immediate: true },
)
// Un autre type ouvert avec la même vue : on repart de zéro
watch(id, () => {
  baseline.value = null
  draft.value = { name: '', slugs: [] }
  nameError.value = null
  failure.value = null
})

const typeNames = computed(
  () => new Map((types.data.value?.member ?? []).map((type) => [type.id, type.name])),
)
const rows = computed(() =>
  (departments.data.value?.member ?? []).map((department) => {
    const owner = department.listTypeId ?? null
    const takenBy =
      owner !== null && owner !== id.value ? (typeNames.value.get(owner) ?? null) : null

    return { slug: department.slug, name: department.name, takenBy }
  }),
)
const isPicked = (slug: string) => draft.value.slugs.includes(slug)
function setPicked(slug: string, picked: boolean) {
  const others = draft.value.slugs.filter((candidate) => candidate !== slug)
  draft.value = { ...draft.value, slugs: picked ? [...others, slug] : others }
}

const nameError = ref<string | null>(null)
const failure = ref<string | null>(null)
const locked = computed(() => save.isPending.value || remove.isPending.value || !online.value)
const notFound = computed(
  () => detail.error.value instanceof ApiError && detail.error.value.status === 404,
)

function submit() {
  const name = draft.value.name.trim()
  nameError.value = null
  failure.value = null
  if (name === '') {
    nameError.value = t('listTypes.nameRequired')

    return
  }
  save.mutate(
    { name, departmentSlugs: draft.value.slugs },
    {
      onSuccess: () => notifications.push('success', t('listTypes.saved')),
      onError: (error) => {
        const message = messageForFailure(error)
        if (error instanceof ApiError && NAME_CODES.includes(error.message))
          nameError.value = message
        else failure.value = message
      },
    },
  )
}

function release(slug: string, name: string) {
  failure.value = null
  unset.mutate(slug, {
    onSuccess: () => notifications.push('success', t('listTypes.productRemoved', { name })),
    onError: (error) => (failure.value = messageForFailure(error)),
  })
}

const deleting = ref(false)
function confirmDelete() {
  const name = baseline.value?.name ?? ''
  remove.mutate(undefined, {
    onSuccess: async () => {
      deleting.value = false
      notifications.push('success', t('listTypes.deleted', { name }))
      await router.replace({ name: 'list-types' })
    },
    onError: (error) => {
      deleting.value = false
      failure.value = messageForFailure(error)
    },
  })
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
    <RouterLink
      :to="{ name: 'list-types' }"
      class="inline-flex min-h-11 items-center gap-1 self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ChevronLeft class="size-5" aria-hidden="true" />{{ t('listTypes.title') }}
    </RouterLink>

    <p v-if="notFound" class="text-muted" role="alert">{{ t('listTypes.notFound') }}</p>
    <LoadError v-else-if="hasFailed(detail)" />
    <p v-else-if="baseline === null" class="text-muted" role="status">{{ t('common.loading') }}</p>

    <template v-else>
      <header>
        <h1
          class="font-display text-3xl leading-tight font-bold [overflow-wrap:anywhere] md:text-4xl"
        >
          {{ baseline.name }}
        </h1>
      </header>

      <form class="flex flex-col gap-6" novalidate @submit.prevent="submit">
        <UiField
          v-slot="{ id: fieldId, describedby, invalid }"
          :label="t('listTypes.name')"
          :error="nameError"
        >
          <UiTextInput
            :id="fieldId"
            v-model="draft.name"
            :maxlength="NAME_MAX_LENGTH"
            :aria-describedby="describedby"
            :invalid="invalid"
            autocomplete="off"
          />
        </UiField>

        <section class="flex flex-col gap-2" aria-labelledby="list-type-departments">
          <h2 id="list-type-departments" class="font-display text-2xl font-bold">
            {{ t('listTypes.departmentsTitle') }}
          </h2>
          <p class="text-muted">{{ t('listTypes.departmentsHelp') }}</p>
          <ul class="divide-y divide-line rounded-2xl border border-line bg-surface px-4 py-1">
            <li v-for="row in rows" :key="row.slug" class="py-1">
              <UiSwitch
                :model-value="isPicked(row.slug)"
                :label="row.name"
                :hint="
                  row.takenBy !== null ? t('listTypes.takenBy', { type: row.takenBy }) : undefined
                "
                @update:model-value="(value: boolean) => setPicked(row.slug, value)"
              />
            </li>
          </ul>
        </section>

        <section class="flex flex-col gap-2" aria-labelledby="list-type-products">
          <h2 id="list-type-products" class="font-display text-2xl font-bold">
            {{ t('listTypes.productsTitle') }}
          </h2>
          <p class="text-muted">{{ t('listTypes.productsHelp') }}</p>
          <p v-if="(detail.data.value?.ingredients ?? []).length === 0" class="text-muted">
            {{ t('listTypes.productsNone') }}
          </p>
          <ul v-else class="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
            <li
              v-for="product in detail.data.value?.ingredients ?? []"
              :key="product.slug"
              class="flex min-h-16 items-center justify-between gap-3 py-2"
            >
              <span class="flex min-w-0 flex-col">
                <span class="font-semibold [overflow-wrap:anywhere]">{{ product.name }}</span>
                <span class="text-sm text-muted">{{ product.departmentName }}</span>
              </span>
              <UiButton
                variant="ghost"
                size="icon"
                :aria-label="t('listTypes.productRemove', { name: product.name })"
                :disabled="unset.isPending.value || !online"
                @click="release(product.slug, product.name)"
              >
                <X class="size-5" aria-hidden="true" />
              </UiButton>
            </li>
          </ul>
        </section>

        <p
          v-if="failure"
          role="alert"
          class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
        >
          {{ failure }}
        </p>

        <div>
          <UiButton type="submit" :disabled="locked || !dirty">{{ t('listTypes.save') }}</UiButton>
        </div>
      </form>

      <div>
        <button
          type="button"
          class="inline-flex min-h-11 cursor-pointer items-center font-bold text-danger underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          :disabled="locked"
          @click="deleting = true"
        >
          {{ t('listTypes.delete') }}
        </button>
      </div>

      <UiConfirmDialog
        v-model:open="deleting"
        :title="t('listTypes.deleteTitle', { name: baseline.name })"
        :description="t('listTypes.deleteBody')"
        :confirm-label="t('listTypes.deleteConfirm')"
        :pending="remove.isPending.value"
        @confirm="confirmDelete"
      />
    </template>
  </main>
</template>
