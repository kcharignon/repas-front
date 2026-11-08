<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Plus, Search } from 'lucide-vue-next'

import type { Ingredient, IngredientOption } from '@/api'
import { capitalizeFirst } from '@/design/capitalizeFirst'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiSheet from '@/design/UiSheet.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useIngredientOptions } from '@/features/recipes/queries'
import { messageForFailure } from '@/notifications/failures'
import PartAmountField from './PartAmountField.vue'
import { nameUsedMessage } from './nameUsed'
import { amountSuffix, oneOf, parseRatio } from './partsText'
import { useIngredient, useSaveIngredient, useSetIngredientParent } from './queries'

/**
 * « Ajouter une partie » (SUB-007) : on choisit un ingrédient à soi, ou « Nouvelle partie » (un nom : le rayon et les unités sont ceux de
 * l'ingrédient entier), on dit combien il y en a dans UNE unité de l'ingrédient entier, et c'est fait. Le parent envoyé au back est
 * toujours `parent` : la fiche ouverte, donc à l'utilisateur ; la partie vient de SES ingrédients (la liste du back ne rend que les siens).
 * Une partie nouvelle se fait en deux écritures (créer, puis relier) : si la seconde échoue, la partie existe déjà et on le dit ; un nouvel
 * essai ne la crée pas deux fois.
 */
const props = defineProps<{ parent: Ingredient }>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ saved: [] }>()

const { t } = useI18n()

const NEW = '__nouvelle-partie__'
// Les ingrédients de l'utilisateur ne se lisent qu'à l'ouverture (la liste est gardée cinq minutes)
const options = useIngredientOptions(() => open.value)
const create = useSaveIngredient()
const link = useSetIngredientParent()

const search = ref('')
const picked = ref('')
const newName = ref('')
const ratio = ref('1')
const submitted = ref(false)
const failure = ref<string | null>(null)
// La partie créée par un premier essai dont le rattachement a échoué : elle devient un choix comme un autre
const created = ref<{ slug: string; name: string } | null>(null)

watch(open, (value) => {
  if (!value) return
  search.value = ''
  picked.value = ''
  newName.value = ''
  ratio.value = '1'
  submitted.value = false
  failure.value = null
  created.value = null
})

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')

const MAX_SHOWN = 50
// Ce qu'on peut choisir : ni l'ingrédient entier, ni un autre entier qui a déjà des parties, ni une partie déjà rangée (ici ou ailleurs :
// la changer de parent se fait depuis sa propre fiche). Ceux du rayon de l'ingrédient entier d'abord.
const candidates = computed<IngredientOption[]>(() => {
  const all = options.data.value?.member ?? []
  const wholes = new Set(all.flatMap((option) => (option.partOfSlug ? [option.partOfSlug] : [])))
  const wanted = fold(search.value.trim())
  const listed = all.filter(
    (option) =>
      option.slug !== props.parent.slug &&
      !option.partOfSlug &&
      !wholes.has(option.slug) &&
      fold(option.name).includes(wanted),
  )
  const sameDepartment = listed.filter(
    (option) => option.departmentSlug === props.parent.departmentSlug,
  )
  const others = listed.filter((option) => option.departmentSlug !== props.parent.departmentSlug)
  const fresh = created.value
  const makeup: IngredientOption[] = fresh
    ? [
        {
          slug: fresh.slug,
          name: fresh.name,
          departmentSlug: props.parent.departmentSlug,
          departmentName: props.parent.departmentName,
        },
      ]
    : []

  return [...makeup, ...sameDepartment, ...others].slice(0, MAX_SHOWN)
})

const isNew = computed(() => picked.value === NEW)
const pickedOption = computed(() => candidates.value.find((option) => option.slug === picked.value))
// L'unité d'achat d'une partie qui existe déjà (le nombre est dans cette unité) : la liste des ingrédients ne la dit pas
const pickedDetail = useIngredient(() => (pickedOption.value ? picked.value : ''))

const trimmedName = computed(() => newName.value.trim())
const partName = computed(() =>
  isNew.value ? trimmedName.value : (pickedOption.value?.name ?? ''),
)
// Une partie nouvelle prend les unités de l'ingrédient entier : son nombre se lit dans l'unité d'achat de celui-ci
const partUnit = computed(() =>
  isNew.value ? props.parent.purchaseUnitName : pickedDetail.data.value?.purchaseUnitName,
)
const value = computed(() => parseRatio(ratio.value))
const one = computed(() => oneOf(props.parent.name, props.parent.cookingUnitName))
const suffix = computed(() =>
  partName.value === '' ? '' : amountSuffix(partName.value, partUnit.value, value.value),
)

function choose(slug: string) {
  picked.value = slug
  failure.value = null
  // « Nouvelle partie » reprend ce qui était cherché, déjà en majuscule
  if (slug === NEW && newName.value === '') newName.value = capitalizeFirst(search.value.trim())
}

