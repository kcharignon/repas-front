<script setup lang="ts">
import { useRetailerI18n } from './useRetailerI18n'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { ResultLine, ResultMessage } from '@drive-protocol'

import type { DrivePlan } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import {
  useChangeListStatus,
  useReopenShoppingList,
  useShoppingList,
} from '@/features/shopping-lists/queries'
import { isRateLimited, messageForFailure } from '@/notifications/failures'
import { useOnline } from '@/offline/useOnline'
import { basketSlugsOf, notInCartCount } from './basket'
import { driveBridge } from './bridge'
import { buildChoiceBatches, countChoices, knownProductsOf } from './choices'
import { chosenStoreOf } from './chosenStore'
import { drivesOf } from './drives'
import { finalizeLink, retailerOf } from './retailers'
import {
  useDrivePlan,
  useDriveSettings,
  useMarkBasketLines,
  useSaveChoices,
  useSaveDriveSettings,
} from './queries'
import { expectedFromPlan } from './restrictToPlan'
import { useDriveReturnStore } from './returnStore'
import DriveFold from './DriveFold.vue'
import { countOutcomes, formatPrice, remaining, visibleCounts } from './summary'

// Le drive du passage dont on lit le résultat (DRV-710) : celui du brouillon, pas celui des réglages d'aujourd'hui. Les textes, les choix enregistrés
// et le lien « Finaliser » sont les siens.
const runRetailer = computed(() => run.value?.retailer)
const { t, retailer } = useRetailerI18n(() => runRetailer.value)
const router = useRouter()
const online = useOnline()
const store = useDriveReturnStore()
/** Dans l'application, le drive s'ouvre dans son écran (connecté) ; dans un navigateur, dans un nouvel onglet (DRV-625). */
const inApp = driveBridge.isAvailable()

const event = computed(() => store.event)
/** Le résultat d'un passage de la liste (et non d'une lecture du magasin). */
const run = computed(() => {
  const current = store.event
  if (current?.kind !== 'result' || current.result.type !== 'result') return null

  return { result: current.result, listId: current.draft.listId, retailer: current.draft.retailer }
})
const listId = computed(() => run.value?.listId ?? null)
const result = computed(() => run.value?.result ?? null)

// Les noms des ingrédients et des produits viennent du plan : le résultat ne porte que des identifiants
const plan = useDrivePlan(
  () => listId.value ?? '',
  () => listId.value !== null,
  () => runRetailer.value,
)
const list = useShoppingList(
  () => listId.value ?? '',
  () => listId.value !== null,
)
const settings = useDriveSettings()
// Le plan est gardé tel qu'il a été lu la PREMIÈRE fois pour ce passage (DRV-747) : une fois les articles mis au panier cochés dans la liste, le back ne les
// met plus dans le plan. Une relecture (retour sur la page, focus) rendrait moins de lignes, et les noms et les libellés du récapitulatif retomberaient sur
// des identifiants.
const planAtStart = shallowRef<DrivePlan | undefined>()
watch([listId, runRetailer], () => (planAtStart.value = undefined))
watch(
  plan.data,
  (data) => {
    if (data !== undefined && planAtStart.value === undefined) planAtStart.value = data
  },
  { immediate: true },
)
const readPlan = computed(() => planAtStart.value ?? plan.data.value)
const names = computed(
  () => new Map(readPlan.value?.lines.map((line) => [line.ingredientSlug, line.ingredientName])),
)
const labels = computed(
  () =>
    new Map(
      readPlan.value?.lines.flatMap((line) =>
        [...line.products, ...line.rejected].map((product) => [
          product.retailerProductId,
          product.label,
        ]),
      ),
    ),
)

// Le magasin que la personne a choisi à la place de celui de Repas (DRV-755) : un envoi arrêté avant le moindre article, qui porte le magasin lu par l'agent. Jugé par
// `chosenStoreOf` (le drive du passage, la règle de l'enseigne) : un magasin qu'on ne peut pas croire n'est qu'un envoi arrêté, comme avant.
const chosen = computed(() =>
  run.value === null ? null : chosenStoreOf(run.value.result, run.value.retailer),
)
const switching = ref<'saving' | 'failed' | null>(null)

