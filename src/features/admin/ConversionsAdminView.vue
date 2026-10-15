<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiCombobox from '@/design/UiCombobox.vue'
import UiField from '@/design/UiField.vue'
import UiSelect from '@/design/UiSelect.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useUnits } from '@/features/ingredients/queries'
import { useIngredientOptions } from '@/features/recipes/queries'
import { messageForFailure } from '@/notifications/failures'
import AdminFormDialog from './AdminFormDialog.vue'
import AdminPage from './AdminPage.vue'
import { useConversions, useSaveConversion } from './queries'
import { useResourceDialog } from './useResourceDialog'

const { t } = useI18n()

// La valeur « all » du choix d'ingrédient veut dire : conversion commune à tous les ingrédients (`ingredientSlug: null`).
const ALL = 'all'

const conversions = useConversions()
const units = useUnits()
const ingredients = useIngredientOptions()
const save = useSaveConversion()

const items = computed(() => conversions.data.value?.member ?? [])
const unitList = computed(() => units.data.value?.member ?? [])
const options = computed(() => [
  { value: ALL, label: t('admin.allIngredients') },
  ...(ingredients.data.value?.member ?? []).map((ingredient) => ({
    value: ingredient.slug,
    label: ingredient.name,
  })),
])

const dialog = useResourceDialog(() => ({
  start: '',
  end: '',
  coefficient: '' as string | number,
  ingredient: ALL,
}))

const errors = computed(() => ({
  units:
    dialog.submitted.value && dialog.form.start !== '' && dialog.form.start === dialog.form.end
      ? t('admin.errors.sameUnit')
      : undefined,
  coefficient:
    dialog.submitted.value && !(Number(dialog.form.coefficient) > 0)
      ? t('admin.errors.coefficient')
      : undefined,
}))

function openCreate() {
  dialog.create()
  dialog.form.start = unitList.value[0]?.slug ?? ''
  dialog.form.end = unitList.value[1]?.slug ?? unitList.value[0]?.slug ?? ''
}

function submit() {
  dialog.submitted.value = true
  dialog.error.value = null
  if (errors.value.units || errors.value.coefficient) return

  save.mutate(
    {
      id: dialog.editing.value,
      form: {
        startUnitSlug: dialog.form.start,
        endUnitSlug: dialog.form.end,
        coefficient: Number(dialog.form.coefficient),
        ingredientSlug: dialog.form.ingredient === ALL ? null : dialog.form.ingredient,
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
    :title="t('admin.conversions')"
    :loading="conversions.isPending.value"
    :failed="conversions.isError.value"
    :create-label="t('admin.newConversion')"
    @create="openCreate"
  >
    <p v-if="items.length === 0" class="text-muted">{{ t('admin.none') }}</p>
    <ul
      v-else
      class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4"
    >
      <li
        v-for="conversion in items"
        :key="conversion.id"
        class="flex min-h-16 flex-wrap items-center gap-3 py-2"
      >
        <span class="min-w-0 flex-1">
          <span class="block font-medium">
            {{
              t('admin.conversionLine', {
                start: conversion.startUnitName,
                coefficient: conversion.coefficient,
                end: conversion.endUnitName,
              })
            }}
          </span>
          <span class="block text-sm text-muted">{{
            conversion.ingredientName ?? t('admin.allIngredients')
          }}</span>
        </span>
        <UiButton
          variant="ghost"
          :aria-label="
            t('admin.editNamed', {
              name: `${conversion.startUnitName} → ${conversion.endUnitName}`,
            })
          "
          @click="
            dialog.edit(conversion.id, {
              start: conversion.startUnitSlug,
              end: conversion.endUnitSlug,
              coefficient: conversion.coefficient,
              ingredient: conversion.ingredientSlug ?? ALL,
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
    :title="dialog.editing.value ? t('admin.editConversion') : t('admin.newConversion')"
    :pending="save.isPending.value"
    :error="dialog.error.value"
    @submit="submit"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <UiField :label="t('admin.startUnit')" v-slot="{ id }">
        <UiSelect :id="id" v-model="dialog.form.start">
          <option v-for="unit in unitList" :key="unit.slug" :value="unit.slug">
            {{ unit.name }}
          </option>
        </UiSelect>
      </UiField>
      <UiField
        :label="t('admin.endUnit')"
        :error="errors.units"
        v-slot="{ id, describedby, invalid }"
      >
        <UiSelect
          :id="id"
          v-model="dialog.form.end"
          :aria-describedby="describedby"
          :invalid="invalid"
        >
          <option v-for="unit in unitList" :key="unit.slug" :value="unit.slug">
            {{ unit.name }}
          </option>
        </UiSelect>
      </UiField>
    </div>
    <UiField
      :label="t('admin.coefficient')"
      :hint="t('admin.coefficientHint')"
      :error="errors.coefficient"
      v-slot="{ id, describedby, invalid }"
    >
      <UiTextInput
        :id="id"
        v-model="dialog.form.coefficient"
        type="number"
        inputmode="decimal"
        min="0"
        step="any"
        :aria-describedby="describedby"
        :invalid="invalid"
      />
    </UiField>
    <div class="flex flex-col gap-1.5">
      <span class="text-sm font-semibold">{{ t('admin.ingredient') }}</span>
      <UiCombobox
        v-model="dialog.form.ingredient"
        :options="options"
        :label="t('admin.ingredient')"
        :placeholder="t('admin.allIngredients')"
        :empty="t('editor.noIngredient')"
      />
    </div>
  </AdminFormDialog>
</template>
