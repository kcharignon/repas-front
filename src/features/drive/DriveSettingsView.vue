<script setup lang="ts">
import { useRetailerI18n } from './useRetailerI18n'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError } from '@/api'
import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import { isStale, messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useOnline } from '@/offline/useOnline'
import type { DriveStore, DriveStorePayload } from '@/api'
import { driveBridge } from './bridge'
import { useDriveChoices } from './choicesQueries'
import DefaultDriveChoice from './DefaultDriveChoice.vue'
import DriveCard from './DriveCard.vue'
import { drivesOf, hasSeveralDrives } from './drives'
import type { Drive } from './drives'
import {
  driveKeys,
  useDriveSettings,
  useRemoveDrive,
  useSaveDriveSettings,
  useSetDefaultRetailer,
} from './queries'
import { appServes, retailerOf } from './retailers'
import type { RetailerId } from './retailers'
import StoreManualForm from './StoreManualForm.vue'
import { parseStoreAddress, readExplicitStore, storeTail } from './storeAddress'
import { canReadStoreFromApp, readStoreFromApp, StoreReadError } from './storeReader'
import type { StoreReading } from './storeReader'

const { t, retailer } = useRetailerI18n()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const notifications = useNotificationsStore()
const online = useOnline()

const settings = useDriveSettings()
const enabled = computed(() => settings.data.value?.enabled === true)
const store = computed(() => settings.data.value?.store ?? null)
// « Mes drives » (DRV-709) : seulement avec plusieurs drives allumés. Avec un seul, l'écran est celui d'avant, sans un mot de plus.
const drives = computed(() => drivesOf(settings.data.value))
const several = computed(() => hasSeveralDrives(drives.value))

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

// La lecture du magasin par l'application : l'état de l'écran. `reading` : le drive dont on lit le magasin (il peut y en avoir plusieurs à l'écran).
const reading = ref<RetailerId | null>(null)
const savedTail = ref<string | null>(null)
const savedFor = ref<RetailerId | null>(null)
/** Le nom du magasin qui vient d'être enregistré, quand l'application l'a lu (jamais inventé : `null` sinon). */
const savedLabel = ref<string | null>(null)
const readError = ref<string | null>(null)
const readErrorFor = ref<RetailerId | null>(null)
const save = useSaveDriveSettings()
const locked = computed(() => !online.value || save.isPending.value)

/** Le drive dont on parle : son identifiant et son magasin (celui des réglages quand il n'y en a qu'un). */
interface Target {
  id: RetailerId
  store: DriveStore | null
}
const soleTarget = computed<Target>(() => ({ id: retailer.value.id, store: store.value }))

/** Une fois le magasin enregistré, l'écran ne s'explique plus : il rend l'utilisateur à ce qu'il faisait. */
async function leave() {
  // L'envoi nous attendait : on le reprend, à sa confirmation ou à son écran
  if (origin.value?.kind === 'list') {
    await router.replace({ name: 'shopping-list', query: { envoyer: '1' } })
  } else if (origin.value?.kind === 'send') {
    await router.replace({
      name: 'drive-send',
      params: { listId: origin.value.id },
      query: { ouvrir: '1' },
    })
  } else if (route.query.magasin !== undefined) {
    await router.replace({ name: 'drive-settings' })
  }
}

/** Le magasin saisi à la main chez un drive (le formulaire en dit l'échec) : il est enregistré, puis l'écran rend la main. */
async function saveManual(id: RetailerId, found: DriveStorePayload) {
  try {
    await save.mutateAsync({ store: found, retailer: id })
  } catch (error) {
    if (isStale(error)) void queryClient.invalidateQueries({ queryKey: driveKeys.all })
    throw error
  }
  savedTail.value = null
  savedFor.value = null
  savedLabel.value = null
  notifications.push('success', t('driveSettings.saved'))
  await leave()
}