const errors = computed(() => ({
  choice: submitted.value && picked.value === '' ? t('ingredients.parts.errors.choice') : undefined,
  name:
    submitted.value && isNew.value && trimmedName.value === ''
      ? t('ingredients.parts.errors.name')
      : undefined,
  number:
    submitted.value && value.value === null ? t('ingredients.parts.errors.number') : undefined,
}))

async function submit() {
  submitted.value = true
  failure.value = null
  const ratioValue = value.value
  if (picked.value === '' || (isNew.value && trimmedName.value === '') || ratioValue === null)
    return

  let slug = picked.value
  let createdNow = created.value
  if (isNew.value) {
    try {
      // Mêmes rayon et unités que l'ingrédient entier (et son nombre de conversion s'ils diffèrent) : rien d'autre à demander
      slug = await create.mutateAsync({
        slug: null,
        form: {
          name: trimmedName.value,
          departmentSlug: props.parent.departmentSlug,
          defaultCookingUnitSlug: props.parent.cookingUnitSlug,
          defaultPurchaseUnitSlug: props.parent.purchaseUnitSlug,
          coefficient: props.parent.hasSameUnit ? null : (props.parent.coefficient ?? null),
        },
      })
    } catch (error) {
      failure.value =
        nameUsedMessage(error, trimmedName.value, props.parent.departmentName) ??
        messageForFailure(error)

      return
    }
    createdNow = { slug, name: capitalizeFirst(trimmedName.value) }
  }

  try {
    await link.mutateAsync({ slug, parent: props.parent.slug, ratio: ratioValue })
  } catch (error) {
    const reason = messageForFailure(error)
    if (createdNow !== null) {
      // La partie existe : le prochain essai la relie, il ne la recrée pas
      created.value = createdNow
      picked.value = createdNow.slug
      failure.value = `${reason} ${t('ingredients.parts.notLinked', { name: createdNow.name })}`
    } else failure.value = reason

    return
  }
  open.value = false
  emit('saved')
}

const busy = computed(() => create.isPending.value || link.isPending.value)
const radioName = 'part-choice'
</script>

<template>
  <UiSheet v-model:open="open" :title="t('ingredients.parts.sheetTitle')">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <label
        class="flex min-h-12 items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-bg px-3.5 text-muted focus-within:border-primary"
      >
        <Search class="size-5 shrink-0" aria-hidden="true" />
        <span class="sr-only">{{ t('ingredients.parts.search') }}</span>
        <input
          v-model="search"
          type="search"
          maxlength="100"
          autocomplete="off"
          :placeholder="t('ingredients.parts.search')"
          class="min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
        />
      </label>

      <div class="flex flex-col gap-1.5">
        <div
          role="radiogroup"
          :aria-label="t('ingredients.parts.choices')"
          :aria-invalid="errors.choice ? 'true' : undefined"
          class="flex max-h-56 flex-col gap-1.5 overflow-y-auto"
        >
          <label
            v-for="option in candidates"
            :key="option.slug"
            class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line px-3.5 has-checked:border-primary has-checked:bg-soft has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
          >
            <input
              type="radio"
              :name="radioName"
              :value="option.slug"
              :checked="picked === option.slug"
              class="sr-only"
              @change="choose(option.slug)"
            />
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{{ option.name }}</span>
            <Check v-if="picked === option.slug" class="size-5 text-primary" aria-hidden="true" />
          </label>
          <p v-if="options.isPending.value" class="px-1 text-sm text-muted" role="status">
            {{ t('common.loading') }}
          </p>
          <p
            v-else-if="candidates.length === 0 && search.trim() !== ''"
            class="px-1 text-sm text-muted"
            role="status"
          >
            {{ t('ingredients.parts.noMatch', { search: search.trim() }) }}
          </p>
        </div>

        <label
          class="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-dashed border-primary px-3.5 font-bold text-primary has-checked:border-solid has-checked:bg-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
        >
          <input
            type="radio"
            :name="radioName"
            :value="NEW"
            :checked="isNew"
            class="sr-only"
            @change="choose(NEW)"
          />
          <Plus class="size-5 shrink-0" aria-hidden="true" />
          <span class="flex-1">{{ t('ingredients.parts.newPart') }}</span>
          <Check v-if="isNew" class="size-5" aria-hidden="true" />
        </label>
        <p v-if="errors.choice" class="text-sm font-semibold text-danger">{{ errors.choice }}</p>
      </div>

      <UiField
        v-if="isNew"
        :label="t('ingredients.parts.newName')"
        :error="errors.name"
        v-slot="{ id, describedby, invalid }"
      >
        <UiTextInput
          :id="id"
          v-model="newName"
          capitalize-first
          autocomplete="off"
          :aria-describedby="describedby"
          :invalid="invalid"
        />
      </UiField>

      <PartAmountField
        v-model="ratio"
        :label="t('ingredients.parts.how', { one })"
        :suffix="suffix"
        :error="errors.number"
      />

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <UiButton type="submit" size="lg" :disabled="busy">{{
        t('ingredients.parts.submit')
      }}</UiButton>
    </form>
  </UiSheet>
</template>