const counts = computed(() => (result.value ? countOutcomes(result.value) : null))
/** Des produits choisis que le panier n'a pas pris (DRV-750) : un envoi terminé n'est alors « rempli » qu'en partie (le titre de l'écran de fin de l'agent). */
const notInCart = computed(() => (result.value ? notInCartCount(result.value) : 0))
const shownCounts = computed(() => (counts.value ? visibleCounts(counts.value) : []))
// Le magasin du drive du passage ; sans liste de drives (un back plus ancien), le seul magasin des réglages
const runStore = computed(() => {
  const drives = drivesOf(settings.data.value)

  return drives.length === 0
    ? (settings.data.value?.store ?? null)
    : (drives.find((drive) => drive.id === runRetailer.value)?.store ?? null)
})
const finalizeUrl = computed(() => finalizeLink(runStore.value?.baseUrl, inApp, retailer.value))
const saved = computed(() => store.status === 'saved')
/**
 * Ce que Repas retient VRAIMENT de cet envoi : un produit choisi, un produit à ne plus proposer, un « j'en ai toujours ». Sans cela (tout était
 * déjà choisi, tout est passé, rien n'a pu être mis au panier), « Tes choix sont enregistrés » serait faux : l'écran se tait (DRV-626).
 */
const hasChoices = computed(() =>
  result.value ? countChoices(buildChoiceBatches(result.value)) > 0 : false,
)

// --- Le titre dit le résultat ; au plus trois phrases : ce qui s'est passé, ce qui est sauf, ce qu'il reste à faire ---
const headline = computed(() => {
  const current = event.value
  if (current === null) return t('driveReturn.none.title')
  if (current.kind === 'stale') return t('driveReturn.stale.title')
  if (current.kind === 'refused') return t('driveReturn.refused.title')
  if (current.kind === 'invalid') return t('driveReturn.invalid.title')
  if (result.value === null) return t('driveReturn.setup.title')
  if (chosen.value !== null) return t('driveReturn.storeSwitch.title')
  // Arrêté avant que rien ne soit mis au panier ni choisi : « rempli en partie » serait faux
  const none = counts.value !== null && counts.value.added + counts.value.chosen === 0
  if (result.value.outcome === 'partial' && none) return t('driveReturn.outcome.notFilled.title')
  if (result.value.outcome === 'completed' && notInCart.value > 0)
    return t('driveReturn.outcome.partial.title')

  return t(`driveReturn.outcome.${result.value.outcome}.title`)
})
/** Le code qui a arrêté l'envoi, s'il en dit plus que le titre : un arrêt voulu (`aborted`) n'est pas une panne. */
const stopCode = computed(() =>
  result.value?.outcome === 'aborted' ? null : (result.value?.error?.code ?? null),
)
const sentences = computed(() => {
  const current = result.value
  const known = counts.value
  if (current === null || known === null) return []
  if (current.outcome === 'completed') {
    const count = notInCart.value
    // Un produit choisi n'est pas au panier (DRV-750) : ce qui s'est passé, ce qui est sauf, ce qu'il reste à faire
    if (count > 0)
      return [
        t('driveReturn.outcome.completedSome.lead', { count }, count),
        t('driveReturn.outcome.completedSome.safe'),
        t('driveReturn.outcome.completedSome.action', { count }, count),
      ]

    return [t('driveReturn.basketReady')]
  }

  const code = stopCode.value
  const left = remaining(known)
  const safe =
    current.outcome === 'partial' && left > 0
      ? t('driveReturn.outcome.partial.safe', { count: left }, left)
      : t('driveReturn.safe')
  const lead =
    code !== null
      ? t(`driveReturn.errorCode.${code}.happened`)
      : current.outcome === 'aborted'
        ? null
        : t(`driveReturn.outcome.${current.outcome}.lead`)
  const action =
    code !== null
      ? t(`driveReturn.errorCode.${code}.action`)
      : t(`driveReturn.outcome.${current.outcome}.action`)

  return lead === null ? [safe, action] : [lead, safe, action]
})
const alarming = computed(
  () => result.value?.outcome === 'error' || result.value?.outcome === 'partial',
)