// L'application : sa version et l'état du drive, par le pont (absent hors de l'application)
const inApp = driveBridge.isAvailable()
const app = useQuery({
  queryKey: driveKeys.appInfo,
  queryFn: () => driveBridge.info(),
  enabled: inApp,
  retry: false,
  staleTime: 60_000,
})

// La saisie à la main est repliée quand l'application sait lire le magasin ; sans elle, c'est le seul moyen : elle reste ouverte.
const canRead = canReadStoreFromApp()
const manualOpen = ref(!canRead)

// La lecture du magasin par l'application : un seul geste, « Utiliser ce magasin », puis Repas enregistre tout seul (DRV-623).
/** Le magasin lu, quand ce n'est pas celui qui est enregistré : le seul cas où l'on demande de confirmer. */
const other = ref<{ id: string; baseUrl: string; retailer: RetailerId } | null>(null)
const confirming = computed({
  get: () => other.value !== null,
  set: (open) => {
    if (!open) other.value = null
  },
})

/** Écrit le magasin lu par le même `PUT /drive/settings` que la saisie à la main : le serveur le valide comme une adresse tapée. */
async function register(
  found: { id: string; baseUrl: string; label: string | null },
  id: RetailerId,
) {
  try {
    await save.mutateAsync({ store: found, retailer: id })
  } catch (error) {
    readError.value =
      error instanceof ApiError && error.message === 'DRIVE_STORE_INVALID'
        ? t('driveSettings.readRefused')
        : messageForFailure(error)
    readErrorFor.value = id
    manualOpen.value = true
    if (isStale(error)) void queryClient.invalidateQueries({ queryKey: driveKeys.all })

    return
  }
  savedTail.value = storeTail(found.id)
  savedFor.value = id
  savedLabel.value = found.label
  if (origin.value !== null)
    notifications.push('success', t('driveSettings.readDone', { tail: savedTail.value }))
  await leave()
}

/** Ce que l'on fait du magasin lu : l'enregistrer tout seul, ou demander d'abord s'il en change. */
async function adopt(found: StoreReading, target: Target) {
  // Le magasin d'un drive se lit dans son adresse, ou est un identifiant que l'application a lu sur la page : la règle est celle du drive
  const drive = retailerOf(target.id)
  const parsed =
    drive.storeIdSource === 'EXPLICIT'
      ? readExplicitStore(found.id, found.baseUrl, drive)
      : parseStoreAddress(found.baseUrl, drive)
  if (parsed === null || parsed.id !== found.id) throw new StoreReadError('FAILED')
  const current = target.store
  if (current === null) return register({ ...parsed, label: found.label ?? null }, target.id)
  if (current.id !== parsed.id) {
    other.value = { ...parsed, retailer: target.id }

    return
  }
  // Le même magasin relu : rien à écrire, ni écran de plus (le nom que Repas a retenu reste)
  if (current.baseUrl === parsed.baseUrl) {
    savedTail.value = storeTail(parsed.id)
    savedFor.value = target.id
    savedLabel.value = current.label ?? null

    return
  }
  return register({ ...parsed, label: found.label ?? current.label ?? null }, target.id)
}

/**
 * `address` (DRV-741) : l'adresse du site mobile d'un magasin collée dans la saisie à la main. L'application l'ouvre en mode ordinateur à la place de
 * l'accueil (l'enseigne la redirige vers le bon hôte) ; la personne n'a qu'à toucher « Utiliser ce magasin », et c'est le magasin lu qui est enregistré.
 */
async function readFromApp(target: Target, address: string | null = null) {
  if (reading.value !== null || save.isPending.value) return
  reading.value = target.id
  savedTail.value = null
  savedFor.value = null
  savedLabel.value = null
  readError.value = null
  readErrorFor.value = null
  other.value = null
  try {
    // L'application qui annonce ses drives reçoit le nom du drive touché ; une ancienne ne lit que le drive d'avant et ne connaît pas la clé
    await adopt(
      await readStoreFromApp(
        undefined,
        app.data.value?.retailers === undefined ? null : target.id,
        address,
      ),
      target,
    )
  } catch (error) {
    const code = error instanceof StoreReadError ? error.code : 'FAILED'
    readError.value = t(`driveSettings.readErrors.${code}`)
    readErrorFor.value = target.id
    manualOpen.value = true
  } finally {
    reading.value = null
  }
}

