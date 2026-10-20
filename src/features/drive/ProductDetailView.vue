<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { ArrowDown, ArrowUp } from 'lucide-vue-next'

import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiChip from '@/design/UiChip.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import { isStale, messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useOnline } from '@/offline/useOnline'
import * as choiceDraft from './choiceDraft'
import type { ChoiceDraft } from './choiceDraft'
import { useDriveChoices, useForgetChoice, useReplaceChoice, useUnitNames } from './choicesQueries'
import ProductPackSize from './ProductPackSize.vue'
import { useDriveSettings } from './queries'
import { contentLabel } from './productFormat'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const notifications = useNotificationsStore()
const online = useOnline()

const slug = computed(() => String(route.params.slug))
// Le nom des unités de Repas (« tranche ») pour dire la contenance d'un produit ; à défaut, le slug lisible
const unitNames = useUnitNames()
const settings = useDriveSettings()
const enabled = computed(() => settings.data.value?.enabled === true)
const store = computed(() => settings.data.value?.store ?? null)
const choices = useDriveChoices(() => enabled.value && store.value !== null)
const choice = computed(() =>
  choices.data.value?.member?.find((candidate) => candidate.ingredientSlug === slug.value),
)
/** Le produit tel que Repas l'a enregistré : la contenance se corrige sur lui, pas sur le brouillon d'ordre en cours. */
const savedProduct = (productId: string) =>
  choice.value?.accepted.find((entry) => entry.product.productId === productId)?.product

// Le brouillon : les modifications restent locales jusqu'à « Enregistrer ». Une relecture (retour sur l'onglet) ne l'écrase pas.
const draft = ref<ChoiceDraft | null>(null)
watch(
  choice,
  (next, previous) => {
    if (next === undefined) return
    if (
      draft.value === null ||
      previous === undefined ||
      !choiceDraft.isDirty(draft.value, previous)
    )
      draft.value = choiceDraft.draftOf(next)
  },
  { immediate: true },
)
const dirty = computed(
  () =>
    draft.value !== null &&
    choice.value !== undefined &&
    choiceDraft.isDirty(draft.value, choice.value),
)

const replace = useReplaceChoice(() => slug.value)
const forget = useForgetChoice(() => slug.value)
const busy = computed(() => replace.isPending.value || forget.isPending.value)
const locked = computed(() => busy.value || !online.value)
const failure = ref<string | null>(null)
const announcement = ref('')
const forgetting = ref(false)
const acceptedList = ref<HTMLOListElement | null>(null)

const full = computed(() => draft.value !== null && !choiceDraft.canAcceptAgain(draft.value))
const rejectedFull = computed(() => draft.value !== null && !choiceDraft.canReject(draft.value))

function update(next: ChoiceDraft, message?: string) {
  draft.value = next
  failure.value = null
  if (message !== undefined) announcement.value = message
}

/** Après un déplacement le bouton pressé change de place : le focus le suit (ou son vis-à-vis à l'extrémité de la liste). */
async function refocus(productId: string, action: 'up' | 'down') {
  await nextTick()
  const row = [...(acceptedList.value?.children ?? [])].find(
    (item) => (item as HTMLElement).dataset.product === productId,
  )
  const wanted = row?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
  const other = row?.querySelector<HTMLButtonElement>(
    `[data-action="${action === 'up' ? 'down' : 'up'}"]`,
  )
  ;(wanted?.disabled === false ? wanted : other)?.focus()
}

function shift(productId: string, label: string, step: -1 | 1) {
  if (draft.value === null) return
  const next = choiceDraft.move(draft.value, productId, step)
  const position = next.accepted.findIndex((product) => product.productId === productId) + 1
  update(next, t('driveProducts.moved', { name: label, position, total: next.accepted.length }))
  void refocus(productId, step === -1 ? 'up' : 'down')
}

function drop(productId: string, label: string) {
  if (draft.value === null) return
  update(choiceDraft.remove(draft.value, productId), t('driveProducts.removed', { name: label }))
}

function refuse(productId: string, label: string) {
  if (draft.value === null) return
  update(
    choiceDraft.reject(draft.value, productId),
    t('driveProducts.rejectedNow', { name: label }),
  )
}

function again(productId: string, label: string) {
  if (draft.value === null) return
  update(
    choiceDraft.acceptAgain(draft.value, productId),
    t('driveProducts.acceptedAgain', { name: label }),
  )
}

function cancel() {
  if (choice.value !== undefined)
    update(choiceDraft.draftOf(choice.value), t('driveProducts.cancelled'))
}