/**
 * L'unique bouton principal : reprendre l'envoi quand il est incomplet (panier prêt : c'est « Terminer la liste »). Deux pannes que reprendre ne guérit pas ont leur
 * propre action : le site de Leclerc a changé (chercher à la main) et l'application ne comprend plus Repas (la mettre à jour).
 */
const primary = computed<'manual' | 'update' | 'resume' | null>(() => {
  const current = result.value
  if (current === null) return null
  if (current.outcome === 'completed') return null
  if (stopCode.value === 'CONTRACT_CHANGED') return finalizeUrl.value ? 'manual' : null
  if (stopCode.value === 'INVALID_MESSAGE') return 'update'

  return saved.value && listId.value ? 'resume' : null
})
const incomplete = computed(() => result.value !== null && result.value.outcome !== 'completed')
/** Les autres actions restent là, mais discrètes : reprendre quand ce n'est pas l'action principale. */
const showResume = computed(
  () => incomplete.value && primary.value !== 'resume' && saved.value && listId.value !== null,
)
/** Un envoi incomplet qui a pourtant mis ou choisi des produits : le panier existe, la phrase le dit à part (l'envoi terminé le dit déjà en tête). */
const showBasketReady = computed(
  () =>
    incomplete.value &&
    primary.value !== 'manual' &&
    counts.value !== null &&
    counts.value.added + counts.value.chosen > 0,
)
/** Panier prêt : plus rien à faire sur Leclerc depuis Repas, « Terminer la liste » devient l'action principale. */
const completeReady = computed(() => result.value?.outcome === 'completed')
const primaryClass =
  'inline-flex min-h-13 items-center justify-center rounded-xl bg-primary px-7 text-lg font-bold text-on-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const linkClass =
  'inline-flex min-h-11 items-center font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const primaryButtonClass = `${primaryClass} cursor-pointer disabled:pointer-events-none disabled:opacity-50`
// Terminer ou rouvrir la liste : des boutons (ils demandent confirmation) qui se lisent comme les liens discrets autour d'eux
const linkButtonClass = `${linkClass} cursor-pointer disabled:pointer-events-none disabled:opacity-50`

// Un refus de l'application : le passage n'a pas démarré, son brouillon n'a plus lieu d'être
const refusedListId = ref<string | null>(null)

// --- Enregistrement des choix (un seul appel, sauf plus de 200 intentions) ---
const save = useSaveChoices()
/** Pourquoi l'enregistrement a échoué ; trop de demandes (429) est passager et ne perd rien : le résultat reste sur la page. */
const saveFailure = computed(() =>
  t(isRateLimited(store.error) ? 'driveReturn.save.rateLimited' : 'driveReturn.save.failed', {
    reason: messageForFailure(store.error),
  }),
)

/**
 * Les lignes que le résultat doit pouvoir expliquer, quand le brouillon n'a pas gardé le plan envoyé : le plan relu du back (celui que
 * l'écran lit déjà pour les noms). Une lecture qui échoue arrête l'enregistrement : sans plan, rien n'est mémorisé (DRV-614).
 */
async function planData() {
  const data =
    readPlan.value ?? (await plan.refetch({ cancelRefetch: false, throwOnError: true })).data
  if (data === undefined) throw new Error('plan')

  return data
}

const expectedLines = async () => expectedFromPlan(await planData())

// --- Cocher dans la liste ce qui est au panier (DRV-747) ---
const markBasket = useMarkBasketLines()
/** Le passage dont l'appel est parti (une seule fois : « Réessayer l'enregistrement » ne le renvoie pas) et celui dont les coches sont écrites. */
const basketSent = ref<string | null>(null)
const basketTicked = ref<string | null>(null)

