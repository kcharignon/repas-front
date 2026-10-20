<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, CircleAlert } from 'lucide-vue-next'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import UiSheet from '@/design/UiSheet.vue'
import { messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useMergeIngredients, useMergePreview } from './queries'
import { blockKey, unitList, usesSentence } from './mergeText'

/**
 * La confirmation commune des deux entrées (les doublons et la fiche) : ce que la fusion de `absorbed` dans `kept` ferait, d'après
 * `merge-preview` (lu à l'ouverture), puis la fusion. Une unité qui manque ou un refus de règle s'affichent seulement quand ils arrivent.
 */
const props = defineProps<{
  absorbed: { slug: string; name: string }
  kept: { slug: string; name: string }
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  /** La fusion est faite : le rayon de l'ingrédient gardé (le slug de l'absorbé n'existe plus). */
  merged: [departmentSlug: string]
  /** L'un des deux n'existe plus : l'écran d'origine relit sa liste. */
  gone: []
}>()

const { t } = useI18n()
const notifications = useNotificationsStore()

const preview = useMergePreview(
  () => props.absorbed.slug,
  () => props.kept.slug,
  () => open.value,
)
const merge = useMergeIngredients()
const failure = ref<string | null>(null)

watch(open, (value) => {
  if (value) failure.value = null
})

const isGone = (error: unknown) => error instanceof ApiError && error.status === 404

// Un des deux a disparu entre-temps : la feuille se ferme et l'écran d'origine se relit
watch(
  () => preview.error.value,
  (error) => {
    if (open.value && isGone(error)) leave()
  },
)

function leave() {
  open.value = false
  notifications.push('error', t('ingredients.merge.gone'))
  emit('gone')
}

type Kind = 'ok' | 'unit' | 'blocked'

const data = computed(() => preview.data.value)
const kind = computed<Kind | null>(() => {
  const value = data.value
  if (value === undefined) return null
  const blockedBy = value.blockedBy ?? null
  if (blockedBy === 'UNIT_MISSING' || (blockedBy === null && value.missingUnits.length > 0))
    return 'unit'
  if (blockedBy !== null || !value.canMerge) return 'blocked'

  return 'ok'
})
const loading = computed(
  () => data.value === undefined && (preview.isPending.value || preview.isFetching.value),
)
const previewFailed = computed(
  () => preview.isError.value && data.value === undefined && !isGone(preview.error.value),
)

const title = computed(() =>
  kind.value === 'unit'
    ? t('ingredients.merge.unitMissingTitle', { name: props.kept.name })
    : t('ingredients.merge.title', { absorbed: props.absorbed.name, kept: props.kept.name }),
)

const uses = computed(() =>
  data.value === undefined
    ? ''
    : usesSentence(
        t,
        {
          recipeCount: data.value.recipeCount,
          listCount: data.value.listCount,
          absorbedName: props.absorbed.name,
        },
        props.kept.name,
      ),
)

// Une seule de ces trois phrases, par priorité : le rayon, puis la conversion des listes, puis « rien ne change »
const quantities = computed(() => {
  const value = data.value
  if (value?.departmentChanges)
    return t('ingredients.merge.departmentChanges', {
      name: props.absorbed.name,
      from: value.absorbed.departmentName,
      to: value.keep.departmentName,
    })
  if (value?.listQuantitiesConverted)
    return t('ingredients.merge.quantitiesConverted', { unit: value.keep.purchaseUnitName })

  return t('ingredients.merge.quantitiesSame')
})

const missing = computed(() => {
  const value = data.value
  if (value === undefined) return ''
  const names = value.missingUnits.map((unit) => unit.name)

  return t(
    'ingredients.merge.unitMissing',
    { units: unitList(t, names), unit: value.keep.purchaseUnitName },
    names.length,
  )
})

const blocked = computed(() => {
  const key = blockKey(data.value?.blockedBy)

  return t(`ingredients.merge.${key ?? 'blockedOther'}`, { name: props.absorbed.name })
})

