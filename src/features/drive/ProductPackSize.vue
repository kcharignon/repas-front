<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { pluralOf, parsePackValue } from '@drive-protocol'

import type { DriveChoiceProduct } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { isStale, messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useQueryClient } from '@tanstack/vue-query'
import { packSizeCorrection } from './choices'
import { useCorrectPackSize } from './choicesQueries'
import { packSizeLabel } from './productFormat'

/**
 * La contenance d'un produit accepté dans l'unité de la liste (DRV-652) : « Contenu : 20 tranches », corrigeable sur place, pour qu'une réponse
 * erronée ne fausse pas les quantités pour toujours. Elle n'apparaît que pour un produit dont la personne a donné la contenance pendant un envoi
 * (c'est de là que vient l'unité) : rien à régler ici avant. La correction passe par \`PUT /drive/choices\` et ne touche à rien d'autre.
 */
const props = defineProps<{
  ingredientSlug: string
  /** Le produit tel que Repas l'a ENREGISTRÉ (pas le brouillon d'ordre en cours). */
  product: DriveChoiceProduct
  storeId: string
  /** Le nom des unités de Repas par slug, au singulier. */
  unitNames: ReadonlyMap<string, string>
  disabled: boolean
}>()

const { t } = useI18n()
const notifications = useNotificationsStore()
const queryClient = useQueryClient()
const correct = useCorrectPackSize()

const size = computed(() => props.product.packSize ?? null)
const sizeText = computed(() =>
  size.value === null ? '' : packSizeLabel(size.value, props.unitNames),
)
const unitWord = computed(() => {
  const slug = size.value?.unitSlug ?? ''
  const name = props.unitNames.get(slug) ?? slug.replace(/-/g, ' ')

  return pluralOf(name.toLowerCase())
})

const editing = ref(false)
const typed = ref('')
const failure = ref<string | null>(null)
const parsed = computed(() => parsePackValue(typed.value))
const changed = computed(() => parsed.value !== null && parsed.value !== size.value?.value)
const invalid = computed(() => typed.value.trim() !== '' && parsed.value === null)
const form = ref<HTMLFormElement | null>(null)

async function open() {
  typed.value = String(size.value?.value ?? '').replace('.', ',')
  failure.value = null
  editing.value = true
  await nextTick()
  form.value?.querySelector('input')?.focus()
}

function close() {
  editing.value = false
  failure.value = null
}

async function save() {
  const intent = packSizeCorrection(props.ingredientSlug, props.product, {
    value: parsed.value,
    unitSlug: size.value?.unitSlug,
  })
  if (intent === null) return
  failure.value = null
  try {
    await correct.mutateAsync({ storeId: props.storeId, intent })
  } catch (error) {
    failure.value = messageForFailure(error)
    if (isStale(error)) void queryClient.invalidateQueries({ queryKey: ['drive'] })

    return
  }
  editing.value = false
  notifications.push('success', t('driveProducts.packSizeSaved'))
}
</script>

<template>
  <div v-if="size !== null" class="flex flex-col gap-2" data-testid="pack-size">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p class="text-sm text-muted">{{ t('driveProducts.packSize', { size: sizeText }) }}</p>
      <UiButton v-if="!editing" variant="ghost" :disabled="disabled" @click="open">
        {{ t('driveProducts.packSizeFix') }}<span class="sr-only"> {{ product.label }}</span>
      </UiButton>
    </div>
    <form v-if="editing" ref="form" class="flex flex-col gap-2" novalidate @submit.prevent="save">
      <UiField
        :label="t('driveProducts.packSizeQuestion', { units: unitWord })"
        :error="invalid ? t('driveProducts.packSizeInvalid') : failure"
      >
        <template #default="{ id, describedby, invalid: wrong }">
          <UiTextInput
            :id="id"
            v-model="typed"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            :aria-describedby="describedby"
            :invalid="wrong"
          />
        </template>
      </UiField>
      <div class="flex flex-wrap gap-2">
        <UiButton type="submit" :disabled="disabled || !changed || correct.isPending.value">{{
          t('driveProducts.packSizeSave')
        }}</UiButton>
        <UiButton
          variant="ghost"
          class="border-[1.5px] border-line"
          :disabled="correct.isPending.value"
          @click="close"
          >{{ t('driveProducts.packSizeCancel') }}</UiButton
        >
      </div>
    </form>
  </div>
</template>
