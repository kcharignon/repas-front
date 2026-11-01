<script setup lang="ts">
import { useRetailerI18n } from './useRetailerI18n'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { LIMITS } from '@drive-protocol'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import { useReopenShoppingList, useShoppingList } from '@/features/shopping-lists/queries'
import { messageForFailure } from '@/notifications/failures'
import { useOnline } from '@/offline/useOnline'
import { DriveBridgeError, driveBridge } from './bridge'
import type { RunDraft } from './bridge'
import { isDriveAppVersionEnough, isPackSizeAppVersion, isRayonHintsAppVersion } from './appVersion'
import { buildPlanMessage, effectiveStatus } from './buildPlanMessage'
import type { LineChange } from './buildPlanMessage'
import DriveEstimate from './DriveEstimate.vue'
import DriveFold from './DriveFold.vue'
import DriveSendFailure from './DriveSendFailure.vue'
import DriveSendLine from './DriveSendLine.vue'
import DriveSendTiles from './DriveSendTiles.vue'
import { driveKeys, useDrivePlan, useDriveSettings, useRememberLastRetailer } from './queries'
import { appServes, retailerOf, RETAILERS } from './retailers'
import type { RetailerId } from './retailers'
import { sendChoice } from './sendChoice'
import { sendSummary } from './sendSummary'

const route = useRoute()
const router = useRouter()
const online = useOnline()
const queryClient = useQueryClient()

const listId = computed(() => String(route.params.listId))

// --- Le drive de cet envoi (DRV-710) ---
// La règle de choix (R1 à R5) est calculée par le back et lue dans `selection` des réglages : l'écran n'en recopie rien (`sendChoice`).
// Les réglages sont lus (ou ont échoué : le plan se demande alors sans drive, le back prend le sien) AVANT le plan, qui se demande pour un drive.
const settings = useDriveSettings()
// « Lus » une fois pour toutes : une relecture en échec repasse en attente (`isPending`), et le plan ne doit pas se redemander pour autant
const settingsRead = ref(!settings.isPending.value)
watch(
  () => settings.isPending.value,
  (pending) => {
    if (!pending) settingsRead.value = true
  },
)
/**
 * Le drive que l'adresse porte (`drive`, DRV-755) : la personne vient de retenir son magasin dans CE drive pendant son envoi. Elle l'a déjà choisi : il est coché, et la
 * question « Où envoyer ta liste ? » ne se repose pas. Consommé tout de suite (retiré de l'adresse) ; un identifiant qui n'est pas un drive connu est ignoré.
 */
const carried = ref<RetailerId | null>(
  RETAILERS.find((drive) => drive.id === route.query.drive)?.id ?? null,
)
if (route.query.drive !== undefined)
  void router.replace({ query: { ...route.query, drive: undefined } })
/** Le drive touché sur l'écran (une tuile) ; `null` : celui que la règle désigne. */
const picked = ref<RetailerId | null>(carried.value)
const draft = ref<RunDraft | null>(driveBridge.loadDraft())
/** Un passage de cette liste attend son résultat (le brouillon survit à un rechargement de la page). */
const waiting = computed(() => draft.value !== null && draft.value.listId === listId.value)
/** Un passage d'une autre liste est en cours : un seul à la fois. */
const elsewhere = computed(() => draft.value !== null && draft.value.listId !== listId.value)

const choice = computed(() =>
  sendChoice({
    settings: settings.data.value,
    picked: picked.value,
  }),
)
/** Le drive de cet envoi : celui du passage en attente (il se rouvre là où il a été ouvert), sinon celui que la règle ou la tuile touchée désignent. */
const retailerId = computed<RetailerId | undefined>(() =>
  waiting.value ? draft.value?.retailer : choice.value.retailer,
)

const { t } = useRetailerI18n(() => retailerId.value)
const plan = useDrivePlan(
  () => listId.value,
  () => settingsRead.value,
  () => retailerId.value,
)
/**
 * Le plan LU pour cet écran (DRV-747) : le plan change entre deux ouvertures (le passage coche les articles mis au panier, le back les retire du plan), or
 * l'écran du récapitulatif en a lu un sous la même clé. Une relecture est lancée à chaque ouverture, mais tant qu'elle n'a rien rendu la requête garde ce
 * plan plus ancien : on ne l'utilise pas, il ferait repartir au drive des articles déjà au panier. `dataUpdatedAt` ne bouge que sur une donnée lue.
 */
