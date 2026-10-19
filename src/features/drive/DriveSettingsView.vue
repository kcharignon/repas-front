<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError } from '@/api'
import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiField from '@/design/UiField.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { isStale, messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useOnline } from '@/offline/useOnline'
import { driveBridge } from './bridge'
import { useDriveChoices } from './choicesQueries'
import { driveKeys, useDriveSettings, useSaveDriveSettings } from './queries'
import { parseStoreAddress, storeTail } from './storeAddress'
import { canReadStoreFromApp, readStoreFromApp, StoreReadError } from './storeReader'
import type { StoreReading } from './storeReader'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const notifications = useNotificationsStore()
const online = useOnline()

const settings = useDriveSettings()
const enabled = computed(() => settings.data.value?.enabled === true)
const store = computed(() => settings.data.value?.store ?? null)

// Envoyé ici faute de magasin (DRV-622) : l'écran ne pose qu'une question, et l'envoi nous attend. `retour=liste` : la liste en cours,
// qui rouvre sa confirmation ; `retour=envoi` (avec `liste`) : l'écran de l'envoi d'une liste déjà envoyée.
const origin = computed(() => {
  if (route.query.retour === 'liste') return { kind: 'list' as const }
  const id = route.query.liste

  return route.query.retour === 'envoi' && typeof id === 'string' && id !== ''
    ? { kind: 'send' as const, id }
    : null
})
const choosing = computed(() => store.value === null && route.query.magasin === 'requis')

// Le formulaire à la main : l'adresse du magasin et son nom. Ils suivent le magasin enregistré quand celui-ci change.
const address = ref('')
const label = ref('')
watch(
  store,
  (next) => {
    address.value = next?.baseUrl ?? ''
    label.value = next?.label ?? ''
  },
  { immediate: true },
)
const addressError = ref<string | null>(null)
const failure = ref<string | null>(null)
// La lecture du magasin par l'application : l'état de l'écran
const reading = ref(false)
const savedTail = ref<string | null>(null)
const readError = ref<string | null>(null)
const save = useSaveDriveSettings()
const locked = computed(() => !online.value || save.isPending.value)

const typed = computed(() => parseStoreAddress(address.value))
const otherStore = computed(
  () => store.value !== null && typed.value !== null && typed.value.id !== store.value.id,
)

/** Une fois le magasin enregistré, l'écran ne s'explique plus : il rend l'utilisateur à ce qu'il faisait. */
async function leave() {
  // L'envoi nous attendait : on le reprend, à sa confirmation ou à son écran
  if (origin.value?.kind === 'list') {
    await router.replace({ name: 'shopping-list', query: { envoyer: '1' } })
  } else if (origin.value?.kind === 'send') {
    await router.replace({ name: 'drive-send', params: { listId: origin.value.id } })
  } else if (route.query.magasin !== undefined) {
    await router.replace({ name: 'drive-settings' })
  }
}

async function submit() {
  failure.value = null
  const parsed = parseStoreAddress(address.value)
  if (parsed === null) {
    addressError.value = t('driveSettings.errors.address')

    return
  }
  addressError.value = null
  const name = label.value.trim()
  try {
    await save.mutateAsync({
      id: parsed.id,
      baseUrl: parsed.baseUrl,
      label: name === '' ? null : name,
    })
  } catch (error) {
    failure.value = messageForFailure(error)
    if (isStale(error)) void queryClient.invalidateQueries({ queryKey: driveKeys.all })

    return
  }
  savedTail.value = null
  notifications.push('success', t('driveSettings.saved'))
  await leave()
}

// La saisie à la main est repliée quand l'application sait lire le magasin ; sans elle, c'est le seul moyen : elle reste ouverte.
const canRead = canReadStoreFromApp()
const manualOpen = ref(!canRead)

// La lecture du magasin par l'application : un seul geste, « Utiliser ce magasin », puis Repas enregistre tout seul (DRV-623).
/** Le magasin lu, quand ce n'est pas celui qui est enregistré : le seul cas où l'on demande de confirmer. */
const other = ref<{ id: string; baseUrl: string } | null>(null)
const confirming = computed({
  get: () => other.value !== null,
  set: (open) => {
    if (!open) other.value = null
  },
})

/** Écrit le magasin lu par le même `PUT /drive/settings` que la saisie à la main : le serveur le valide comme une adresse tapée. */
async function register(found: { id: string; baseUrl: string; label: string | null }) {
  try {
    await save.mutateAsync(found)
  } catch (error) {
    readError.value =
      error instanceof ApiError && error.message === 'DRIVE_STORE_INVALID'
        ? t('driveSettings.readRefused')
        : messageForFailure(error)
    manualOpen.value = true
    if (isStale(error)) void queryClient.invalidateQueries({ queryKey: driveKeys.all })

    return
  }
  savedTail.value = storeTail(found.id)
  if (origin.value !== null)
    notifications.push('success', t('driveSettings.readDone', { tail: savedTail.value }))
  await leave()
}

