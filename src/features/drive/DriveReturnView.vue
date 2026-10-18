<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import type { ResultLine } from '@drive-protocol'

import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import {
  useChangeListStatus,
  useReopenShoppingList,
  useShoppingList,
} from '@/features/shopping-lists/queries'
import { messageForFailure } from '@/notifications/failures'
import { useOnline } from '@/offline/useOnline'
import { driveBridge } from './bridge'
import { buildChoiceBatches } from './choices'
import { basketUrl } from './leclerc'
import { useDrivePlan, useDriveSettings, useSaveChoices } from './queries'
import { expectedFromPlan } from './restrictToPlan'
import { useDriveReturnStore } from './returnStore'
import { countOutcomes, failedLines, formatPrice } from './summary'

const { t } = useI18n()
const router = useRouter()
const online = useOnline()
const store = useDriveReturnStore()

const event = computed(() => store.event)
/** Le résultat d'un passage de la liste (et non d'une lecture du magasin). */
const run = computed(() => {
  const current = store.event
  if (current?.kind !== 'result' || current.result.type !== 'result') return null

  return { result: current.result, listId: current.draft.listId }
})
const listId = computed(() => run.value?.listId ?? null)
const result = computed(() => run.value?.result ?? null)

// Les noms des ingrédients et des produits viennent du plan : le résultat ne porte que des identifiants
const plan = useDrivePlan(
  () => listId.value ?? '',
  () => listId.value !== null,
)
const list = useShoppingList(
  () => listId.value ?? '',
  () => listId.value !== null,
)
const settings = useDriveSettings()
const names = computed(
  () => new Map(plan.data.value?.lines.map((line) => [line.ingredientSlug, line.ingredientName])),
)
const labels = computed(
  () =>
    new Map(
      plan.data.value?.lines.flatMap((line) =>
        [...line.products, ...line.rejected].map((product) => [
          product.retailerProductId,
          product.label,
        ]),
      ),
    ),
)

const counts = computed(() => (result.value ? countOutcomes(result.value) : null))
const failed = computed(() => (result.value ? failedLines(result.value) : []))
const finalizeUrl = computed(() => basketUrl(settings.data.value?.store?.baseUrl))
const saved = computed(() => store.status === 'saved')

// Un refus de l'application : le passage n'a pas démarré, son brouillon n'a plus lieu d'être
const refusedListId = ref<string | null>(null)

// --- Enregistrement des choix (un seul appel, sauf plus de 200 intentions) ---
const save = useSaveChoices()

/**
 * Les lignes que le résultat doit pouvoir expliquer, quand le brouillon n'a pas gardé le plan envoyé : le plan relu du back (celui que
 * l'écran lit déjà pour les noms). Une lecture qui échoue arrête l'enregistrement : sans plan, rien n'est mémorisé (DRV-614).
 */
async function expectedLines() {
  const data =
    plan.data.value ?? (await plan.refetch({ cancelRefetch: false, throwOnError: true })).data
  if (data === undefined) throw new Error('plan')

  return expectedFromPlan(data)
}

async function persist() {
  if (run.value === null) return
  store.saving()
  try {
    // Le résultat n'est enregistré qu'une fois recoupé avec le plan envoyé : une ligne que le plan n'explique pas est ignorée (DRV-614)
    if (!store.checked) store.check(await expectedLines())
    const current = run.value
    if (current === null) return
    await save.mutateAsync({
      storeId: current.result.store.id,
      batches: buildChoiceBatches(current.result),
    })
    driveBridge.clearDraft()
    store.saved()
  } catch (error) {
    // Le résultat reste en mémoire et le brouillon aussi : on peut réessayer
    store.failed(error)
  }
}

onMounted(() => {
  const current = store.event
  if (current?.kind === 'refused') {
    const draft = driveBridge.loadDraft()
    if (draft !== null && draft.runId === current.runId) {
      refusedListId.value = draft.listId
      driveBridge.clearDraft()
    }
  }
  if (run.value !== null && store.status === 'idle') void persist()
})

// --- Une ligne du résultat, en une phrase ---
const nameOf = (slug: string) => names.value.get(slug) ?? slug
const productOf = (id: string) => labels.value.get(id) ?? t('driveReturn.unknownProduct', { id })
const reasonOf = (code: string) => t(`driveReturn.errorCode.${code}`)

