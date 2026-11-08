<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Ingredient, IngredientPart } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiSheet from '@/design/UiSheet.vue'
import { messageForFailure } from '@/notifications/failures'
import PartAmountField from './PartAmountField.vue'
import { amountSuffix, oneOf, parseRatio } from './partsText'
import { inputNumber } from './equationMath'
import { useSetIngredientParent } from './queries'

/**
 * Changer le nombre d'une partie (« 1 œuf = 1 jaune d'œuf » devient 2) : la même écriture que l'ajout, sur la partie et le parent qui
 * existent déjà. Le même nombre n'écrit rien.
 */
const props = defineProps<{ parent: Ingredient; part: IngredientPart | null }>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ saved: [] }>()

const { t } = useI18n()
const link = useSetIngredientParent()

const ratio = ref('1')
const submitted = ref(false)
const failure = ref<string | null>(null)

watch(open, (value) => {
  if (!value) return
  ratio.value = props.part === null ? '1' : inputNumber(props.part.ratio)
  submitted.value = false
  failure.value = null
})

const value = computed(() => parseRatio(ratio.value))
const one = computed(() => oneOf(props.parent.name, props.parent.cookingUnitName))
const suffix = computed(() =>
  props.part === null ? '' : amountSuffix(props.part.name, props.part.unitName, value.value),
)
const error = computed(() =>
  submitted.value && value.value === null ? t('ingredients.parts.errors.number') : undefined,
)

function submit() {
  submitted.value = true
  failure.value = null
  const part = props.part
  const ratioValue = value.value
  if (part === null || ratioValue === null) return
  if (ratioValue === part.ratio) {
    open.value = false

    return
  }

  link.mutate(
    { slug: part.slug, parent: props.parent.slug, ratio: ratioValue },
    {
      onSuccess: () => {
        open.value = false
        emit('saved')
      },
      onError: (cause) => {
        failure.value = messageForFailure(cause)
      },
    },
  )
}
</script>

<template>
  <UiSheet v-model:open="open" :title="part?.name ?? ''">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <PartAmountField
        v-model="ratio"
        :label="t('ingredients.parts.how', { one })"
        :suffix="suffix"
        :error="error"
      />

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <div class="flex flex-wrap justify-end gap-2">
        <UiButton variant="ghost" @click="open = false">{{ t('common.cancel') }}</UiButton>
        <UiButton type="submit" :disabled="link.isPending.value">{{ t('common.save') }}</UiButton>
      </div>
    </form>
  </UiSheet>
</template>