/** « Changer de magasin » : l'utilisateur a confirmé, le magasin lu remplace l'ancien (ses produits habituels n'ont plus cours). */
async function confirmChange() {
  const found = other.value
  if (found === null || save.isPending.value) return
  await register({ id: found.id, baseUrl: found.baseUrl, label: null }, found.retailer)
  other.value = null
}

/** Ce que la ligne d'un drive propose pour lire son magasin (DRV-709) : le bouton, la phrase de mise à jour, ou rien tant que l'application n'a pas répondu. */
function readerFor(drive: Drive): 'button' | 'update' | 'browser' | 'wait' {
  if (!canRead) return 'browser'
  // Avant la réponse d'`app.info`, seul le drive d'avant est sûr : les autres attendent (une réponse prend quelques millisecondes)
  if (app.isPending.value) return appServes(undefined, drive.id) ? 'button' : 'wait'

  return appServes(app.data.value?.retailers, drive.id) ? 'button' : 'update'
}

/** Retirer un drive : la confirmation d'abord (difficile à défaire), puis `DELETE /drive/settings?retailer=`. */
const removing = ref<Drive | null>(null)
const removeDialog = computed({
  get: () => removing.value !== null,
  set: (open) => {
    if (!open) removing.value = null
  },
})
const removeDrive = useRemoveDrive()
const drivesError = ref<string | null>(null)
async function confirmRemove() {
  const drive = removing.value
  if (drive === null || removeDrive.isPending.value) return
  drivesError.value = null
  try {
    await removeDrive.mutateAsync(drive.id)
    notifications.push('success', t('driveSettings.drives.removed', { retailer: drive.name }))
  } catch (error) {
    // Un drive déjà retiré ailleurs : il n'y a plus rien à retirer, l'écran se relit
    if (error instanceof ApiError && error.message === 'DRIVE_SETTINGS_NOT_FOUND')
      void queryClient.invalidateQueries({ queryKey: driveKeys.all })
    else drivesError.value = messageForFailure(error)
  } finally {
    removing.value = null
  }
}