const mountedAt = Date.now()
const planData = computed(() =>
  plan.dataUpdatedAt.value >= mountedAt ? plan.data.value : undefined,
)
const planFailed = computed(() => plan.isError.value && planData.value === undefined)
const reopen = useReopenShoppingList()
const rememberLast = useRememberLastRetailer()

// Dans l'application Repas, le pont natif existe ; dans un navigateur ordinaire, seul le mode assisté est possible.
const inApp = driveBridge.isAvailable()
const driveUsable = ref(true)
// La version de l'application (DRV-640) : tant qu'elle n'a pas répondu on attend ; trop ancienne ou inconnue, l'envoi n'est pas proposé
const appCheck = ref<'checking' | 'enough' | 'tooOld'>(inApp ? 'checking' : 'enough')
const tooOld = computed(() => appCheck.value === 'tooOld')
/** Les drives que l'application annonce servir (`app.info.retailers`, DRV-707) ; absent : le drive d'avant (`appServes`). */
const appRetailers = ref<readonly string[] | undefined>(undefined)
/** L'application a répondu et ne connaît pas le drive de cet envoi : la phrase de mise à jour nomme ce drive, les autres restent proposés. */
const unserved = computed(
  () =>
    inApp &&
    appCheck.value !== 'checking' &&
    retailerId.value !== undefined &&
    !appServes(appRetailers.value, retailerId.value),
)
// L'agent de l'application connaît-il les rayons conseillés (DRV-642) ? Sinon le plan part sans eux : un agent plus ancien refuse un plan qui porte une clé qu'il ne connaît pas.
const agentKnowsRayons = ref(false)
/** L'agent de l'application connaît-il la contenance d'un produit dans l'unité de la liste (DRV-652) ? Sinon le plan ne la porte pas. */
const agentKnowsPackSize = ref(false)
/** Mode assisté : un lien de recherche par article, sans choix de produit (hors de l'application, ou dans une application trop ancienne). */
const assisted = computed(() => !inApp || tooOld.value || unserved.value)

/**
 * « Une intention = un clic » : arrivé ici par « Envoyer au drive » (et sa fenêtre de confirmation) ou par « Reprendre l'envoi », l'utilisateur a
 * déjà dit qu'il veut remplir son panier. L'adresse porte alors `ouvrir` : le drive s'ouvre dès que le plan est prêt, sans redemander. La demande est
 * CONSOMMÉE tout de suite (retirée de l'adresse) : un rechargement ou un retour arrière n'ouvre rien, et il n'y a pas de boucle possible. Tout ce
 * qui demande une décision ou une explication (erreur, hors connexion, hors application, application trop ancienne, drive inutilisable, autre
 * envoi en cours, liste sans article) garde l'écran.
 */
const opening = ref(route.query.ouvrir !== undefined)
if (opening.value) void router.replace({ query: { ...route.query, ouvrir: undefined } })

const changes = ref<Record<string, LineChange | undefined>>({})
const failure = ref<{ text: string; update: boolean } | null>(null)
const reopening = ref(false)
/** La question « Où envoyer ta liste ? » est posée : plusieurs drives configurés (le drive habituel n'est que la présélection). Pas en attente d'un résultat, ni hors de l'application. */
const asking = computed(
  () => inApp && !tooOld.value && !waiting.value && choice.value.tiles.length > 0,
)

// Une adresse avec « lignes » ne reprend que les articles nommés. Le récapitulatif ne la propose plus (DRV-622 : « Reprendre l'envoi » reprend toute la liste) ; elle reste lue pour les anciens liens
const only = computed(() => {
  const names = route.query.lignes
  return typeof names === 'string' && names !== '' ? new Set(names.split(',')) : null
})
const visible = computed(() => {
  const data = planData.value
  if (data === undefined || only.value === null) return data

  return { ...data, lines: data.lines.filter((line) => only.value?.has(line.ingredientSlug)) }
})
const lines = computed(() => visible.value?.lines ?? [])
/** Le plan est lu et n'a aucune ligne : tout est coché, rien ne part (hors attente d'un résultat, où l'écran dit autre chose). */
const nothingToSend = computed(
  () => visible.value !== undefined && lines.value.length === 0 && !waiting.value,
)
// Une phrase de synthèse construite avec les comptes ; elle suit les choix de l'utilisateur (« Choisir un autre produit », « Pas cette fois »)
const summary = computed(() => {
  const statuses = lines.value.map((line) => effectiveStatus(line, changes.value))
  const count = (status: string) => statuses.filter((candidate) => candidate === status).length

  return sendSummary(t, {
    known: count('KNOWN'),
    new: count('NEW'),
    haveAtHome: count('HAVE_AT_HOME'),
    skipped: count('SKIP'),
  })
})
/** Au-delà de ce nombre d'articles la liste est repliée : la seule décision de l'écran est « Remplir mon panier ». */
const FOLD_ABOVE = 6
// Hors de l'application la liste EST l'écran (un lien de recherche par article) : elle reste ouverte
const folded = computed(() => !assisted.value && lines.value.length > FOLD_ABOVE)

