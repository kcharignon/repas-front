<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{
  label: string
  hint?: string
  /** Message d'erreur (ex. celui du back pour un 422) : le champ passe en erreur et le lecteur d'écran le lit. */
  error?: string | null
}>()

const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`
const describedby = computed(
  () =>
    [props.hint ? hintId : null, props.error ? errorId : null].filter(Boolean).join(' ') ||
    undefined,
)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-semibold">{{ label }}</label>
    <slot :id="id" :describedby="describedby" :invalid="Boolean(error)" />
    <p v-if="hint" :id="hintId" class="text-sm text-muted">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="text-sm font-semibold text-danger">{{ error }}</p>
  </div>
</template>
