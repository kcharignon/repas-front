<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, X } from 'lucide-vue-next'

import type { Ingredient, IngredientPart } from '@/api'
import UiButton from '@/design/UiButton.vue'
import { messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import PartRatioSheet from './PartRatioSheet.vue'
import PartSheet from './PartSheet.vue'
import { ratioLine } from './partsText'
import { useRemoveIngredientParent } from './queries'

/**
 * « Ses parties » (SUB-007, ADR 0038 du back) : sur la fiche d'un ingrédient ENTIER à soi, les parties qui comptent dans ses quantités
 * (un jaune et un blanc comptent dans l'œuf). Une carte par partie (« 1 œuf = 1 jaune d'œuf »), toucher la carte change le nombre,
 * la croix détache la partie ; « Ajouter une partie » ouvre la feuille. Les écritures sont immédiates (elles ne passent pas par
 * « Enregistrer » de la fiche). Montrée pour un ingrédient qui n'est pas lui-même une partie (profondeur 1).
 */
const props = defineProps<{ ingredient: Ingredient }>()

/** Le plafond du back : dix parties par ingrédient. */
const MAX_PARTS = 10

const { t } = useI18n()
const notifications = useNotificationsStore()
const detach = useRemoveIngredientParent()

const parts = computed(() => props.ingredient.parts ?? [])
const atLimit = computed(() => parts.value.length >= MAX_PARTS)
const parent = computed(() => ({
  name: props.ingredient.name,
  unitName: props.ingredient.cookingUnitName,
}))
const line = (part: IngredientPart) => ratioLine(parent.value, part)

const adding = ref(false)
const changing = ref<IngredientPart | null>(null)
const changingOpen = computed({
  get: () => changing.value !== null,
  set: (value) => {
    if (!value) changing.value = null
  },
})
const failure = ref<string | null>(null)
const addButton = ref<InstanceType<typeof UiButton> | null>(null)
const section = ref<HTMLElement | null>(null)

// Une carte qui disparaît emporte son bouton : le focus va au bouton d'ajout (ou, au plafond, à la section), pas sur la page
async function focusAfterChange() {
  await nextTick()
  const target = addButton.value?.$el ?? section.value
  target?.focus()
}

function remove(part: IngredientPart) {
  failure.value = null
  detach.mutate(
    { slug: part.slug },
    {
      onSuccess: () => {
        notifications.push('success', t('ingredients.parts.detached', { name: part.name }))
        void focusAfterChange()
      },
      onError: (error) => {
        failure.value = messageForFailure(error)
      },
    },
  )
}
</script>

<template>
  <section
    ref="section"
    tabindex="-1"
    class="flex flex-col gap-3 focus:outline-none"
    :aria-label="t('ingredients.parts.title')"
  >
    <h2 class="font-display text-2xl font-bold">{{ t('ingredients.parts.title') }}</h2>

    <div class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <p v-if="parts.length === 0" class="text-[15px] leading-snug text-muted">
        {{ t('ingredients.parts.empty', { name: ingredient.name }) }}
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="part in parts"
          :key="part.slug"
          :data-part="part.slug"
          class="flex items-center gap-1 rounded-2xl bg-soft py-1 pr-1 pl-3.5"
        >
          <button
            type="button"
            class="flex min-h-14 min-w-0 flex-1 cursor-pointer flex-col justify-center rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            @click="changing = part"
          >
            <span class="text-[17px] font-bold [overflow-wrap:anywhere]">{{ part.name }}</span>
            <span class="text-sm text-muted">{{ line(part) }}</span>
            <!-- Le nom accessible garde le texte visible, puis dit ce que fait la carte (étiquette-dans-le-nom, WCAG 2.5.3) -->
            <span class="sr-only">{{ t('ingredients.parts.change') }}</span>
          </button>
          <UiButton
            variant="ghost"
            size="icon"
            :aria-label="t('ingredients.parts.detachNamed', { name: part.name })"
            :disabled="detach.isPending.value"
            @click="remove(part)"
          >
            <X class="size-5" aria-hidden="true" />
          </UiButton>
        </li>
      </ul>

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <p v-if="atLimit" class="text-[15px] text-muted">{{ t('ingredients.parts.errors.limit') }}</p>
      <UiButton v-else ref="addButton" variant="secondary" class="min-h-12" @click="adding = true">
        <Plus class="size-5" aria-hidden="true" />
        {{ t('ingredients.parts.add') }}
      </UiButton>
    </div>

    <PartSheet v-model:open="adding" :parent="ingredient" />
    <PartRatioSheet v-model:open="changingOpen" :parent="ingredient" :part="changing" />
  </section>
</template>