const storeName = computed(() => {
  const store = planData.value?.store
  if (store === undefined) return ''

  return store.label === null || store.label === undefined
    ? t('driveSend.storeEnding', { ending: store.id.slice(-3) })
    : t('driveSend.store', { label: store.label })
})
// Le repli « Chercher à la main » : la recherche du site du drive de CE plan (l'adresse est celle de son enseigne)
const searchUrl = (query: string): string =>
  retailerOf(planData.value?.retailer ?? retailerId.value).searchUrl(
    planData.value?.store.baseUrl ?? '',
    query,
  )

watch(listId, () => (changes.value = {}))

// Sans magasin enregistré (pour ce drive), le plan est refusé (409) : on mène à « Choisis ton magasin », qui nous rend la liste
watch(
  () => plan.error.value,
  (error) => {
    if (
      error instanceof ApiError &&
      (error.message === 'DRIVE_NOT_CONFIGURED' ||
        error.message === 'DRIVE_RETAILER_NOT_CONFIGURED')
    )
      void router.replace({
        name: 'drive-settings',
        query: { magasin: 'requis', retour: 'envoi', liste: listId.value },
      })
  },
  { immediate: true },
)

onMounted(() => {
  if (!inApp) return
  // L'application sait si le drive est utilisable ; si elle ne répond pas, le lancement le dira
  driveBridge.info().then(
    (info) => {
      driveUsable.value = info.drive
      appRetailers.value = info.retailers
      appCheck.value = isDriveAppVersionEnough(info.version) ? 'enough' : 'tooOld'
      agentKnowsRayons.value = isRayonHintsAppVersion(info.version)
      agentKnowsPackSize.value = isPackSizeAppVersion(info.version)
    },
    // Une application qui ne dit pas sa version est trop ancienne
    () => (appCheck.value = 'tooOld'),
  )
})

const planError = computed(() => (planFailed.value ? messageForFailure(plan.error.value) : null))

// Fonction coupée (retour arrière) : le plan répond « pas disponible », mais une liste restée envoyée doit pouvoir se rouvrir (la
// réouverture, elle, reste permise interrupteur coupé). Le plan n'a pas pu donner la version : on lit la liste, et seulement alors.
const driveOff = computed(
  () =>
    planFailed.value &&
    plan.error.value instanceof ApiError &&
    plan.error.value.message === 'DRIVE_DISABLED',
)
const sentList = useShoppingList(
  () => listId.value,
  () => driveOff.value,
)
const canReopenWhenOff = computed(() => driveOff.value && sentList.data.value?.isSent === true)
/** La confirmation : celle de l'écran de la liste quand le drive est coupé, celle de l'attente du retour sinon. */
const reopenCopy = computed(() =>
  driveOff.value
    ? {
        title: t('shoppingList.reopenTitle'),
        description: t('shoppingList.reopenHelp'),
        label: t('shoppingList.reopen'),
      }
    : {
        title: t('driveSend.waiting.reopenTitle'),
        description: t('driveSend.waiting.reopenHelp'),
        label: t('driveSend.waiting.reopenList'),
      },
)

/** Ce qui s'est passé, ce qui est sauf, une action ; `update` : l'action est de mettre l'application à jour, et l'écran en donne le bouton. */
function failureOf(error: unknown): { text: string; update: boolean } {
  if (!(error instanceof DriveBridgeError))
    return { text: t('driveSend.failure.invalidPlan'), update: false }
  switch (error.code) {
    case 'INVALID_PLAN':
      return {
        text:
          error.detail === 'lines'
            ? t('driveSend.failure.tooManyLines', { max: LIMITS.lines })
            : t('driveSend.failure.invalidPlan'),
        update: false,
      }
    case 'TOO_LARGE':
      return { text: t('driveSend.failure.tooLarge'), update: false }
    case 'SEND_FAILED':
      return { text: t('driveSend.failure.sendFailed'), update: false }
    default:
      return { text: t('driveSend.failure.appRefused'), update: true }
  }
}