/** Un refus du back s'affiche à côté de l'action ; une ressource changée ailleurs (409, drive coupé) relit les écrans du drive. */
function fail(error: unknown) {
  failure.value = messageForFailure(error)
  if (isStale(error)) void queryClient.invalidateQueries({ queryKey: ['drive'] })
}

async function save() {
  if (draft.value === null || store.value === null) return
  const toSave = draft.value
  failure.value = null
  try {
    await replace.mutateAsync(choiceDraft.toPayload(toSave, store.value.id))
  } catch (error) {
    fail(error)

    return
  }
  // Une préférence vide est supprimée par le back : plus rien à modifier ici.
  if (choiceDraft.isEmpty(toSave)) {
    notifications.push(
      'success',
      t('driveProducts.forgotten', { name: choice.value?.ingredientName ?? slug.value }),
    )
    await router.push({ name: 'drive-products' })

    return
  }
  if (choice.value !== undefined) draft.value = choiceDraft.draftOf(choice.value)
  notifications.push('success', t('driveProducts.saved'))
}

async function forgetIt() {
  if (store.value === null) return
  const name = choice.value?.ingredientName ?? slug.value
  try {
    await forget.mutateAsync(store.value.id)
  } catch (error) {
    forgetting.value = false
    fail(error)

    return
  }
  forgetting.value = false
  notifications.push('success', t('driveProducts.forgotten', { name }))
  await router.push({ name: 'drive-products' })
}

