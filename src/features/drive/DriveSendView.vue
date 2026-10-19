<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { LIMITS } from '@drive-protocol'

import { ApiError } from '@/api'
import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import { useReopenShoppingList, useShoppingList } from '@/features/shopping-lists/queries'
import { messageForFailure } from '@/notifications/failures'
import { useOnline } from '@/offline/useOnline'
import { DriveBridgeError, driveBridge } from './bridge'
import type { RunDraft } from './bridge'
import { buildPlanMessage, effectiveStatus } from './buildPlanMessage'
import type { LineChange } from './buildPlanMessage'
import DriveEstimate from './DriveEstimate.vue'
import DriveFold from './DriveFold.vue'
import DriveSendFailure from './DriveSendFailure.vue'
import DriveSendLine from './DriveSendLine.vue'
import { useDrivePlan } from './queries'
import { sendSummary } from './sendSummary'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const online = useOnline()

const listId = computed(() => String(route.params.listId))
const plan = useDrivePlan(() => listId.value)
const reopen = useReopenShoppingList()

// Dans l'application Repas, le pont natif existe ; dans un navigateur ordinaire, seul le mode assisté est possible.
const inApp = driveBridge.isAvailable()
const driveUsable = ref(true)

const changes = ref<Record<string, LineChange | undefined>>({})
const draft = ref<RunDraft | null>(driveBridge.loadDraft())
const failure = ref<{ text: string; update: boolean } | null>(null)
const reopening = ref(false)

/** Un passage de cette liste attend son résultat (le brouillon survit à un rechargement de la page). */
const waiting = computed(() => draft.value !== null && draft.value.listId === listId.value)
/** Un passage d'une autre liste est en cours : un seul à la fois. */
const elsewhere = computed(() => draft.value !== null && draft.value.listId !== listId.value)

// Une adresse avec « lignes » ne reprend que les articles nommés. Le récapitulatif ne la propose plus (DRV-622 : « Reprendre l'envoi » reprend toute la liste) ; elle reste lue pour les anciens liens
const only = computed(() => {
  const names = route.query.lignes
  return typeof names === 'string' && names !== '' ? new Set(names.split(',')) : null
})
const visible = computed(() => {
  const data = plan.data.value
  if (data === undefined || only.value === null) return data

  return { ...data, lines: data.lines.filter((line) => only.value?.has(line.ingredientSlug)) }
})
const lines = computed(() => visible.value?.lines ?? [])
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
/** Au-delà de ce nombre d'articles la liste est repliée : la seule décision de l'écran est « Ouvrir le drive ». */
const FOLD_ABOVE = 6
// Hors de l'application la liste EST l'écran (un lien de recherche par article) : elle reste ouverte
const folded = computed(() => inApp && lines.value.length > FOLD_ABOVE)

const storeName = computed(() => {
  const store = plan.data.value?.store
  if (store === undefined) return ''

  return store.label === null || store.label === undefined
    ? t('driveSend.storeEnding', { ending: store.id.slice(-3) })
    : t('driveSend.store', { label: store.label })
})
const searchUrl = (query: string): string =>
  `${plan.data.value?.store.baseUrl ?? ''}/recherche.aspx?TexteRecherche=${encodeURIComponent(query)}`

watch(listId, () => (changes.value = {}))

// Sans magasin enregistré, le plan est refusé (409) : on mène à « Choisissez votre magasin », qui nous rend la liste
watch(
  () => plan.error.value,
  (error) => {
    if (error instanceof ApiError && error.message === 'DRIVE_NOT_CONFIGURED')
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
    (info) => (driveUsable.value = info.drive),
    () => undefined,
  )
})

const planError = computed(() => (hasFailed(plan) ? messageForFailure(plan.error.value) : null))

// Fonction coupée (retour arrière) : le plan répond « pas disponible », mais une liste restée envoyée doit pouvoir se rouvrir (la
// réouverture, elle, reste permise interrupteur coupé). Le plan n'a pas pu donner la version : on lit la liste, et seulement alors.
const driveOff = computed(
  () =>
    hasFailed(plan) &&
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

/** Lance le drive ; en attente d'un résultat, rouvre le même passage (même `runId`). */
function openDrive() {
  const data = visible.value
  if (data === undefined) return
  failure.value = null
  try {
    const runId = draft.value?.runId ?? crypto.randomUUID()
    draft.value = driveBridge.startRun(buildPlanMessage(data, changes.value, runId), listId.value)
  } catch (error) {
    if (error instanceof DriveBridgeError && error.code === 'RUN_IN_PROGRESS')
      draft.value = driveBridge.loadDraft()
    else failure.value = failureOf(error)
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
  const version = plan.data.value?.listVersion ?? sentList.data.value?.version
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
      {{ t('driveSend.title') }}
    </h1>

    <!-- Un passage d'une autre liste n'est pas terminé -->
    <section
      v-if="elsewhere && draft"
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

    <template v-else-if="plan.data.value">
      <p class="text-muted">{{ storeName }}</p>
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
        <!-- Une phrase de synthèse, une phrase d'explication, l'unique décision : le bouton, visible sans défiler -->
        <template v-else>
          <p v-if="summary !== ''" class="max-w-prose text-xl font-semibold">{{ summary }}</p>
          <p class="max-w-prose text-muted">{{ t('driveSend.intro') }}</p>
        </template>

        <section v-if="inApp" class="flex flex-col items-start gap-3">
          <UiButton
            size="lg"
            :disabled="!online || !driveUsable || lines.length === 0"
            @click="openDrive"
          >
            {{ t('driveSend.open') }}
          </UiButton>
          <p v-if="!online" class="font-semibold">{{ t('driveSend.offline') }}</p>
          <DriveSendFailure v-if="failure" :failure="failure" />
        </section>

        <DriveEstimate :list-id="listId" />

        <section class="flex flex-col gap-3">
          <p v-if="lines.length === 0" class="text-muted">{{ t('driveSend.emptyPlan') }}</p>
          <DriveFold v-else-if="folded" :label="t('driveSend.showArticles')">
            <ul class="flex flex-col gap-3">
              <DriveSendLine
                v-for="line in lines"
                :key="line.ingredientSlug"
                :line="line"
                :change="changes[line.ingredientSlug]"
                :assisted="!inApp"
                :search-url="searchUrl(line.searchQuery)"
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
                :assisted="!inApp"
                :search-url="searchUrl(line.searchQuery)"
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