// Le plan est prêt, l'application a répondu : on ouvre le drive, une seule fois ; au moindre obstacle on garde l'écran (la raison s'y lit).
watch(
  () =>
    [
      opening.value,
      inApp,
      online.value,
      elsewhere.value,
      planFailed.value,
      visible.value,
      appCheck.value,
      driveUsable.value,
      asking.value,
      unserved.value,
    ] as const,
  ([wanted, app, isOnline, other, failed, data, check, usable, question, unknown]) => {
    if (!wanted) return
    // Un obstacle déjà connu : l'écran reste, avec sa raison. La question « Où envoyer ta liste ? » en est une (R4) : la personne choisit, sauf si elle vient de le faire
    // (le drive porté par l'adresse, DRV-755).
    if (!app || !isOnline || other || failed || (question && carried.value === null)) {
      opening.value = false
      return
    }
    // Pas encore de plan ni de réponse de l'application : on attend
    if (data === undefined || check === 'checking') return
    opening.value = false
    if (check === 'tooOld' || unknown || !usable || data.lines.length === 0) return
    void openDrive()
  },
  { immediate: true },
)

/** Combien de temps l'ouverture attend l'écriture de « dernier drive » : une erreur ou une lenteur ne perd qu'une présélection, jamais l'envoi. */
const REMEMBER_WAIT_MS = 1500

/** Attend la fin d'une écriture, qu'elle réussisse ou non, mais pas au-delà de `ms`. */
const settleWithin = (work: Promise<unknown>, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    work.then(done, done)
  })

/** Un passage est en train de se lancer (l'écriture de « dernier drive » est en cours) : un second toucher ne le double pas. */
const starting = ref(false)

/**
 * Lance le drive ; en attente d'un résultat, rouvre le même passage (même `runId`). Quand plusieurs drives sont configurés, le drive ouvert est retenu
 * (`PUT /drive/last-retailer`) AVANT `drive.start` : un envoi interrompu compte aussi. Avec un seul drive il n'y a rien à retenir, rien ne part.
 */
async function openDrive() {
  const data = visible.value
  if (data === undefined || starting.value) return
  failure.value = null
  const remember = draft.value === null && choice.value.named
  if (remember) {
    starting.value = true
    await settleWithin(rememberLast.mutateAsync(data.retailer), REMEMBER_WAIT_MS)
  }
  try {
    const runId = draft.value?.runId ?? crypto.randomUUID()
    draft.value = driveBridge.startRun(
      buildPlanMessage(data, changes.value, runId, {
        rayonHints: agentKnowsRayons.value,
        packSize: agentKnowsPackSize.value,
      }),
      listId.value,
    )
    // Les réglages portent `lastUsedRetailer` et la présélection : ils sont relus pour le prochain envoi
    if (remember) void queryClient.invalidateQueries({ queryKey: driveKeys.settings })
  } catch (error) {
    if (error instanceof DriveBridgeError && error.code === 'RUN_IN_PROGRESS')
      draft.value = driveBridge.loadDraft()
    else failure.value = failureOf(error)
  } finally {
    starting.value = false
  }
}

/** Abandonne le passage en cours : l'application est prévenue (si elle est là), le brouillon part. */
function abandon() {
  try {
    driveBridge.cancel()
  } catch {
    // Hors de l'application, ou pont indisponible : il n'y a rien à arrêter
  }
  driveBridge.clearDraft()
  draft.value = null
  failure.value = null
}