/** Ce que l'on fait du magasin lu : l'enregistrer tout seul, ou demander d'abord s'il en change. */
async function adopt(found: StoreReading) {
  const parsed = parseStoreAddress(found.baseUrl)
  if (parsed === null || parsed.id !== found.id) throw new StoreReadError('FAILED')
  const current = store.value
  if (current === null) return register({ ...parsed, label: found.label ?? null })
  if (current.id !== parsed.id) {
    other.value = parsed

    return
  }
  // Le même magasin relu : rien à écrire, ni écran de plus (le nom que Repas a retenu reste)
  if (current.baseUrl === parsed.baseUrl) {
    savedTail.value = storeTail(parsed.id)

    return
  }
  return register({ ...parsed, label: found.label ?? current.label ?? null })
}

async function readFromApp() {
  if (reading.value || save.isPending.value) return
  reading.value = true
  savedTail.value = null
  readError.value = null
  other.value = null
  try {
    await adopt(await readStoreFromApp())
  } catch (error) {
    const code = error instanceof StoreReadError ? error.code : 'FAILED'
    readError.value = t(`driveSettings.readErrors.${code}`)
    manualOpen.value = true
  } finally {
    reading.value = false
  }
}

/** « Changer de magasin » : l'utilisateur a confirmé, le magasin lu remplace l'ancien (ses produits habituels n'ont plus cours). */
async function confirmChange() {
  const found = other.value
  if (found === null || save.isPending.value) return
  await register({ ...found, label: null })
  other.value = null
}

const readLabel = computed(() =>
  t(
    choosing.value
      ? 'driveSettings.choose'
      : store.value
        ? 'driveSettings.change'
        : 'driveSettings.read',
  ),
)

// L'application : sa version et l'état du drive, par le pont (absent hors de l'application)
const inApp = driveBridge.isAvailable()
const app = useQuery({
  queryKey: driveKeys.appInfo,
  queryFn: () => driveBridge.info(),
  enabled: inApp,
  retry: false,
  staleTime: 60_000,
})

// Les produits mémorisés : un résumé de `GET /drive/choices`
const choices = useDriveChoices(() => enabled.value && store.value !== null)
const summary = computed(() => {
  const member = choices.data.value?.member ?? []

  return {
    withProducts: member.filter((choice) => !choice.haveAtHome && choice.accepted.length > 0)
      .length,
    withRejected: member.filter((choice) => choice.rejected.length > 0).length,
    haveAtHome: member.filter((choice) => choice.haveAtHome).length,
  }
})