const busy = computed(() => preview.isFetching.value || merge.isPending.value)

// Ces refus-là sont dits par l'aperçu relu : pas de phrase de plus
const EXPLAINED_BY_PREVIEW = new Set([
  'MERGE_UNIT_MISSING',
  'INGREDIENT_IN_SENT_LIST',
  'INGREDIENT_USED_BY_ANOTHER_USER',
  'CANNOT_MERGE_INTO_ITSELF',
  'CANNOT_MERGE_COMMON_INGREDIENT',
])

function confirm() {
  failure.value = null
  merge.mutate(
    { slug: props.absorbed.slug, into: props.kept.slug },
    {
      onSuccess: () => {
        const departmentSlug = data.value?.keep.departmentSlug ?? ''
        notifications.push('success', t('ingredients.merge.done', { name: props.kept.name }))
        open.value = false
        emit('merged', departmentSlug)
      },
      onError: (error) => {
        if (isGone(error)) return leave()
        void preview.refetch()
        if (!(error instanceof ApiError)) failure.value = t('ingredients.merge.failed')
        else if (error.message === 'INGREDIENT_MERGE_CONFLICT')
          failure.value = t('ingredients.merge.conflict')
        else if (EXPLAINED_BY_PREVIEW.has(error.message)) failure.value = null
        else if (error.status === 0 || error.status === 429)
          failure.value = messageForFailure(error)
        else failure.value = t('ingredients.merge.failed')
      },
    },
  )
}
</script>

<template>
  <UiSheet v-model:open="open" :title="title">
    <p v-if="loading" class="text-muted" role="status">{{ t('ingredients.merge.loading') }}</p>

    <template v-else-if="previewFailed">
      <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft">
        {{ t('ingredients.merge.previewFailed') }}
      </p>
      <div class="flex flex-col gap-2.5">
        <UiButton class="min-h-12" @click="preview.refetch()">{{
          t('ingredients.merge.retry')
        }}</UiButton>
        <UiButton variant="ghost" class="min-h-12" @click="open = false">{{
          t('ingredients.merge.cancel')
        }}</UiButton>
      </div>
    </template>

    <template v-else-if="kind === 'unit'">
      <p class="text-[15px]" data-testid="merge-unit-missing">{{ missing }}</p>
      <div class="flex flex-col gap-2.5">
        <UiLinkButton
          :to="{ name: 'ingredient-edit', params: { slug: kept.slug } }"
          class="min-h-12"
          @click="open = false"
        >
          {{ t('ingredients.merge.editKept', { name: kept.name }) }}
        </UiLinkButton>
        <UiButton variant="ghost" class="min-h-12" @click="open = false">{{
          t('ingredients.merge.cancel')
        }}</UiButton>
      </div>
    </template>

    <template v-else-if="kind === 'blocked'">
      <p class="text-[15px]" data-testid="merge-blocked">{{ blocked }}</p>
      <UiButton class="min-h-12" @click="open = false">{{
        t('ingredients.merge.understood')
      }}</UiButton>
    </template>

    <template v-else-if="kind === 'ok'">
      <ul class="flex flex-col gap-3" data-testid="merge-effects">
        <li class="flex items-start gap-3">
          <Check class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>{{ uses }}</span>
        </li>
        <li class="flex items-start gap-3">
          <Check class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>{{ quantities }}</span>
        </li>
        <li class="flex items-start gap-3">
          <CircleAlert class="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
          <span>{{ t('ingredients.merge.removed', { name: absorbed.name }) }}</span>
        </li>
      </ul>

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <div class="flex flex-col gap-2.5">
        <UiButton class="min-h-12" :disabled="busy" @click="confirm">{{
          t('ingredients.merge.confirm')
        }}</UiButton>
        <UiButton variant="ghost" class="min-h-12" @click="open = false">{{
          t('ingredients.merge.cancel')
        }}</UiButton>
      </div>
    </template>
  </UiSheet>
</template>
