<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/design/UiButton.vue'
import UiDialog from '@/design/UiDialog.vue'
import UiField from '@/design/UiField.vue'
import UiSelect from '@/design/UiSelect.vue'

/**
 * Supprimer un type de recette : on demande d'abord dans quel autre type passent TOUTES ses recettes (celles de tous les utilisateurs).
 * Le type supprimé n'est pas proposé ; sans autre type, rien ne peut être supprimé (il en reste toujours un).
 */
const props = defineProps<{
  /** Le type à supprimer ; `null` : la fenêtre est fermée. */
  type: { slug: string; name: string } | null
  /** Tous les types, y compris celui qu'on supprime. */
  choices: { slug: string; name: string }[]
  pending?: boolean
  error?: string | null
}>()

const emit = defineEmits<{ confirm: [transferTo: string]; close: [] }>()

const { t } = useI18n()

const target = ref('')
const submitted = ref(false)
const others = computed(() => props.choices.filter((choice) => choice.slug !== props.type?.slug))
const open = computed({
  get: () => props.type !== null,
  set: (value: boolean) => {
    if (!value) emit('close')
  },
})

// Chaque ouverture repart d'un choix vide : jamais le dernier type choisi par habitude
watch(
  () => props.type,
  () => {
    target.value = ''
    submitted.value = false
  },
)

function submit() {
  submitted.value = true
  if (target.value === '') return
  emit('confirm', target.value)
}
</script>

<template>
  <UiDialog
    v-model:open="open"
    :title="t('admin.deleteTypeTitle')"
    :description="t('admin.deleteTypeHelp', { name: type?.name ?? '' })"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <p v-if="others.length === 0" class="text-muted">{{ t('admin.transferNone') }}</p>
      <UiField
        v-else
        :label="t('admin.transferTo')"
        :error="submitted && target === '' ? t('admin.transferPlaceholder') : undefined"
        v-slot="{ id, describedby, invalid }"
      >
        <UiSelect :id="id" v-model="target" :aria-describedby="describedby" :invalid="invalid">
          <option value="" disabled>{{ t('admin.transferPlaceholder') }}</option>
          <option v-for="choice in others" :key="choice.slug" :value="choice.slug">
            {{ choice.name }}
          </option>
        </UiSelect>
      </UiField>
      <p
        v-if="error"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ error }}
      </p>
      <div class="flex flex-wrap justify-end gap-2">
        <UiButton variant="ghost" @click="open = false">{{ t('common.cancel') }}</UiButton>
        <UiButton type="submit" variant="danger" :disabled="pending || others.length === 0">
          {{ t('common.delete') }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>