const rowClass = 'flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5'
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
    <RouterLink
      :to="{ name: 'drive-products' }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('driveProducts.back') }}
    </RouterLink>

    <p v-if="settings.isPending.value || choices.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p
      v-else-if="hasFailed(settings) || hasFailed(choices)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>
    <p v-else-if="!enabled" class="text-muted">{{ t('driveProducts.unavailable') }}</p>
    <p v-else-if="store === null" class="text-muted">
      {{ t('driveProducts.noStore') }}
      <RouterLink :to="{ name: 'drive-settings' }" class="font-bold text-primary underline">{{
        t('driveProducts.settings')
      }}</RouterLink>
    </p>
    <p v-else-if="choice === undefined || draft === null" class="text-muted">
      {{ t('driveProducts.missing') }}
    </p>

    <template v-else>
      <header class="flex flex-col gap-1">
        <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
          {{ choice.ingredientName }}
        </h1>
        <p
          v-if="choice.searchQuery"
          data-testid="searched-as"
          class="text-sm break-words text-muted"
        >
          {{ t('driveProducts.searchedAs', { query: choice.searchQuery }) }}
        </p>
      </header>

      <p class="sr-only" role="status">{{ announcement }}</p>
      <p v-if="!online" class="rounded-xl bg-soft px-4 py-3 font-semibold">
        {{ t('driveProducts.offline') }}
      </p>

      <section class="flex flex-col items-start gap-2">
        <UiChip
          :pressed="draft.haveAtHome"
          :disabled="locked"
          class="disabled:pointer-events-none disabled:opacity-50"
          @update:pressed="update(choiceDraft.toggleHaveAtHome(draft, $event))"
        >
          {{ t('driveProducts.haveAtHomeSwitch') }}
        </UiChip>
        <p class="text-sm text-muted">{{ t('driveProducts.haveAtHomeHelp') }}</p>
      </section>

      <template v-if="!draft.haveAtHome">
        <section class="flex flex-col gap-3" aria-labelledby="accepted-title">
          <h2 id="accepted-title" class="font-display text-2xl font-bold">
            {{ t('driveProducts.accepted') }}
          </h2>
          <p class="text-sm text-muted">
            {{ t('driveProducts.acceptedHelp', { max: choiceDraft.MAX_ACCEPTED }) }}
          </p>
          <p v-if="draft.accepted.length === 0" class="text-muted">
            {{ t('driveProducts.acceptedNone') }}
          </p>
          <ol
            v-else
            ref="acceptedList"
            class="flex flex-col gap-3"
            :aria-label="t('driveProducts.accepted')"
          >
            <li
              v-for="(product, index) in draft.accepted"
              :key="product.productId"
              :data-product="product.productId"
              :class="rowClass"
            >
              <div class="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  class="flex size-8 shrink-0 items-center justify-center rounded-full bg-soft font-bold"
                  >{{ index + 1 }}</span
                >
                <div class="min-w-0 flex-1">
                  <p class="font-bold break-words">{{ product.label }}</p>
                  <p class="text-sm text-muted">
                    <span v-if="contentLabel(product.content)"
                      >{{ contentLabel(product.content) }} ·
                    </span>
                    {{
                      index === 0
                        ? t('driveProducts.preferredBadge')
                        : t('driveProducts.fallbackBadge')
                    }}
                    <span class="sr-only">
                      {{
                        t('driveProducts.position', {
                          position: index + 1,
                          total: draft.accepted.length,
                        })
                      }}</span
                    >
                  </p>
                  <ProductPackSize
                    v-if="savedProduct(product.productId)?.packSize && store !== null"
                    :ingredient-slug="slug"
                    :product="savedProduct(product.productId)!"
                    :store-id="store.id"
                    :unit-names="unitNames"
                    :disabled="locked"
                  />
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <UiButton
                  variant="secondary"
                  data-action="up"
                  :disabled="locked || index === 0"
                  @click="shift(product.productId, product.label, -1)"
                >
                  <ArrowUp class="size-4" aria-hidden="true" />{{ t('driveProducts.up')
                  }}<span class="sr-only"> {{ product.label }}</span>
                </UiButton>
                <UiButton
                  variant="secondary"
                  data-action="down"
                  :disabled="locked || index === draft.accepted.length - 1"
                  @click="shift(product.productId, product.label, 1)"
                >
                  <ArrowDown class="size-4" aria-hidden="true" />{{ t('driveProducts.down')
                  }}<span class="sr-only"> {{ product.label }}</span>
                </UiButton>
                <UiButton
                  variant="ghost"
                  class="border-[1.5px] border-line"
                  :disabled="locked"
                  @click="drop(product.productId, product.label)"
                >
                  {{ t('driveProducts.remove') }}<span class="sr-only"> {{ product.label }}</span>
                </UiButton>
                <UiButton
                  variant="ghost"
                  class="border-[1.5px] border-line"
                  :disabled="locked || rejectedFull"
                  @click="refuse(product.productId, product.label)"
                >
                  {{ t('driveProducts.never') }}<span class="sr-only"> {{ product.label }}</span>
                </UiButton>
              </div>
            </li>
          </ol>
          <p v-if="rejectedFull" class="text-sm text-muted">
            {{ t('driveProducts.rejectedFull', { max: choiceDraft.MAX_REJECTED }) }}
          </p>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="rejected-title">
          <h2 id="rejected-title" class="font-display text-2xl font-bold">
            {{ t('driveProducts.rejected') }}
          </h2>
          <p v-if="draft.rejected.length === 0" class="text-muted">
            {{ t('driveProducts.rejectedNone') }}
          </p>
          <ul v-else class="flex flex-col gap-3">
            <li v-for="product in draft.rejected" :key="product.productId" :class="rowClass">
              <div class="min-w-0">
                <p class="font-bold break-words">{{ product.label }}</p>
                <p v-if="contentLabel(product.content)" class="text-sm text-muted">
                  {{ contentLabel(product.content) }}
                </p>
              </div>
              <div>
                <UiButton
                  variant="secondary"
                  :disabled="locked || full"
                  @click="again(product.productId, product.label)"
                >
                  {{ t('driveProducts.acceptAgain')
                  }}<span class="sr-only"> {{ product.label }}</span>
                </UiButton>
              </div>
            </li>
          </ul>
          <p v-if="full && draft.rejected.length > 0" class="text-sm text-muted">
            {{ t('driveProducts.acceptedFull', { max: choiceDraft.MAX_ACCEPTED }) }}
          </p>
        </section>
      </template>

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <UiButton :disabled="locked || !dirty" @click="save">{{ t('common.save') }}</UiButton>
        <UiButton
          variant="ghost"
          class="border-[1.5px] border-line"
          :disabled="locked || !dirty"
          @click="cancel"
          >{{ t('driveProducts.cancel') }}</UiButton
        >
        <span v-if="dirty" class="text-sm font-semibold text-muted">{{
          t('driveProducts.dirty')
        }}</span>
      </div>

      <div class="border-t border-line pt-4">
        <UiButton variant="danger" :disabled="locked" @click="forgetting = true">{{
          t('driveProducts.forget')
        }}</UiButton>
      </div>

      <UiConfirmDialog
        v-model:open="forgetting"
        :title="t('driveProducts.forgetTitle', { name: choice.ingredientName })"
        :description="t('driveProducts.forgetDescription')"
        :confirm-label="t('driveProducts.forgetConfirm')"
        :pending="busy"
        @confirm="forgetIt"
      />
    </template>
  </main>
</template>