function confirmReopenList() {
  const version = planData.value?.listVersion ?? sentList.data.value?.version
  if (version === undefined) return
  reopen.mutate(
    { id: listId.value, version },
    {
      onSuccess: async () => {
        abandon()
        await router.push({ name: 'shopping-list-detail', params: { id: listId.value } })
      },
      onSettled: () => (reopening.value = false),
    },
  )
}
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
    <RouterLink
      :to="{ name: 'shopping-list-detail', params: { id: listId } }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline"
    >
      {{ t('driveSend.back') }}
    </RouterLink>

    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ nothingToSend ? t('driveSend.titleNothing') : t('driveSend.title') }}
    </h1>

    <!-- Plusieurs drives configurés : où envoyer ? Le drive habituel, sinon le dernier utilisé, est coché. -->
    <DriveSendTiles
      v-if="asking"
      :drives="choice.tiles"
      :selected="retailerId"
      @choose="picked = $event"
    />

    <!-- L'intention est donnée (« Envoyer au drive », « Reprendre l'envoi ») : le drive s'ouvre sans autre geste -->
    <p v-if="opening" role="status" class="text-xl font-semibold">{{ t('driveSend.opening') }}</p>

    <!-- Un passage d'une autre liste n'est pas terminé -->
    <section
      v-else-if="elsewhere && draft"
      role="status"
      class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
    >
      <h2 class="font-display text-xl font-bold">{{ t('driveSend.elsewhere.title') }}</h2>
      <p class="text-muted">{{ t('driveSend.elsewhere.help') }}</p>
      <div class="flex flex-wrap gap-2">
        <UiLinkButton :to="{ name: 'drive-send', params: { listId: draft.listId } }">
          {{ t('driveSend.elsewhere.see') }}
        </UiLinkButton>
        <UiButton variant="secondary" @click="abandon">
          {{ t('driveSend.elsewhere.abandon') }}
        </UiButton>
      </div>
    </section>

    <template v-else-if="planData">
      <p v-if="!asking" class="text-muted">{{ storeName }}</p>
      <p v-if="only !== null && !waiting" class="flex flex-wrap items-center gap-x-3 font-semibold">
        {{ t('driveSend.retryOnly', { count: lines.length }, lines.length) }}
        <RouterLink
          :to="{ name: 'drive-send', params: { listId } }"
          class="inline-flex min-h-11 items-center font-bold text-primary underline"
        >
          {{ t('driveSend.showAll') }}
        </RouterLink>
      </p>

      <!-- En attente du résultat du drive -->
      <section
        v-if="waiting"
        role="status"
        class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
      >
        <h2 class="font-display text-xl font-bold">{{ t('driveSend.waiting.title') }}</h2>
        <p class="text-muted">{{ t('driveSend.waiting.help') }}</p>
        <div class="flex flex-wrap gap-2">
          <UiButton :disabled="!online || !inApp" @click="openDrive">
            {{ t('driveSend.reopenDrive') }}
          </UiButton>
          <UiButton variant="secondary" @click="abandon">
            {{ t('driveSend.waiting.restart') }}
          </UiButton>
          <UiButton variant="ghost" :disabled="!online" @click="reopening = true">
            {{ t('driveSend.waiting.reopenList') }}
          </UiButton>
        </div>
        <p class="text-sm text-muted">{{ t('driveSend.waiting.restartHelp') }}</p>
        <p v-if="!online" class="font-semibold">{{ t('driveSend.offline') }}</p>
        <DriveSendFailure v-if="failure" :failure="failure" />
      </section>

      <template v-else>
        <section
          v-if="!inApp"
          class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
        >
          <h2 class="font-display text-xl font-bold">{{ t('driveSend.notInApp.title') }}</h2>
          <p class="text-muted">{{ t('driveSend.notInApp.help') }}</p>
          <UiLinkButton variant="secondary" :to="{ name: 'drive-help' }">
            {{ t('driveSend.notInApp.install') }}
          </UiLinkButton>
        </section>
        <!-- Application trop ancienne : on n'ouvre ni Leclerc ni l'agent, une phrase et un bouton ; les liens de recherche restent plus bas -->
        <section
          v-else-if="tooOld"
          role="status"
          class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
        >
          <p class="max-w-prose text-xl font-semibold">{{ t('driveSend.appTooOld.text') }}</p>
          <UiLinkButton :to="{ name: 'drive-help' }">
            {{ t('driveSend.appTooOld.update') }}
          </UiLinkButton>
        </section>
        <!-- L'application est à jour pour le drive d'avant mais ne connaît pas celui-ci : la phrase le nomme, les autres drives restent proposés -->
        <section
          v-else-if="unserved"
          role="status"
          class="flex flex-col items-start gap-3 rounded-2xl bg-soft px-5 py-4"
        >
          <p class="max-w-prose text-xl font-semibold">{{ t('driveSend.appTooOld.textNamed') }}</p>
          <UiLinkButton :to="{ name: 'drive-help' }">
            {{ t('driveSend.appTooOld.update') }}
          </UiLinkButton>
        </section>
        <section
          v-else-if="!driveUsable"
          role="alert"
          class="flex flex-col items-start gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-on-danger-soft"
        >
          <h2 class="font-display text-xl font-bold">{{ t('driveSend.driveUnusable.title') }}</h2>
          <p>{{ t('driveSend.driveUnusable.help') }}</p>
          <UiLinkButton variant="secondary" :to="{ name: 'drive-help' }">
            {{ t('driveSend.driveUnusable.aid') }}
          </UiLinkButton>
        </section>
        <!-- Une phrase de synthèse, l'unique décision : le bouton, visible sans défiler (DRV-628 : plus d'explication) -->
        <p v-else-if="summary !== ''" class="max-w-prose text-xl font-semibold">{{ summary }}</p>

        <section v-if="inApp && !tooOld" class="flex flex-col items-start gap-3">
          <!-- Un plan sans ligne : tout est déjà coché (les lignes cochées ne partent pas, DRV-747), il n'y a rien à remplir et la phrase plus bas le dit -->
          <UiButton
            v-if="!unserved && lines.length > 0"
            size="lg"
            :disabled="!online || !driveUsable || appCheck === 'checking' || starting"
            @click="openDrive"
          >
            <svg
              class="size-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 8H6.2" />
              <circle cx="9.5" cy="19" r="1.4" />
              <circle cx="17" cy="19" r="1.4" />
            </svg>
            {{ choice.named ? t('driveSend.openNamed') : t('driveSend.open') }}
          </UiButton>
          <p v-if="!online" class="font-semibold">{{ t('driveSend.offline') }}</p>
          <DriveSendFailure v-if="failure" :failure="failure" />
        </section>

        <DriveEstimate v-if="lines.length > 0" :list-id="listId" :retailer="retailerId" />

        <section class="flex flex-col gap-3">
          <p v-if="lines.length === 0" class="max-w-prose text-xl font-semibold">
            {{ t('driveSend.emptyPlan') }}
          </p>
          <DriveFold v-else-if="folded" :label="t('driveSend.showArticles')">
            <ul class="flex flex-col gap-3">
              <DriveSendLine
                v-for="line in lines"
                :key="line.ingredientSlug"
                :line="line"
                :change="changes[line.ingredientSlug]"
                :assisted="assisted"
                :search-url="searchUrl(line.searchQuery)"
                :retailer="retailerId"
                @change="changes[line.ingredientSlug] = $event"
              />
            </ul>
          </DriveFold>
          <template v-else>
            <h2 class="font-display text-xl font-bold">{{ t('driveSend.articles') }}</h2>
            <ul class="flex flex-col gap-3">
              <DriveSendLine
                v-for="line in lines"
                :key="line.ingredientSlug"
                :line="line"
                :change="changes[line.ingredientSlug]"
                :assisted="assisted"
                :search-url="searchUrl(line.searchQuery)"
                :retailer="retailerId"
                @change="changes[line.ingredientSlug] = $event"
              />
            </ul>
          </template>
        </section>
      </template>
    </template>

    <template v-else-if="planError !== null">
      <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft">
        {{ planError }}
      </p>
      <p v-if="canReopenWhenOff" class="max-w-prose text-muted">{{ t('driveSend.offHelp') }}</p>
      <div class="flex flex-wrap gap-2">
        <UiButton v-if="canReopenWhenOff" :disabled="!online" @click="reopening = true">
          {{ t('shoppingList.reopen') }}
        </UiButton>
        <UiButton variant="secondary" @click="plan.refetch()">{{ t('driveSend.retry') }}</UiButton>
        <UiButton v-if="waiting" variant="ghost" @click="abandon">
          {{ t('driveSend.elsewhere.abandon') }}
        </UiButton>
      </div>
      <p v-if="canReopenWhenOff && !online" class="font-semibold">
        {{ t('driveSend.offHelpOffline') }}
      </p>
    </template>

    <p v-else class="text-muted" role="status">{{ t('driveSend.loading') }}</p>

    <UiConfirmDialog
      v-model:open="reopening"
      variant="primary"
      :title="reopenCopy.title"
      :description="reopenCopy.description"
      :confirm-label="reopenCopy.label"
      :pending="reopen.isPending.value"
      @confirm="confirmReopenList"
    />
  </main>
</template>