/**
 * Une fois, jamais bloquant : sans lui l'enregistrement des choix n'est pas gêné (un `404`, un `409` ou le réseau coûtent seulement des coches), et
 * rien n'est dit s'il échoue. Le résultat est déjà recoupé avec le plan : un faux résultat ne coche que des lignes que le plan explique. Aucun appel
 * sans article au panier (un arrêt avant le moindre ajout) : le back refuse une liste vide.
 */
async function tickBasket(result: ResultMessage, id: string) {
  if (basketSent.value === result.runId) return
  basketSent.value = result.runId
  const slugs = basketSlugsOf(result)
  if (slugs.length === 0) return
  try {
    await markBasket.mutateAsync({ listId: id, slugs })
    basketTicked.value = result.runId
  } catch {
    // Les articles restent non cochés : la liste dit toujours ce qu'il reste à voir
  }
}

async function persist() {
  const first = run.value
  if (first === null) return
  const storeId = first.result.store?.id
  // Un passage de la liste porte toujours son magasin ; sans lui, mémoriser des choix pour le mauvais magasin serait pire que rien
  if (storeId === undefined) return store.failed(new Error('Résultat sans magasin'))
  store.saving()
  try {
    // Le résultat n'est enregistré qu'une fois recoupé avec le plan envoyé : une ligne que le plan n'explique pas est ignorée (DRV-614)
    if (!store.checked) store.check(await expectedLines())
    const current = run.value
    if (current === null) return
    void tickBasket(current.result, current.listId)
    // Le libellé et le contenu d'un produit connu dont la personne a donné la contenance (DRV-652) viennent du plan : il n'est lu que pour cela
    const known = current.result.lines.some(
      (line) => line.outcome === 'ADDED' && line.packSize !== undefined,
    )
      ? knownProductsOf(await planData())
      : undefined
    // Le drive du passage (celui du brouillon, DRV-710) dit où les choix s'enregistrent et si les produits choisis portent une offre (DRV-722)
    const drive = current.retailer
    await save.mutateAsync({
      storeId,
      retailer: drive,
      batches: buildChoiceBatches(current.result, known, retailerOf(drive)),
    })
    driveBridge.clearDraft()
    store.saved()
  } catch (error) {
    // Le résultat reste en mémoire et le brouillon aussi : on peut réessayer
    store.failed(error)
  }
}

const saveSettings = useSaveDriveSettings()

/**
 * Retient le magasin que la personne a choisi, puis reprend l'envoi (DRV-755) : le magasin est enregistré par le même `PUT /drive/settings` que la lecture du magasin des
 * réglages, le passage fini est oublié (son brouillon : l'envoi suivant a un autre identifiant), et l'écran d'envoi rouvre le drive tout seul avec un plan REFAIT pour ce
 * magasin (les produits habituels d'un autre magasin ne sont pas ceux de celui-ci : rien n'est deviné, rien n'est écrit avant que ce plan soit prêt). La personne n'a rien
 * de plus à toucher ; sur un échec elle garde sa liste et peut réessayer.
 */
async function adoptChosenStore() {
  const found = chosen.value
  const id = listId.value
  if (found === null || id === null || switching.value === 'saving') return
  switching.value = 'saving'
  try {
    await saveSettings.mutateAsync({ store: found.store, retailer: found.retailer })
    driveBridge.clearDraft()
    await router.replace({
      name: 'drive-send',
      params: { listId: id },
      query: { ouvrir: '1', drive: found.retailer },
    })
    store.clear()
  } catch {
    switching.value = 'failed'
  }
}

