<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Link, Plus } from 'lucide-vue-next'

import UiButton from '@/design/UiButton.vue'
import RecipeComponentRow from './RecipeComponentRow.vue'
import type { EditableComponent } from './RecipeComponentRow.vue'
import UsableRecipesSheet from './UsableRecipesSheet.vue'
import { usedInNames, MAX_COMPONENTS } from './componentsText'
import { fromUsableRecipe } from './editableComponents'
import type { UsableRecipe } from '@/api'

/**
 * « Recettes utilisées », sous les ingrédients de l'éditeur (COMP-006) : une phrase et un bouton quand il n'y en a aucune, puis une ligne par
 * recette utilisée (son nom qui l'ouvre à part, son nombre de fois réglé par « − » et « + » de 0,5 en 0,5 ou tapé, « Retirer »). Une recette
 * qui sert déjà dans d'autres ne peut pas en utiliser (`servedIn`) : la section est remplacée par une phrase, pour qu'on ne cherche pas le bouton.
 * Le parent sait que la section a été touchée (`change`) : sans cela l'enregistrement ne renvoie pas les recettes utilisées.
 */
const components = defineModel<EditableComponent[]>({ required: true })

defineProps<{
  forRecipeId: string | null
  secret: boolean
  submitted: boolean
  /** Les recettes dans lesquelles celle-ci est déjà utilisée (vide : aucune). */
  servedIn: readonly string[]
}>()

const emit = defineEmits<{ change: [] }>()

const { t } = useI18n()
const choosing = ref(false)
const full = computed(() => components.value.length >= MAX_COMPONENTS)

function pick(recipe: UsableRecipe) {
  components.value = [...components.value, fromUsableRecipe(recipe)]
  emit('change')
}

function update(index: number, updated: EditableComponent) {
  components.value = components.value.map((entry, at) => (at === index ? updated : entry))
  emit('change')
}

function remove(key: number) {
  components.value = components.value.filter((entry) => entry.key !== key)
  emit('change')
}
</script>

<template>
  <div
    v-if="servedIn.length > 0"
    data-serves-elsewhere
    class="flex items-start gap-3 rounded-2xl bg-soft px-3.5 py-3"
  >
    <Link class="mt-0.5 size-[22px] shrink-0 text-primary" aria-hidden="true" />
    <p class="text-[15px]">
      {{ t('recipes.components.servesElsewhere', { names: usedInNames(servedIn) }) }}
    </p>
  </div>

  <section v-else class="flex flex-col gap-3" aria-labelledby="components-title">
    <div class="flex flex-col gap-1">
      <h2 id="components-title" class="font-display text-2xl font-bold">
        {{ t('recipes.components.title') }}
      </h2>
      <p v-if="components.length > 0" class="text-sm text-muted">
        {{ t('recipes.components.help') }}
      </p>
    </div>

    <ul v-if="components.length > 0" class="flex flex-col gap-3">
      <RecipeComponentRow
        v-for="(component, index) in components"
        :key="component.key"
        :model-value="component"
        :submitted="submitted"
        @update:model-value="(updated) => update(index, updated)"
        @remove="remove(component.key)"
      />
    </ul>
    <div
      v-else
      data-components-empty
      class="flex flex-col gap-3 rounded-2xl border border-dashed border-line bg-soft p-4"
    >
      <p class="text-muted">{{ t('recipes.components.empty') }}</p>
      <UiButton variant="secondary" class="w-full bg-surface" @click="choosing = true"
        ><Plus class="size-5" aria-hidden="true" />{{ t('recipes.components.add') }}</UiButton
      >
    </div>

    <template v-if="components.length > 0">
      <div v-if="full" data-components-full class="flex flex-col gap-1 rounded-2xl bg-soft p-4">
        <p class="font-bold">{{ t('recipes.components.fullTitle') }}</p>
        <p class="text-muted">{{ t('recipes.components.fullHint') }}</p>
      </div>
      <div v-else>
        <UiButton variant="secondary" @click="choosing = true"
          ><Plus class="size-5" aria-hidden="true" />{{ t('recipes.components.add') }}</UiButton
        >
      </div>
    </template>

    <UsableRecipesSheet
      v-model:open="choosing"
      :for-recipe-id="forRecipeId"
      :secret="secret"
      :chosen="components.map((entry) => entry.recipeId)"
      @pick="pick"
    />
  </section>
</template>
