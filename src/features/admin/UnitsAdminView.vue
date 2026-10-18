<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Dimension } from '@/api'
import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiSelect from '@/design/UiSelect.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useUnits } from '@/features/ingredients/queries'
import { messageForFailure } from '@/notifications/failures'
import AdminFormDialog from './AdminFormDialog.vue'
import AdminPage from './AdminPage.vue'
import { useSaveUnit } from './queries'
import { useResourceDialog } from './useResourceDialog'

const { t } = useI18n()

// Les dimensions viennent du contrat : une valeur ajoutée ou retirée côté back casse la compilation ici.
const DIMENSIONS = Object.keys({
  WEIGHT: true,
  VOLUME: true,
  COUNT: true,
  PACKAGE: true,
} satisfies Record<Dimension, true>) as Dimension[]

const units = useUnits()
const save = useSaveUnit()
const items = computed(() => units.data.value?.member ?? [])

const dialog = useResourceDialog(() => ({
  name: '',
  symbol: '',
  // '' : aucune dimension (cuillère, tranche…)
  dimension: '' as Dimension | '',
  baseFactor: '' as string | number,
}))

/** Le facteur saisi : `null` s'il est vide, sinon le nombre (qui peut ne pas être valide, c'est `errors` qui le dit). */
const factor = computed(() =>
  dialog.form.baseFactor === '' ? null : Number(dialog.form.baseFactor),
)
const errors = computed(() => ({
  name:
    dialog.submitted.value && dialog.form.name.trim() === '' ? t('admin.errors.name') : undefined,
  // Seul le format est vérifié ici : une dimension sans facteur (ou l'inverse) est refusée par le back, qui garde la règle
  baseFactor:
    dialog.submitted.value && factor.value !== null && !(factor.value > 0)
      ? t('admin.errors.baseFactor')
      : undefined,
}))

/** « Poids, × 1000 » : ce que l'unité mesure et son facteur ; rien pour une unité sans dimension. */
const measureOf = (unit: { dimension?: Dimension | null; baseFactor?: number | null }) =>
  unit.dimension == null
    ? null
    : t('admin.unitMeasure', {
        dimension: t(`admin.dimensions.${unit.dimension}`),
        factor: unit.baseFactor ?? '?',
      })

function submit() {
  dialog.submitted.value = true
  dialog.error.value = null
  if (errors.value.name || errors.value.baseFactor) return

  save.mutate(
    {
      slug: dialog.editing.value,
      // Toujours les deux : un corps qui en mentionne un remplace la paire, `null` et `null` l'efface
      form: {
        name: dialog.form.name.trim(),
        symbol: dialog.form.symbol.trim(),
        dimension: dialog.form.dimension === '' ? null : dialog.form.dimension,
        baseFactor: factor.value,
      },
    },
    {
      onSuccess: () => (dialog.open.value = false),
      onError: (error) => (dialog.error.value = messageForFailure(error)),
    },
  )
}
</script>

<template>
  <AdminPage
    :title="t('admin.units')"
    :loading="units.isPending.value"
    :failed="hasFailed(units)"
    :create-label="t('admin.newUnit')"
    @create="dialog.create"
  >
    <p v-if="items.length === 0" class="text-muted">{{ t('admin.none') }}</p>
    <ul
      v-else
      class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
    >
      <li v-for="unit in items" :key="unit.slug" class="flex min-h-14 items-center gap-3">
        <span class="min-w-0 flex-1">
          <span class="block font-medium">{{ unit.name }}</span>
          <span v-if="measureOf(unit)" class="block text-sm text-muted">{{ measureOf(unit) }}</span>
        </span>
        <span class="text-sm text-muted">{{ unit.symbol === '' ? '—' : unit.symbol }}</span>
        <UiButton
          variant="ghost"
          :aria-label="t('admin.editNamed', { name: unit.name })"
          @click="
            dialog.edit(unit.slug, {
              name: unit.name,
              symbol: unit.symbol,
              dimension: unit.dimension ?? '',
              baseFactor: unit.baseFactor ?? '',
            })
          "
        >
          {{ t('admin.edit') }}
        </UiButton>
      </li>
    </ul>
  </AdminPage>

  <AdminFormDialog
    v-model:open="dialog.open.value"
    :title="dialog.editing.value ? t('admin.editUnit') : t('admin.newUnit')"
    :pending="save.isPending.value"
    :error="dialog.error.value"
    @submit="submit"
  >
    <UiField :label="t('admin.name')" :error="errors.name" v-slot="{ id, describedby, invalid }">
      <UiTextInput
        :id="id"
        v-model="dialog.form.name"
        autocomplete="off"
        :aria-describedby="describedby"
        :invalid="invalid"
      />
    </UiField>
    <UiField :label="t('admin.symbol')" :hint="t('admin.symbolHint')" v-slot="{ id, describedby }">
      <UiTextInput
        :id="id"
        v-model="dialog.form.symbol"
        autocomplete="off"
        :aria-describedby="describedby"
      />
    </UiField>
    <UiField
      :label="t('admin.dimension')"
      :hint="t('admin.dimensionHint')"
      v-slot="{ id, describedby }"
    >
      <UiSelect :id="id" v-model="dialog.form.dimension" :aria-describedby="describedby">
        <option value="">{{ t('admin.noDimension') }}</option>
        <option v-for="dimension in DIMENSIONS" :key="dimension" :value="dimension">
          {{ t(`admin.dimensions.${dimension}`) }}
        </option>
      </UiSelect>
    </UiField>
    <UiField
      :label="t('admin.baseFactor')"
      :hint="t('admin.baseFactorHint')"
      :error="errors.baseFactor"
      v-slot="{ id, describedby, invalid }"
    >
      <UiTextInput
        :id="id"
        v-model="dialog.form.baseFactor"
        type="number"
        inputmode="decimal"
        min="0"
        step="any"
        :aria-describedby="describedby"
        :invalid="invalid"
      />
    </UiField>
  </AdminFormDialog>
</template>