onMounted(() => {
  if (chosen.value !== null) return void adoptChosenStore()
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
const reasonOf = (code: string) => t(`driveReturn.errorCode.${code}.happened`)

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
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <RouterLink
      v-if="listId"
      :to="{ name: 'shopping-list-detail', params: { id: listId } }"
      :class="linkClass + ' self-start'"
    >
      {{ t('driveReturn.backToList') }}
    </RouterLink>
    <RouterLink v-else :to="{ name: 'shopping-lists' }" :class="linkClass + ' self-start'">
      {{ t('driveReturn.allLists') }}
    </RouterLink>

    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">{{ headline }}</h1>

    <!-- Rien à montrer, résultat d'un autre envoi, refus ou réponse mal formée de l'application -->
    <section
      v-if="event === null"
      role="status"
      class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
    >
      <p class="max-w-prose text-muted">{{ t('driveReturn.none.help') }}</p>
      <RouterLink :to="{ name: 'shopping-lists' }" :class="primaryClass">
        {{ t('driveReturn.none.open') }}
      </RouterLink>
    </section>

    <section
      v-else-if="event.kind === 'stale'"
      role="status"
      class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
    >
      <p class="max-w-prose text-muted">{{ t('driveReturn.stale.help') }}</p>
    </section>

    <section
      v-else-if="event.kind === 'refused'"
      role="alert"
      class="flex flex-col items-start gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-on-danger-soft"
    >
      <p class="max-w-prose text-lg">{{ t('driveReturn.refused.help') }}</p>
      <RouterLink
        v-if="refusedListId"
        :to="{ name: 'drive-send', params: { listId: refusedListId } }"
        :class="primaryClass"
      >
        {{ t('driveReturn.refused.backToSend') }}
      </RouterLink>
      <DriveFold :label="t('driveReturn.details')" class="self-stretch">
        <p class="text-sm break-words">{{ t('driveReturn.errorDetails', { code: event.code }) }}</p>
      </DriveFold>
    </section>

    <section
      v-else-if="event.kind === 'invalid'"
      role="alert"
      class="flex flex-col items-start gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-on-danger-soft"
    >
      <p class="max-w-prose text-lg">{{ t('driveReturn.invalid.help') }}</p>
      <RouterLink :to="{ name: 'drive-help', hash: '#mise-a-jour' }" :class="primaryClass">
        {{ t('driveReturn.invalid.update') }}
      </RouterLink>
      <DriveFold
        v-if="event.detail !== null"
        :label="t('driveReturn.details')"
        class="self-stretch"
      >
        <p class="text-sm break-words">
          {{ t('driveReturn.invalid.detail', { detail: event.detail }) }}
        </p>
      </DriveFold>
    </section>

    <section
      v-else-if="result === null"
      role="status"
      class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
    >
      <p class="max-w-prose text-muted">{{ t('driveReturn.setup.help') }}</p>
      <UiLinkButton variant="secondary" :to="{ name: 'drive-settings' }">
        {{ t('driveReturn.setup.settings') }}
      </UiLinkButton>
    </section>

    <!-- Le magasin choisi à la place de celui de Repas (DRV-755) : Repas le retient et reprend l'envoi tout seul -->
    <section
      v-else-if="chosen !== null"
      :role="switching === 'failed' ? 'alert' : 'status'"
      :class="[
        'flex flex-col items-start gap-3 rounded-2xl px-5 py-4',
        switching === 'failed' ? 'bg-danger-soft text-on-danger-soft' : 'bg-soft',
      ]"
    >
      <p class="max-w-prose text-lg">
        {{
          switching === 'failed'
            ? t('driveReturn.storeSwitch.failed')
            : t('driveReturn.storeSwitch.help')
        }}
      </p>
      <UiButton v-if="switching === 'failed'" :disabled="!online" @click="adoptChosenStore">
        {{ t('driveReturn.storeSwitch.retry') }}
      </UiButton>
    </section>

    <!-- Le résultat d'un envoi : une phrase, une action principale, ce qui existe, puis les détails repliés -->
    <template v-else-if="result && counts">
      <div
        role="status"
        :class="[
          'rounded-2xl px-5 py-4',
          alarming ? 'bg-danger-soft text-on-danger-soft' : 'bg-soft',
        ]"
      >
        <p class="max-w-prose text-lg">{{ sentences.join(' ') }}</p>
      </div>

      <p v-if="showBasketReady" class="max-w-prose text-lg font-semibold">
        {{ t('driveReturn.basketReady') }}
      </p>

      <p
        v-if="basketTicked !== null && basketTicked === result.runId"
        role="status"
        class="max-w-prose text-muted"
      >
        {{ t('driveReturn.basketTicked') }}
      </p>

      <p v-if="store.status === 'saving' && hasChoices" role="status" class="text-muted">
        {{ t('driveReturn.save.saving') }}
      </p>
      <p
        v-else-if="store.status === 'saved' && hasChoices"
        role="status"
        class="font-semibold text-primary"
      >
        {{ t('driveReturn.save.saved') }}
      </p>
      <div v-else-if="store.status === 'failed'" class="flex flex-col items-start gap-3">
        <p
          role="alert"
          class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
        >
          {{ saveFailure }}
        </p>
        <UiButton variant="secondary" :disabled="!online" @click="persist">
          {{ t('driveReturn.save.retry') }}
        </UiButton>
      </div>

      <section class="flex flex-col items-start gap-3">
        <a
          v-if="primary === 'manual' && finalizeUrl"
          :href="retailer.homeUrl"
          :target="inApp ? undefined : '_blank'"
          :rel="inApp ? undefined : 'noopener noreferrer'"
          :class="primaryClass"
        >
          {{ t('driveReturn.actions.manual') }}
          <span v-if="!inApp" class="sr-only"> ({{ t('driveReturn.actions.newTab') }})</span>
        </a>
        <RouterLink
          v-else-if="primary === 'resume' && listId"
          :to="{ name: 'drive-send', params: { listId }, query: { ouvrir: '1' } }"
          :class="primaryClass"
        >
          {{ t('driveReturn.actions.resume') }}
        </RouterLink>
        <RouterLink
          v-else-if="primary === 'update'"
          :to="{ name: 'drive-help', hash: '#mise-a-jour' }"
          :class="primaryClass"
        >
          {{ t('driveReturn.actions.update') }}
        </RouterLink>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <RouterLink
            v-if="showResume && listId"
            :to="{ name: 'drive-send', params: { listId }, query: { ouvrir: '1' } }"
            :class="linkClass"
          >
            {{ t('driveReturn.actions.resume') }}
          </RouterLink>
          <button
            type="button"
            :class="completeReady ? primaryButtonClass : linkButtonClass"
            :disabled="!online"
            @click="completing = true"
          >
            {{ t('driveReturn.actions.complete') }}
          </button>
          <button
            type="button"
            :class="linkButtonClass"
            :disabled="!online || list.data.value === undefined"
            @click="reopening = true"
          >
            {{ t('driveReturn.actions.reopen') }}
          </button>
        </div>
        <p v-if="!online" class="font-semibold">{{ t('driveReturn.actions.offline') }}</p>
      </section>

      <dl
        v-if="shownCounts.length > 0"
        :aria-label="t('driveReturn.counts.label')"
        class="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <div
          v-for="count in shownCounts"
          :key="count.key"
          class="flex flex-col-reverse rounded-2xl bg-soft px-4 py-2"
        >
          <dt class="text-sm text-muted">{{ t(`driveReturn.counts.${count.key}`) }}</dt>
          <dd class="font-display text-xl font-bold">{{ count.value }}</dd>
        </div>
      </dl>

      <!-- Tout ce qui sert à vérifier ou à dépanner : replié, le code n'est lu que là -->
      <DriveFold
        v-if="rows.length > 0 || store.ignored > 0 || result.error"
        :label="t('driveReturn.details')"
      >
        <p v-if="result.error" class="text-sm break-words text-muted">
          {{ t('driveReturn.errorDetails', { code: result.error.code }) }}
          <template v-if="result.error.message"> · {{ result.error.message }}</template>
        </p>
        <p v-if="store.ignored > 0" class="text-sm text-muted">
          {{ t('driveReturn.ignored', { count: store.ignored }, store.ignored) }}
        </p>
        <ul v-if="rows.length > 0" class="flex flex-col gap-3">
          <li
            v-for="row in rows"
            :key="row.slug"
            class="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4"
          >
            <p class="font-bold break-words">{{ row.name }}</p>
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
      </DriveFold>
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