/** Le drive habituel : au moins deux drives configurés, sinon il n'y a rien à choisir. */
const configured = computed(() => drives.value.filter((drive) => drive.configured))
const setDefault = useSetDefaultRetailer()
const defaultKey = ref(0)
async function chooseDefault(id: RetailerId | null) {
  drivesError.value = null
  try {
    await setDefault.mutateAsync(id)
  } catch (error) {
    drivesError.value = messageForFailure(error)
    // Le bouton coché n'est plus ce que le back sait : on le remet
    defaultKey.value += 1
  }
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
// Les lignes du résumé qui existent (un compteur à zéro n'est pas écrit)
const summaryRows = computed(() => {
  const counts = summary.value

  return [
    { label: 'driveSettings.productsWith', count: counts.withProducts },
    { label: 'driveSettings.productsRejected', count: counts.withRejected },
    { label: 'driveSettings.productsHome', count: counts.haveAtHome },
  ].filter((row) => row.count > 0)
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
      <!-- Un seul drive : l'écran d'avant (DRV-709, règle 1). Plusieurs : « Mes drives », plus bas. -->
      <section v-if="!several" class="flex flex-col gap-3" aria-labelledby="store-title">
        <h2
          id="store-title"
          class="font-display text-2xl font-bold"
          :class="{ 'sr-only': choosing }"
        >
          {{ t('driveSettings.store') }}
        </h2>
        <div :class="card">
          <p v-if="savedTail" role="status" class="flex flex-col text-lg font-bold">
            <span v-if="savedLabel" class="break-words">{{ savedLabel }}</span>
            <span :class="{ 'text-sm font-normal text-muted': savedLabel }">{{
              t('driveSettings.readDone', { tail: savedTail })
            }}</span>
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
              :disabled="locked || reading !== null"
              @click="readFromApp(soleTarget)"
              >{{ readLabel }}</UiButton
            >
            <p class="text-sm text-muted">{{ t('driveSettings.readHelp') }}</p>
          </div>
          <p v-if="readError" role="alert" class="text-sm font-semibold text-danger">
            {{ readError }}
          </p>
          <p v-if="!online && canRead" :class="notice">{{ t('driveSettings.offline') }}</p>
        </div>

        <StoreManualForm
          v-if="retailer.storeIdSource !== 'EXPLICIT'"
          v-model:open="manualOpen"
          :retailer="retailer"
          :store="store"
          :locked="locked"
          :online="online"
          :save="(found) => saveManual(retailer.id, found)"
          :read-address="canRead ? (found) => readFromApp(soleTarget, found) : null"
        />
      </section>

      <!-- Plusieurs drives allumés (DRV-709) : la liste, un magasin par drive, et le drive habituel -->
      <section v-else class="flex flex-col gap-3" aria-labelledby="drives-title">
        <h2
          id="drives-title"
          class="font-display text-2xl font-bold"
          :class="{ 'sr-only': choosing }"
        >
          {{ t('driveSettings.drives.title') }}
        </h2>
        <p v-if="choosing">{{ t('driveSettings.drives.chooseHelp') }}</p>
        <ul class="flex flex-col gap-3">
          <DriveCard
            v-for="drive in drives"
            :key="drive.id"
            :drive="drive"
            :retailer="retailerOf(drive.id)"
            :reader="readerFor(drive)"
            :reading="reading === drive.id"
            :busy="locked || reading !== null || removeDrive.isPending.value"
            :online="online"
            :saved-tail="savedFor === drive.id ? savedTail : null"
            :saved-label="savedFor === drive.id ? savedLabel : null"
            :read-error="readErrorFor === drive.id ? readError : null"
            :save="(found) => saveManual(drive.id, found)"
            @read="readFromApp({ id: drive.id, store: drive.store })"
            @read-address="(address) => readFromApp({ id: drive.id, store: drive.store }, address)"
            @remove="removing = drive"
          />
        </ul>
        <DefaultDriveChoice
          v-if="configured.length > 1"
          :key="defaultKey"
          :drives="configured"
          :disabled="locked || setDefault.isPending.value"
          @choose="chooseDefault"
        />
        <p
          v-if="drivesError"
          role="alert"
          class="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-on-danger-soft"
        >
          {{ drivesError }}
        </p>
      </section>

      <template v-if="!choosing">
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
            <!-- Seulement ce qui existe : jamais un compteur à zéro (DRV-628) -->
            <dl
              v-else-if="summaryRows.length > 0"
              class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5"
            >
              <template v-for="row in summaryRows" :key="row.label">
                <dt>{{ t(row.label) }}</dt>
                <dd class="text-right font-bold">{{ row.count }}</dd>
              </template>
            </dl>
            <div>
              <UiLinkButton variant="secondary" :to="{ name: 'drive-products' }">{{
                t('driveSettings.manage')
              }}</UiLinkButton>
            </div>
          </div>
        </section>
      </template>

      <UiConfirmDialog
        v-model:open="removeDialog"
        :title="t('driveSettings.drives.removeTitle', { retailer: removing?.name ?? '' })"
        :description="t('driveSettings.drives.removeHelp', { retailer: removing?.name ?? '' })"
        :confirm-label="t('driveSettings.drives.remove', { retailer: removing?.name ?? '' })"
        :cancel-label="t('driveSettings.drives.keep', { retailer: removing?.name ?? '' })"
        :pending="removeDrive.isPending.value"
        @confirm="confirmRemove"
      />

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
