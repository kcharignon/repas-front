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
import { useReopenShoppingList } from '@/features/shopping-lists/queries'
import { messageForFailure } from '@/notifications/failures'
import { useOnline } from '@/offline/useOnline'
import { DriveBridgeError, driveBridge } from './bridge'
import type { RunDraft } from './bridge'
import { buildPlanMessage, effectiveStatus } from './buildPlanMessage'
import type { LineChange } from './buildPlanMessage'
import DriveSendLine from './DriveSendLine.vue'
import { useDrivePlan } from './queries'

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
const failure = ref<string | null>(null)
const reopening = ref(false)

/** Un passage de cette liste attend son résultat (le brouillon survit à un rechargement de la page). */
const waiting = computed(() => draft.value !== null && draft.value.listId === listId.value)
/** Un passage d'une autre liste est en cours : un seul à la fois. */
const elsewhere = computed(() => draft.value !== null && draft.value.listId !== listId.value)

const lines = computed(() => plan.data.value?.lines ?? [])
const counts = computed(() => {
  const statuses = lines.value.map((line) => effectiveStatus(line, changes.value))
  const count = (status: string) => statuses.filter((candidate) => candidate === status).length

  return {
    known: count('KNOWN'),
    new: count('NEW'),
    haveAtHome: count('HAVE_AT_HOME'),
    skipped: count('SKIP'),
  }
})

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

// Sans magasin enregistré, le plan est refusé (409) : on mène aux réglages
watch(
  () => plan.error.value,
  (error) => {
    if (error instanceof ApiError && error.message === 'DRIVE_NOT_CONFIGURED')
      void router.replace({ name: 'drive-settings', query: { magasin: 'requis' } })
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

function failureText(error: unknown): string {
  if (!(error instanceof DriveBridgeError)) return t('driveSend.failure.invalidPlan')
  switch (error.code) {
    case 'INVALID_PLAN':
      return error.detail === 'lines'
        ? t('driveSend.failure.tooManyLines', { max: LIMITS.lines })
        : t('driveSend.failure.invalidPlan')
    case 'TOO_LARGE':
      return t('driveSend.failure.tooLarge')
    case 'SEND_FAILED':
      return t('driveSend.failure.sendFailed')
    default:
      return t('driveSend.failure.appRefused')
  }
}

/** Lance le drive ; en attente d'un résultat, rouvre le même passage (même `runId`). */
function openDrive() {
  const data = plan.data.value
  if (data === undefined) return
  failure.value = null
  try {
    const runId = draft.value?.runId ?? crypto.randomUUID()
    draft.value = driveBridge.startRun(buildPlanMessage(data, changes.value, runId), listId.value)
  } catch (error) {
    if (error instanceof DriveBridgeError && error.code === 'RUN_IN_PROGRESS')
      draft.value = driveBridge.loadDraft()
    else failure.value = failureText(error)
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
  const version = plan.data.value?.listVersion
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
        <p v-else class="max-w-prose text-muted">{{ t('driveSend.intro') }}</p>

        <dl :aria-label="t('driveSend.counts.label')" class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div
            v-for="key in ['known', 'new', 'haveAtHome', 'skipped'] as const"
            :key="key"
            class="flex flex-col-reverse rounded-2xl bg-soft px-4 py-3"
          >
            <dt class="text-sm text-muted">{{ t(`driveSend.counts.${key}`) }}</dt>
            <dd class="font-display text-2xl font-bold">{{ counts[key] }}</dd>
          </div>
        </dl>

        <section class="flex flex-col gap-3">
          <h2 class="font-display text-xl font-bold">
            {{ t('driveSend.lines', { count: lines.length }) }}
          </h2>
          <p v-if="lines.length === 0" class="text-muted">{{ t('driveSend.emptyPlan') }}</p>
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
        </section>

        <section v-if="inApp" class="flex flex-col items-start gap-3">
          <UiButton
            size="lg"
            :disabled="!online || !driveUsable || lines.length === 0"
            @click="openDrive"
          >
            {{ t('driveSend.open') }}
          </UiButton>
          <p v-if="!online" class="font-semibold">{{ t('driveSend.offline') }}</p>
        </section>
      </template>

      <p
        v-if="failure"
        role="alert"
        class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
      >
        {{ failure }}
      </p>
    </template>

    <template v-else-if="planError !== null">
      <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft">
        {{ planError }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UiButton variant="secondary" @click="plan.refetch()">{{ t('driveSend.retry') }}</UiButton>
        <UiButton v-if="waiting" variant="ghost" @click="abandon">
          {{ t('driveSend.elsewhere.abandon') }}
        </UiButton>
      </div>
    </template>

    <p v-else class="text-muted" role="status">{{ t('driveSend.loading') }}</p>

    <UiConfirmDialog
      v-model:open="reopening"
      variant="primary"
      :title="t('driveSend.waiting.reopenTitle')"
      :description="t('driveSend.waiting.reopenHelp')"
      :confirm-label="t('driveSend.waiting.reopenList')"
      :pending="reopen.isPending.value"
      @confirm="confirmReopenList"
    />
  </main>
</template>