const card = 'flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4'
const notice = 'rounded-xl bg-soft px-4 py-3 font-semibold'
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
    <RouterLink
      v-if="origin"
      :to="
        origin.kind === 'send'
          ? { name: 'shopping-list-detail', params: { id: origin.id } }
          : { name: 'shopping-list' }
      "
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('driveSend.back') }}
    </RouterLink>
    <RouterLink
      v-else
      :to="{ name: 'account' }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('driveSettings.back') }}
    </RouterLink>
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ choosing ? t('driveSettings.chooseTitle') : t('driveSettings.title') }}
    </h1>

    <p v-if="settings.isPending.value" class="text-muted" role="status">
      {{ t('common.loading') }}
    </p>
    <p
      v-else-if="hasFailed(settings)"
      role="alert"
      class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
    >
      {{ t('errors.unreachable') }}
    </p>
    <p v-else-if="!enabled" class="text-muted">{{ t('driveSettings.disabled') }}</p>

    <template v-else>
      <section class="flex flex-col gap-3" aria-labelledby="store-title">
        <h2
          id="store-title"
          class="font-display text-2xl font-bold"
          :class="{ 'sr-only': choosing }"
        >
          {{ t('driveSettings.store') }}
        </h2>
        <div :class="card">
          <p v-if="savedTail" role="status" class="text-lg font-bold">
            {{ t('driveSettings.readDone', { tail: savedTail }) }}
          </p>
          <p v-else-if="choosing">{{ t('driveSettings.chooseHelp') }}</p>
          <p v-else-if="store === null" class="font-bold">{{ t('driveSettings.none') }}</p>
          <p v-else class="flex flex-col">
            <span class="text-lg font-bold break-words">{{
              store.label ?? t('driveSettings.storeNamed', { tail: storeTail(store.id) })
            }}</span>
            <span v-if="store.label" class="text-sm text-muted">{{
              t('driveSettings.storeNamed', { tail: storeTail(store.id) })
            }}</span>
          </p>

          <div v-if="canRead" class="flex flex-col items-start gap-2">
            <UiButton
              :variant="store === null ? 'primary' : 'secondary'"
              :size="choosing ? 'lg' : 'md'"
              :disabled="locked || reading"
              @click="readFromApp"
              >{{ readLabel }}</UiButton
            >
            <p class="text-sm text-muted">{{ t('driveSettings.readHelp') }}</p>
          </div>
          <p v-if="readError" role="alert" class="text-sm font-semibold text-danger">
            {{ readError }}
          </p>
          <p v-if="!online && canRead" :class="notice">{{ t('driveSettings.offline') }}</p>
        </div>

        <details
          class="rounded-2xl border border-line bg-surface px-4 py-1"
          :open="manualOpen"
          @toggle="manualOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary
            class="inline-flex min-h-11 cursor-pointer items-center font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            {{ t('driveSettings.manual') }}
          </summary>
          <form class="flex flex-col gap-3 pt-2 pb-3" novalidate @submit.prevent="submit">
            <UiField
              :label="t('driveSettings.address')"
              :hint="t('driveSettings.addressHint')"
              :error="addressError"
              v-slot="{ id, describedby, invalid }"
            >
              <UiTextInput
                :id="id"
                v-model="address"
                type="url"
                inputmode="url"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                :aria-describedby="describedby"
                :invalid="invalid"
              />
            </UiField>
            <UiField
              :label="t('driveSettings.name')"
              :hint="t('driveSettings.nameHint')"
              v-slot="{ id, describedby }"
            >
              <UiTextInput
                :id="id"
                v-model="label"
                maxlength="255"
                autocomplete="off"
                :aria-describedby="describedby"
              />
            </UiField>

            <p v-if="otherStore" role="status" :class="notice">
              {{ t('driveSettings.changeWarning') }}
            </p>
            <p v-if="!online" :class="notice">{{ t('driveSettings.offline') }}</p>
            <p
              v-if="failure"
              role="alert"
              class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
            >
              {{ failure }}
            </p>
            <div>
              <UiButton type="submit" :disabled="locked">{{ t('driveSettings.save') }}</UiButton>
            </div>
          </form>
        </details>
      </section>

      <template v-if="!choosing">
        <section class="flex flex-col gap-3" aria-labelledby="app-title">
          <h2 id="app-title" class="font-display text-2xl font-bold">
            {{ t('driveSettings.app') }}
          </h2>
          <div :class="card">
            <template v-if="inApp">
              <p v-if="app.isPending.value" class="text-muted" role="status">
                {{ t('driveSettings.appChecking') }}
              </p>
              <p v-else-if="app.isError.value" role="alert" class="font-semibold text-danger">
                {{ t('driveSettings.appNoAnswer') }}
              </p>
              <template v-else-if="app.data.value">
                <p class="font-bold">
                  {{ t('driveSettings.appVersion', { version: app.data.value.version }) }}
                </p>
                <p :class="app.data.value.drive ? 'text-muted' : 'font-semibold text-danger'">
                  {{
                    app.data.value.drive
                      ? t('driveSettings.appReady')
                      : t('driveSettings.appDriveOff')
                  }}
                </p>
              </template>
            </template>
            <p v-else class="text-muted">{{ t('driveSettings.appMissing') }}</p>
            <div>
              <UiLinkButton
                variant="secondary"
                :to="inApp ? { name: 'drive-help', hash: '#mise-a-jour' } : { name: 'drive-help' }"
                >{{ t(inApp ? 'driveSettings.helpInApp' : 'driveSettings.help') }}</UiLinkButton
              >
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="products-title">
          <h2 id="products-title" class="font-display text-2xl font-bold">
            {{ t('driveSettings.products') }}
          </h2>
          <div :class="card">
            <p v-if="store === null" class="text-muted">{{ t('driveProducts.noStore') }}</p>
            <p v-else-if="choices.isPending.value" class="text-muted" role="status">
              {{ t('common.loading') }}
            </p>
            <p v-else-if="hasFailed(choices)" role="alert" class="font-semibold text-danger">
              {{ t('errors.unreachable') }}
            </p>
            <dl v-else class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
              <dt>{{ t('driveSettings.productsWith') }}</dt>
              <dd class="text-right font-bold">{{ summary.withProducts }}</dd>
              <dt>{{ t('driveSettings.productsRejected') }}</dt>
              <dd class="text-right font-bold">{{ summary.withRejected }}</dd>
              <dt>{{ t('driveSettings.productsHome') }}</dt>
              <dd class="text-right font-bold">{{ summary.haveAtHome }}</dd>
            </dl>
            <div>
              <UiLinkButton variant="secondary" :to="{ name: 'drive-products' }">{{
                t('driveSettings.manage')
              }}</UiLinkButton>
            </div>
          </div>
        </section>
      </template>

      <!-- Le seul cas à deux gestes : le magasin lu n'est pas celui qui est enregistré (DRV-623) -->
      <UiConfirmDialog
        v-model:open="confirming"
        variant="primary"
        :title="t('driveSettings.changeTitle', { tail: storeTail(other?.id ?? '') })"
        :description="t('driveSettings.changeWarning')"
        :confirm-label="t('driveSettings.changeConfirm')"
        :cancel-label="t('driveSettings.changeKeep')"
        :pending="save.isPending.value"
        @confirm="confirmChange"
      />
    </template>
  </main>
</template>
