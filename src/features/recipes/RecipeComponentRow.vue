<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowUpRight, Minus, Plus, TriangleAlert } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import { lowerFirst } from '@/design/lowerFirst'
import SecretBadge from './SecretBadge.vue'
import {
  canLessTimes,
  canMoreTimes,
  formatTimes,
  nextTimes,
  parseTimes,
  previousTimes,
  timesHelp,
} from './componentsText'

/** Une recette utilisée dans le formulaire (COMP-006) : le nombre de fois reste le texte tapé, jusqu'à l'envoi. */
export interface EditableComponent {
  key: number
  recipeId: string
  name: string
  serving: number
  secret: boolean
  times: string
  /** Le premier ingrédient de cette recette qui ne se convertit pas en son unité d'achat (une recette lue seulement), sinon `null`. */
  missingIngredient: string | null
}

const component = defineModel<EditableComponent>({ required: true })

const props = defineProps<{
  /** L'enregistrement a été tenté : un nombre invalide est dit même si le champ n'a pas été quitté. */
  submitted: boolean
}>()

const emit = defineEmits<{ remove: [] }>()

const { t } = useI18n()
const router = useRouter()

const value = computed(() => parseTimes(component.value.times))
const blurred = ref(false)
const invalid = computed(() => value.value === null)
const showInvalid = computed(() => invalid.value && (blurred.value || props.submitted))
const help = computed(() => timesHelp(value.value, component.value.name))
// La recette utilisée s'ouvre à part : on ne quitte pas le formulaire (le travail en cours serait perdu)
const href = computed(
  () => router.resolve({ name: 'recipe', params: { id: component.value.recipeId } }).href,
)

function setTimes(times: string) {
  component.value = { ...component.value, times }
}

function less() {
  if (value.value !== null) setTimes(formatTimes(previousTimes(value.value)))
}

function more() {
  setTimes(formatTimes(nextTimes(value.value)))
}

// En quittant le champ, un nombre valide est réécrit comme on le lit (« 1.50 » devient « 1,5 »)
function leave() {
  blurred.value = true
  if (value.value !== null) setTimes(formatTimes(value.value))
}
</script>

<template>
  <li
    data-component
    :class="[
      'flex flex-col gap-2.5 rounded-2xl border bg-surface py-3 pr-3 pl-4 md:flex-row md:flex-wrap md:items-center md:gap-x-4',
      showInvalid ? 'border-danger' : 'border-line',
    ]"
  >
    <div class="flex min-w-0 flex-col gap-1 md:flex-1">
      <a
        :href="href"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1.5 self-start text-[17px] font-bold [overflow-wrap:anywhere] text-primary underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >{{ component.name }}<ArrowUpRight class="size-4 shrink-0" aria-hidden="true"
      /></a>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-muted">{{
          t('recipes.forPeople', { count: component.serving }, component.serving)
        }}</span>
        <SecretBadge v-if="component.secret" />
      </div>
      <p v-if="help" data-times-help class="text-sm text-muted">{{ help }}</p>
    </div>

    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          :aria-label="t('recipes.components.less', { name: component.name })"
          :disabled="!canLessTimes(value)"
          class="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-line bg-surface text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-40"
          @click="less"
        >
          <Minus class="size-5" aria-hidden="true" />
        </button>
        <input
          :value="component.times"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          maxlength="7"
          :aria-label="t('recipes.components.timesField', { name: component.name })"
          :aria-invalid="showInvalid ? 'true' : undefined"
          :class="[
            'min-h-12 w-[68px] rounded-xl border-[1.5px] bg-surface px-1 text-center text-[17px] font-bold text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            showInvalid ? 'border-2 border-danger' : 'border-line',
          ]"
          @input="setTimes(($event.target as HTMLInputElement).value)"
          @blur="leave"
        />
        <button
          type="button"
          :aria-label="t('recipes.components.more', { name: component.name })"
          :disabled="!canMoreTimes(value)"
          class="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-line bg-surface text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-40"
          @click="more"
        >
          <Plus class="size-5" aria-hidden="true" />
        </button>
        <span class="ml-0.5 text-muted">{{ t('recipes.components.times') }}</span>
      </div>
      <UiButton
        variant="ghost"
        class="px-3"
        :aria-label="t('recipes.components.removeNamed', { name: component.name })"
        @click="emit('remove')"
        >{{ t('recipes.components.remove') }}</UiButton
      >
    </div>

    <p v-if="showInvalid" role="alert" class="text-sm font-semibold text-danger md:basis-full">
      {{ t('recipes.components.invalid') }}
    </p>

    <!-- Une ligne de cette recette ne se convertit pas : la planifier échouera. On la règle dans la recette utilisée, ouverte à part -->
    <div
      v-if="component.missingIngredient !== null"
      data-component-missing
      class="flex flex-col gap-1.5 rounded-xl bg-warning-soft px-3 py-2.5 text-sm font-semibold text-on-warning-soft md:basis-full"
    >
      <p class="flex items-start gap-2">
        <TriangleAlert class="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
        <span>{{
          t('recipes.components.missingConversion', {
            ingredient: lowerFirst(component.missingIngredient),
            name: component.name,
          })
        }}</span>
      </p>
      <a
        :href="href"
        target="_blank"
        rel="noopener"
        class="inline-flex min-h-11 cursor-pointer items-center self-start rounded-xl border-[1.5px] border-primary bg-surface px-4 text-base font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >{{ t('recipes.components.open', { name: component.name }) }}</a
      >
    </div>
  </li>
</template>
