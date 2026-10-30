<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { Lock } from 'lucide-vue-next'

// L'interrupteur « Recette secrète » du formulaire d'une recette (REC-002) : un vrai `<input type="checkbox" role="switch">` posé sur
// une piste dessinée (cible de 56 x 44 px), son libellé et son aide lus avec lui.
const model = defineModel<boolean>({ default: false })

const { t } = useI18n()
const id = useId()
const hintId = `${id}-hint`
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 rounded-2xl border-[1.5px] bg-surface p-3.5',
      model ? 'border-primary' : 'border-line',
    ]"
  >
    <span
      aria-hidden="true"
      class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secret-soft text-on-secret-soft"
    >
      <Lock class="size-[22px]" />
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <label :for="id" class="cursor-pointer text-[17px] font-bold">{{ t('editor.secret') }}</label>
      <p :id="hintId" class="text-[15px] leading-snug text-muted">{{ t('editor.secretHint') }}</p>
    </div>
    <span class="relative h-11 w-14 shrink-0">
      <input
        :id="id"
        type="checkbox"
        role="switch"
        :checked="model"
        :aria-describedby="hintId"
        class="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
        @change="model = ($event.target as HTMLInputElement).checked"
      />
      <span
        aria-hidden="true"
        class="absolute top-1.5 left-0.5 h-8 w-[52px] rounded-full border-2 border-muted bg-surface peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
      />
      <span
        aria-hidden="true"
        class="absolute top-2.5 left-1.5 size-6 rounded-full bg-muted transition-transform peer-checked:translate-x-5 peer-checked:bg-on-primary motion-reduce:transition-none"
      />
    </span>
  </div>
</template>
