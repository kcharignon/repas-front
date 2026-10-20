<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Circle, CircleCheck } from 'lucide-vue-next'

import type { DuplicatePair, DuplicateSide } from '@/api'
import UiButton from '@/design/UiButton.vue'
import { effectSentence, levelOf, sidesOf, usageText } from './mergeText'

const props = defineProps<{
  pair: DuplicatePair
  /** La carte ouverte : une seule à la fois, les autres sont repliées sur « Voir et fusionner ». */
  open: boolean
  /** L'ingrédient à garder choisi par l'utilisateur ; sans choix, la suggestion du back. */
  keep?: string
  busy?: boolean
}>()

const emit = defineEmits<{
  open: []
  'update:keep': [slug: string]
  merge: [absorbed: DuplicateSide, kept: DuplicateSide]
  distinct: []
}>()

const { t } = useI18n()

const sides = computed(() => sidesOf(props.pair, props.keep))
const name = computed(() => `radio-${props.pair.first.slug}-${props.pair.second.slug}`)
const rows = computed(() => [props.pair.first, props.pair.second])
const effect = computed(() => effectSentence(t, sides.value.absorbed, sides.value.kept))
const level = computed(() => levelOf(props.pair))
</script>

<template>
  <li
    class="rounded-2xl border border-line bg-surface p-4"
    data-testid="duplicate-card"
    :data-level="level"
  >
    <template v-if="open">
      <fieldset class="flex flex-col gap-2">
        <legend class="sr-only">{{ t('ingredients.duplicates.keepGroup') }}</legend>
        <label
          v-for="side in rows"
          :key="side.slug"
          class="relative flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line px-3.5 py-2 has-[:checked]:border-primary has-[:checked]:bg-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
        >
          <input
            type="radio"
            :name="name"
            :value="side.slug"
            :checked="sides.kept.slug === side.slug"
            class="peer sr-only"
            @change="emit('update:keep', side.slug)"
          />
          <CircleCheck
            v-if="sides.kept.slug === side.slug"
            class="size-6 shrink-0 text-primary"
            aria-hidden="true"
          />
          <Circle v-else class="size-6 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block text-[17px] font-semibold">{{ side.name }}</span>
            <span class="block text-sm text-muted">{{
              usageText(t, side) || t('ingredients.merge.usedNowhere')
            }}</span>
          </span>
          <span
            v-if="sides.kept.slug === side.slug"
            class="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-on-primary"
            >{{ t('ingredients.duplicates.keep') }}</span
          >
        </label>
      </fieldset>

      <p class="mt-3 text-[15px]" aria-live="polite" data-testid="duplicate-effect">
        {{ effect }}
      </p>

      <div class="mt-3 flex flex-wrap gap-2.5">
        <UiButton
          class="min-h-12 flex-1"
          :aria-label="
            t('ingredients.duplicates.mergeNamed', {
              absorbed: sides.absorbed.name,
              kept: sides.kept.name,
            })
          "
          @click="emit('merge', sides.absorbed, sides.kept)"
        >
          {{ t('ingredients.duplicates.merge') }}
        </UiButton>
        <UiButton
          variant="secondary"
          class="min-h-12"
          :disabled="busy"
          :aria-label="
            t('ingredients.duplicates.distinctNamed', {
              first: pair.first.name,
              second: pair.second.name,
            })
          "
          @click="emit('distinct')"
        >
          {{ t('ingredients.duplicates.distinct') }}
        </UiButton>
      </div>
    </template>

    <template v-else>
      <p class="text-[17px] font-semibold">
        {{ t('ingredients.duplicates.pair', { first: pair.first.name, second: pair.second.name }) }}
      </p>
      <UiButton
        variant="secondary"
        class="mt-3 w-full"
        :aria-label="
          t('ingredients.duplicates.openNamed', {
            first: pair.first.name,
            second: pair.second.name,
          })
        "
        @click="emit('open')"
      >
        {{ t('ingredients.duplicates.open') }}
      </UiButton>
    </template>
  </li>
</template>
