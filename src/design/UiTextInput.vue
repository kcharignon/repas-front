<script setup lang="ts">
import { capitalizeFirst as withInitial } from './capitalizeFirst'
import { cn } from './cn'

const model = defineModel<string | number>({ default: '' })

const props = defineProps<{
  invalid?: boolean
  /**
   * Champ « nom » d'une recette ou d'un ingrédient : la première lettre passe en majuscule dès qu'elle est tapée ou collée, sans
   * que le curseur bouge et sans gêner un clavier à composition (corrigé à la fin du mot), puis à la sortie du champ. La suite
   * du nom reste telle que tapée. À ne PAS mettre sur un champ de recherche.
   */
  capitalizeFirst?: boolean
}>()

/** Corrige la valeur affichée en gardant le curseur (une majuscule a la même longueur, sauf de rares exceptions comme « ß »). */
function capitalize(input: HTMLInputElement) {
  const typed = input.value
  const fixed = withInitial(typed)
  if (fixed === typed) return

  const { selectionStart, selectionEnd } = input
  const shift = fixed.length - typed.length
  input.value = fixed
  if (selectionStart !== null && selectionEnd !== null) {
    input.setSelectionRange(selectionStart + shift, selectionEnd + shift)
  }
  model.value = fixed
}

// L'écouteur de `v-model` est posé avant celui-ci : le modèle reçoit d'abord le texte tapé, puis le texte corrigé.
function onInput(event: Event) {
  // Pendant une composition (clavier mobile, IME) la valeur n'est pas encore définitive : on attend sa fin
  if (!props.capitalizeFirst || (event as InputEvent).isComposing === true) return
  capitalize(event.target as HTMLInputElement)
}

function onCompositionEnd(event: Event) {
  if (props.capitalizeFirst) capitalize(event.target as HTMLInputElement)
}

function onBlur(event: Event) {
  if (props.capitalizeFirst) capitalize(event.target as HTMLInputElement)
}
</script>

<template>
  <input
    v-model="model"
    :aria-invalid="invalid ? 'true' : undefined"
    v-bind="capitalizeFirst ? { autocapitalize: 'sentences' } : {}"
    :class="
      cn(
        'min-h-12 w-full rounded-xl border-[1.5px] bg-surface px-3.5 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        invalid ? 'border-2 border-danger' : 'border-line',
      )
    "
    @input="onInput"
    @compositionend="onCompositionEnd"
    @blur="onBlur"
  />
</template>