function describe(line: ResultLine) {
  const priced =
    line.outcome === 'ADDED'
      ? line.price
      : line.outcome === 'CHOSEN'
        ? line.product.price
        : undefined
  let product: string | null = null
  let note: string | null = null
  switch (line.outcome) {
    case 'ADDED':
      product = productOf(line.productId)
      note = line.usedRank > 1 ? t('driveReturn.line.fallback') : null
      break
    case 'CHOSEN':
      product = line.product.label
      note = t(
        line.placement === 'PRIMARY'
          ? 'driveReturn.line.chosenPrimary'
          : line.placement === 'FALLBACK'
            ? 'driveReturn.line.chosenFallback'
            : 'driveReturn.line.chosenOnce',
      )
      break
    case 'HAVE_AT_HOME':
      note = t('driveReturn.line.haveAtHome')
      break
    case 'SKIPPED':
      note = t('driveReturn.line.skipped')
      break
    case 'UNAVAILABLE':
      note = t('driveReturn.line.unavailable')
      break
    case 'FAILED':
      note = t('driveReturn.line.failed', { reason: reasonOf(line.error) })
      break
  }
  const rejected = (line.rejected ?? []).map((item) => item.label)

  return {
    slug: line.ingredientSlug,
    name: nameOf(line.ingredientSlug),
    product,
    quantity: 'quantity' in line ? line.quantity : null,
    price: priced === undefined ? null : formatPrice(priced.cents),
    note,
    rejected:
      rejected.length === 0
        ? null
        : t('driveReturn.line.rejected', { labels: rejected.join(', ') }),
    failed: line.outcome === 'FAILED',
  }
}
const rows = computed(() => (result.value?.lines ?? []).map(describe))

// --- Terminer ou rouvrir la liste ---
const status = useChangeListStatus()
const reopen = useReopenShoppingList()
const completing = ref(false)
const reopening = ref(false)

async function leave(id: string) {
  store.clear()
  await router.push({ name: 'shopping-list-detail', params: { id } })
}

function confirmComplete() {
  if (listId.value === null) return
  const id = listId.value
  status.mutate(
    { id, action: 'complete' },
    { onSuccess: () => leave(id), onSettled: () => (completing.value = false) },
  )
}

function confirmReopen() {
  const version = list.data.value?.version
  if (listId.value === null || version === undefined) return
  const id = listId.value
  reopen.mutate(
    { id, version },
    { onSuccess: () => leave(id), onSettled: () => (reopening.value = false) },
  )
}

