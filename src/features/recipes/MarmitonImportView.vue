<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { CircleAlert, LoaderCircle } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { messageForMarmitonFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useImportMarmitonRecipe } from './queries'

// Copier une recette de Marmiton (MAR-004), après le choix de « Nouvelle recette » : coller le lien, une touche, et l'on arrive sur SA recette.
// Le back est le seul juge du lien ; le contrôle d'ici (le texte contient `marmiton.org`) n'évite qu'un appel inutile.
const { t } = useI18n()
const router = useRouter()
const notifications = useNotificationsStore()
const importRecipe = useImportMarmitonRecipe()

const url = ref('')
const failure = ref<string | null>(null)
const busy = computed(() => importRecipe.isPending.value)
const errorId = 'marmiton-error'

function run() {
  // Une deuxième touche pendant l'appel ne part pas
  if (busy.value) return
  const link = url.value.trim()
  if (link === '') {
    failure.value = t('marmiton.empty')

    return
  }
  if (!/marmiton\.org/i.test(link)) {
    failure.value = t('errors.marmitonUrlInvalid')

    return
  }

  failure.value = null
  importRecipe.mutate(link, {
    onSuccess: ({ id, name }) => {
      if (name !== null) notifications.push('success', t('recipes.copiedToast', { name }))
      void router.push({ name: 'recipe', params: { id } })
    },
    onError: (error) => {
      failure.value = messageForMarmitonFailure(error)
    },
  })
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <RouterLink :to="{ name: 'recipe-new' }" class="self-start font-bold text-primary underline">
      {{ t('recipes.new') }}
    </RouterLink>
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t('marmiton.title') }}
    </h1>

    <form class="flex flex-col gap-4" novalidate @submit.prevent="run">
      <p class="text-lg">{{ t('marmiton.help') }}</p>

      <UiField :label="t('marmiton.field')" v-slot="{ id }">
        <UiTextInput
          :id="id"
          v-model="url"
          type="url"
          inputmode="url"
          autocomplete="off"
          class="disabled:bg-bg disabled:text-muted"
          :placeholder="t('marmiton.placeholder')"
          :disabled="busy"
          :invalid="failure !== null"
          :aria-describedby="failure !== null ? errorId : undefined"
          @input="failure = null"
        />
      </UiField>

      <!-- Ce qui s'est passé, ce qui est sauf, une action : l'icône et le texte, jamais la couleur seule. Le lien reste dans le champ. -->
      <div
        v-if="failure !== null"
        :id="errorId"
        role="alert"
        class="flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-on-danger-soft"
      >
        <CircleAlert class="mt-px size-5.5 shrink-0" aria-hidden="true" />
        <p class="text-[15px] leading-snug font-semibold">{{ failure }}</p>
      </div>

      <UiButton type="submit" size="lg" class="w-full" :disabled="busy" :aria-busy="busy">
        <LoaderCircle v-if="busy" class="size-5 animate-spin" stroke-width="3" aria-hidden="true" />
        {{ busy ? t('marmiton.copying') : t('marmiton.copy') }}
      </UiButton>
      <p v-if="busy" role="status" class="text-sm text-muted">{{ t('marmiton.wait') }}</p>
    </form>
  </main>
</template>
