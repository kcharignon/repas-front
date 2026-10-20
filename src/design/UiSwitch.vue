<script setup lang="ts">
import { useId } from 'vue'

import { cn } from './cn'

const model = defineModel<boolean>({ default: false })

/** `hint` : une ligne d'aide sous le libellé, lue avec l'interrupteur. */
defineProps<{ label: string; hint?: string; disabled?: boolean }>()

const id = useId()
const hintId = `${id}-hint`
</script>

<template>
  <!-- Le bouton fait 44 px de haut (cible tactile) autour d'une piste de 32 px ; le libellé bascule aussi l'interrupteur. -->
  <div class="flex items-start gap-3">
    <button
      :id="id"
      type="button"
      role="switch"
      :aria-checked="model"
      :aria-describedby="hint ? hintId : undefined"
      :disabled="disabled"
      class="group flex h-11 w-14 shrink-0 cursor-pointer items-center focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
      @click="model = !model"
    >
      <span
        aria-hidden="true"
        :class="
          cn(
            'flex h-8 w-14 items-center rounded-full border-2 px-0.5 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary',
            model ? 'border-primary bg-primary' : 'border-muted bg-surface',
          )
        "
      >
        <span
          :class="
            cn(
              'block size-5 rounded-full transition-transform motion-reduce:transition-none',
              model ? 'translate-x-6 bg-on-primary' : 'translate-x-0 bg-muted',
            )
          "
        />
      </span>
    </button>
    <div class="flex min-w-0 flex-1 flex-col">
      <label :for="id" class="flex min-h-11 cursor-pointer items-center text-base font-semibold">{{
        label
      }}</label>
      <p v-if="hint" :id="hintId" class="-mt-1.5 text-sm text-muted">{{ hint }}</p>
    </div>
  </div>
</template>