const countKeys = [
  'added',
  'chosen',
  'haveAtHome',
  'skipped',
  'unavailable',
  'failed',
  'priced',
] as const
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <RouterLink
      v-if="listId"
      :to="{ name: 'shopping-list-detail', params: { id: listId } }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline"
    >
      {{ t('driveReturn.backToList') }}
    </RouterLink>
    <RouterLink
      v-else
      :to="{ name: 'shopping-lists' }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline"
    >
      {{ t('driveReturn.allLists') }}
    </RouterLink>

    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t('driveReturn.title') }}
    </h1>

    <!-- Rien à montrer, résultat d'un autre passage, refus ou réponse mal formée de l'application -->
    <section
      v-if="event === null"
      role="status"
      class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
    >
      <h2 class="font-display text-xl font-bold">{{ t('driveReturn.none.title') }}</h2>
      <p class="text-muted">{{ t('driveReturn.none.help') }}</p>
    </section>

    <section
      v-else-if="event.kind === 'stale'"
      role="status"
      class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
    >
      <h2 class="font-display text-xl font-bold">{{ t('driveReturn.stale.title') }}</h2>
      <p class="text-muted">{{ t('driveReturn.stale.help') }}</p>
    </section>

    <section
      v-else-if="event.kind === 'refused'"
      role="alert"
      class="flex flex-col items-start gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-on-danger-soft"
    >
      <h2 class="font-display text-xl font-bold">{{ t('driveReturn.refused.title') }}</h2>
      <p>{{ t('driveReturn.refused.help') }}</p>
      <p class="text-sm">{{ t('driveReturn.refused.code', { code: event.code }) }}</p>
      <UiLinkButton
        v-if="refusedListId"
        variant="secondary"
        :to="{ name: 'drive-send', params: { listId: refusedListId } }"
      >
        {{ t('driveReturn.refused.backToSend') }}
      </UiLinkButton>
    </section>

    <section
      v-else-if="event.kind === 'invalid'"
      role="alert"
      class="flex flex-col items-start gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-on-danger-soft"
    >
      <h2 class="font-display text-xl font-bold">{{ t('driveReturn.invalid.title') }}</h2>
      <p>{{ t('driveReturn.invalid.help') }}</p>
    </section>

    <section
      v-else-if="result === null"
      role="status"
      class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
    >
      <h2 class="font-display text-xl font-bold">{{ t('driveReturn.setup.title') }}</h2>
      <p class="text-muted">{{ t('driveReturn.setup.help') }}</p>
      <UiLinkButton variant="secondary" :to="{ name: 'drive-settings' }">
        {{ t('driveReturn.setup.settings') }}
      </UiLinkButton>
    </section>

    <!-- Le résultat d'un passage -->
    <template v-else-if="result && counts">
      <section
        role="status"
        :class="[
          'flex flex-col items-start gap-2 rounded-2xl px-5 py-4',
          result.outcome === 'error' || result.outcome === 'partial'
            ? 'bg-danger-soft text-on-danger-soft'
            : 'bg-soft',
        ]"
      >
        <h2 class="font-display text-xl font-bold">
          {{ t(`driveReturn.outcome.${result.outcome}.title`) }}
        </h2>
        <p>
          {{ t(`driveReturn.outcome.${result.outcome}.help`) }}
        </p>
        <p v-if="result.error" class="font-semibold">
          {{ reasonOf(result.error.code) }}
        </p>
      </section>

      <p v-if="store.status === 'saving'" role="status" class="text-muted">
        {{ t('driveReturn.save.saving') }}
      </p>
      <p v-else-if="store.status === 'saved'" role="status" class="font-semibold text-primary">
        {{ t('driveReturn.save.saved') }}
      </p>
      <div v-else-if="store.status === 'failed'" class="flex flex-col items-start gap-3">
        <p
          role="alert"
          class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
        >
          {{ t('driveReturn.save.failed', { reason: messageForFailure(store.error) }) }}
        </p>
        <UiButton variant="secondary" :disabled="!online" @click="persist">
          {{ t('driveReturn.save.retry') }}
        </UiButton>
      </div>

      <p v-if="store.ignored > 0" class="text-sm text-muted">
        {{ t('driveReturn.ignored', { count: store.ignored }, store.ignored) }}
      </p>

      <section class="flex flex-col items-start gap-3">
        <div class="flex flex-wrap gap-2">
          <a
            v-if="finalizeUrl"
            :href="finalizeUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-13 items-center justify-center rounded-xl bg-primary px-7 text-lg font-bold text-on-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('driveReturn.actions.finalize') }}
            <span class="sr-only"> ({{ t('driveReturn.actions.finalizeHelp') }})</span>
          </a>
          <UiLinkButton
            v-if="saved && failed.length > 0 && listId"
            variant="secondary"
            :to="{
              name: 'drive-send',
              params: { listId },
              query: { lignes: failed.map((line) => line.slug).join(',') },
            }"
          >
            {{ t('driveReturn.actions.retryFailed') }}
          </UiLinkButton>
          <UiLinkButton
            v-if="saved && result.outcome !== 'completed' && listId"
            variant="secondary"
            :to="{ name: 'drive-send', params: { listId } }"
          >
            {{ t('driveReturn.actions.resume') }}
          </UiLinkButton>
        </div>
        <div class="flex flex-wrap gap-2">
          <UiButton variant="secondary" :disabled="!online" @click="completing = true">
            {{ t('driveReturn.actions.complete') }}
          </UiButton>
          <UiButton
            variant="ghost"
            :disabled="!online || list.data.value === undefined"
            @click="reopening = true"
          >
            {{ t('driveReturn.actions.reopen') }}
          </UiButton>
        </div>
        <p v-if="!online" class="font-semibold">{{ t('driveReturn.actions.offline') }}</p>
        <p class="text-sm text-muted">{{ t('driveReturn.basketKept') }}</p>
      </section>

      <dl :aria-label="t('driveReturn.counts.label')" class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div
          v-for="key in countKeys"
          :key="key"
          class="flex flex-col-reverse rounded-2xl bg-soft px-4 py-2"
        >
          <dt class="text-sm text-muted">{{ t(`driveReturn.counts.${key}`) }}</dt>
          <dd class="font-display text-xl font-bold">{{ counts[key] }}</dd>
        </div>
      </dl>

      <section v-if="rows.length > 0" class="flex flex-col gap-3">
        <h2 class="font-display text-xl font-bold">
          {{ t('driveReturn.lines', { count: rows.length }) }}
        </h2>
        <ul class="flex flex-col gap-3">
          <li
            v-for="row in rows"
            :key="row.slug"
            class="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4"
          >
            <h3 class="font-bold break-words">{{ row.name }}</h3>
            <p v-if="row.product" class="break-words">
              {{ row.product }}
              <span v-if="row.quantity" class="text-muted">
                · {{ t('driveReturn.quantity', { count: row.quantity }) }}</span
              >
              <span v-if="row.price" class="text-muted"> · {{ row.price }}</span>
            </p>
            <p
              v-if="row.note"
              :class="row.failed ? 'font-semibold text-danger' : 'text-sm text-muted'"
            >
              {{ row.note }}
            </p>
            <p v-if="row.rejected" class="text-sm break-words text-muted">{{ row.rejected }}</p>
          </li>
        </ul>
      </section>
    </template>

    <UiConfirmDialog
      v-model:open="completing"
      variant="primary"
      :title="t('driveReturn.actions.completeTitle')"
      :description="t('driveReturn.actions.completeHelp')"
      :confirm-label="t('driveReturn.actions.complete')"
      :pending="status.isPending.value"
      @confirm="confirmComplete"
    />
    <UiConfirmDialog
      v-model:open="reopening"
      variant="primary"
      :title="t('driveReturn.actions.reopenTitle')"
      :description="t('driveReturn.actions.reopenHelp')"
      :confirm-label="t('driveReturn.actions.reopen')"
      :pending="reopen.isPending.value"
      @confirm="confirmReopen"
    />
  </main>
</template>
