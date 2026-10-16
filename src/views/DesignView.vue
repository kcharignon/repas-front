<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CookingPot, IceCreamCone, Salad } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import UiCheckbox from '@/design/UiCheckbox.vue'
import UiChip from '@/design/UiChip.vue'
import UiField from '@/design/UiField.vue'
import UiProgressBar from '@/design/UiProgressBar.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import UiTile from '@/design/UiTile.vue'
import { useThemeStore } from '@/design/theme'

const { t } = useI18n()
const theme = useThemeStore()

const ingredient = ref(t('design.ingredientSample'))
const quantity = ref('-2')
const toTake = ref(false)
const inBasket = ref(true)
const dish = ref(true)
const dessert = ref(false)
const tile = ref('dish')
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8">
    <header class="flex flex-col gap-2">
      <h1 class="font-display text-4xl font-bold leading-tight">{{ t('design.title') }}</h1>
      <p class="text-muted">{{ t('design.intro') }}</p>
      <div role="group" :aria-label="t('theme.label')" class="mt-2 flex flex-wrap gap-2">
        <UiChip
          v-for="preference in theme.preferences"
          :key="preference"
          :pressed="theme.preference === preference"
          @update:pressed="theme.preference = preference"
        >
          {{ t(`theme.${preference}`) }}
        </UiChip>
      </div>
    </header>

    <section class="flex flex-col gap-4">
      <h2 class="font-display text-2xl font-bold">{{ t('design.buttons') }}</h2>
      <div class="flex flex-wrap items-center gap-3">
        <UiButton>{{ t('design.save') }}</UiButton>
        <UiButton variant="secondary">{{ t('design.addToList') }}</UiButton>
        <UiButton variant="accent">{{ t('design.newRecipe') }}</UiButton>
        <UiButton variant="ghost">{{ t('design.cancel') }}</UiButton>
        <UiButton variant="danger">{{ t('design.remove') }}</UiButton>
      </div>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="font-display text-2xl font-bold">{{ t('design.fields') }}</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <UiField :label="t('design.ingredient')" v-slot="{ id, describedby, invalid }">
          <UiTextInput
            :id="id"
            v-model="ingredient"
            :aria-describedby="describedby"
            :invalid="invalid"
          />
        </UiField>
        <UiField
          :label="t('design.quantity')"
          :hint="t('design.quantityHint')"
          :error="t('design.quantityError')"
          v-slot="{ id, describedby, invalid }"
        >
          <UiTextInput
            :id="id"
            v-model="quantity"
            :aria-describedby="describedby"
            :invalid="invalid"
          />
        </UiField>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="font-display text-2xl font-bold">{{ t('design.choices') }}</h2>
      <div class="flex flex-wrap gap-2">
        <UiChip v-model:pressed="dish">{{ t('design.dish') }}</UiChip>
        <UiChip v-model:pressed="dessert">{{ t('design.dessert') }}</UiChip>
      </div>
      <div role="group" :aria-label="t('design.tiles')" class="grid max-w-sm grid-cols-3 gap-1.5">
        <UiTile :pressed="tile === 'starter'" @update:pressed="tile = 'starter'">
          <template #icon><Salad class="size-8 text-primary" aria-hidden="true" /></template>
          {{ t('design.starter') }}
        </UiTile>
        <UiTile :pressed="tile === 'dish'" @update:pressed="tile = 'dish'">
          <template #icon><CookingPot class="size-8 text-primary" aria-hidden="true" /></template>
          {{ t('design.dish') }}
        </UiTile>
        <UiTile :pressed="tile === 'dessert'" @update:pressed="tile = 'dessert'">
          <template #icon><IceCreamCone class="size-8 text-primary" aria-hidden="true" /></template>
          {{ t('design.dessert') }}
        </UiTile>
      </div>
      <div class="rounded-2xl border border-line bg-surface px-4">
        <UiCheckbox v-model="toTake">{{ t('design.toTake') }}</UiCheckbox>
        <UiCheckbox v-model="inBasket">{{ t('design.inBasket') }}</UiCheckbox>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="font-display text-2xl font-bold">{{ t('design.progress') }}</h2>
      <UiProgressBar
        :value="4"
        :max="11"
        :label="t('design.progressLabel', { done: 4, total: 11 })"
      />
    </section>
  </main>
</template>
