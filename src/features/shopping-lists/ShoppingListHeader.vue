<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type { ShoppingList } from '@/api'
import UiActionMenu, { type UiAction } from '@/design/UiActionMenu.vue'
import UiButton from '@/design/UiButton.vue'
import SeasonArt from '@/design/season/SeasonArt.vue'
import UiConfirmDialog from '@/design/UiConfirmDialog.vue'
import UiDialog from '@/design/UiDialog.vue'
import UiField from '@/design/UiField.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { useWrappedRow } from '@/design/useWrappedRow'
import { isDriveAppVersionEnough } from '@/features/drive/appVersion'
import { driveBridge } from '@/features/drive/bridge'
import { useDriveSettings } from '@/features/drive/queries'
import { retailerOf } from '@/features/drive/retailers'
import type { RetailerId } from '@/features/drive/retailers'
import { needsStore, unservedDrive } from '@/features/drive/sendChoice'
import { useOnline } from '@/offline/useOnline'
import {
  useChangeListStatus,
  useDeleteShoppingList,
  useRenameShoppingList,
  useReopenShoppingList,
  useSendShoppingList,
} from './queries'

const props = defineProps<{
  list: ShoppingList
  /** Plusieurs listes en cours se voient par pastilles : le bouton dit laquelle il termine (« Terminer cette liste »). */
  several?: boolean
}>()

const { t, d } = useI18n()
const completeLabel = computed(() =>
  t(props.several ? 'shoppingList.completeThis' : 'shoppingList.complete'),
)
const route = useRoute()
const router = useRouter()
const online = useOnline()

const status = useChangeListStatus()
const rename = useRenameShoppingList()
const remove = useDeleteShoppingList()
const send = useSendShoppingList()
const reopen = useReopenShoppingList()

// L'envoi n'est proposé que dans l'application Repas (le pont natif), si la fonction est allumée, pour une liste en cours qui a des
// articles : dans un navigateur il ne pourrait rien faire, et il verrouillerait la liste pour rien (DRV-641).
const inApp = driveBridge.isAvailable()
const settings = useDriveSettings(() => props.list.isActive)
// Un envoi ne prend que les articles NON cochés (DRV-747) : sans article à cocher il n'y a rien à envoyer, ni à reprendre
const uncheckedCount = computed(() =>
  props.list.departments.reduce(
    (total, department) => total + department.rows.filter((row) => !row.checked).length,
    0,
  ),
)
// Aucun drive configuré (`selection.mode` vaut `NONE`) : pas de bouton « Envoyer au drive », « Terminer » devient l'action principale (DRV-737).
// Un drive se configure depuis « Moi » (Réglages du drive).
const canSend = computed(() => {
  const data = settings.data.value

  return (
    inApp &&
    props.list.isActive &&
    uncheckedCount.value > 0 &&
    data?.enabled === true &&
    !needsStore(data)
  )
})

// Aucun drive configuré, dans l'application, fonction allumée : « ⋮ » propose d'en configurer un (la liste en cours seulement, voir `otherActions`)
const canConfigureDrive = computed(
  () =>
    inApp &&
    props.list.isActive &&
    settings.data.value?.enabled === true &&
    settings.data.value.selection?.mode === 'NONE',
)

/** « Configurer un drive » : l'écran des réglages pose la question du drive, puis nous rend la liste une fois le magasin enregistré (`retour=liste`). */
function configureDrive() {
  void router.push({ name: 'drive-settings', query: { magasin: 'requis', retour: 'liste' } })
}

const checking = ref(false)
const updating = ref(false)
/** Le drive que l'application ne connaît pas (DRV-710), pour le nommer dans la phrase de mise à jour ; `null` : l'application est trop ancienne tout court. */
const unservedFor = ref<RetailerId | null>(null)

/**
 * L'application est-elle assez récente pour envoyer (même test que l'écran d'envoi) ? Tant que la réponse n'est pas là (3 s au plus),
 * le bouton est grisé et rien n'est enregistré : une application trop ancienne, ou qui ne répond pas, ne verrouille jamais la liste.
 * Trop ancienne : la phrase de mise à jour remplace la confirmation.
 */
async function appIsEnough(): Promise<boolean> {
  checking.value = true
  unservedFor.value = null
  let enough = false
  try {
    const info = await driveBridge.info()
    enough = isDriveAppVersionEnough(info.version)
    // L'application ne sert AUCUN des drives configurés (DRV-710) : même phrase, avec le nom du drive ; s'il en reste un qu'elle sert, l'écran d'envoi arbitre
    const data = settings.data.value
    const unserved = enough && data !== undefined ? unservedDrive(data, info.retailers) : null
    if (unserved !== null) {
      enough = false
      unservedFor.value = unserved
    }
  } catch {
    // Une application qui ne dit pas sa version est trop ancienne
  } finally {
    checking.value = false
  }
  if (!enough) updating.value = true

  return enough
}

/**
 * Sans magasin enregistré, l'envoi mène à l'écran « Choisis ton magasin » (DRV-622) au lieu de la confirmation ; une fois le
 * magasin enregistré, cet écran nous rend la liste (`retour=liste`) et l'envoi reprend à sa confirmation (`envoyer`).
 */
async function askToSend() {
  if (checking.value || !(await appIsEnough())) return
  const data = settings.data.value
  if (data !== undefined && !needsStore(data)) sending.value = true
  else
    void router.push({
      name: 'drive-settings',
      query: { magasin: 'requis', retour: 'liste' },
    })
}

const renaming = ref(false)
const deleting = ref(false)
const sending = ref(false)
const reopening = ref(false)
const name = ref('')

// Revenu de l'écran du magasin : l'envoi reprend à sa confirmation, sans retoucher « Envoyer au drive » (DRV-622)
watch(
  () => [route.query.envoyer, canSend.value] as const,
  ([resume, can]) => {
    if (resume === undefined || !can) return
    // La demande est consommée : un rechargement ne rouvre pas la confirmation
    void router.replace({ query: { ...route.query, envoyer: undefined } })
    void appIsEnough().then((enough) => (sending.value = enough))
  },
  { immediate: true },
)

function openRename() {
  name.value = props.list.name ?? ''
  renaming.value = true
}

function saveName() {
  rename.mutate(
    { id: props.list.id, name: name.value, version: props.list.version },
    { onSuccess: () => (renaming.value = false) },
  )
}

function confirmDelete() {
  remove.mutate(props.list.id, {
    onSuccess: async () => {
      deleting.value = false
      await router.push({ name: 'shopping-lists' })
    },
  })
}

function confirmSend() {
  send.mutate(
    { id: props.list.id, version: props.list.version },
    {
      onSuccess: async () => {
        sending.value = false
        // La confirmation a donné l'intention : l'écran d'envoi ouvre le drive tout seul (`ouvrir`)
        await router.push({
          name: 'drive-send',
          params: { listId: props.list.id },
          query: { ouvrir: '1' },
        })
      },
      onError: () => (sending.value = false),
    },
  )
}

function confirmReopen() {
  reopen.mutate(
    { id: props.list.id, version: props.list.version },
    { onSettled: () => (reopening.value = false) },
  )
}

// L'action principale prend la place libre sur téléphone ; aucun libellé ne passe à la ligne
const mainAction = 'flex-1 whitespace-nowrap px-4 md:flex-none md:px-5'
const sideAction = 'shrink-0 whitespace-nowrap px-4 md:px-5'

const complete = () => status.mutate({ id: props.list.id, action: 'complete' })

// « Terminer » à côté de l'action principale quand celle-ci est l'envoi (le faire ou le reprendre) ; s'il n'y tient pas (320 px,
// grands caractères), il passe en tête de « ⋮ »
const canResume = computed(() => props.list.isSent && uncheckedCount.value > 0)
const completeBeside = computed(() => canResume.value || canSend.value)
const row = useTemplateRef<HTMLElement>('row')
const sideWrapped = useWrappedRow(row)

/** Ce que range « ⋮ » : ce qui reste permis dans l'état de la liste, hors action principale et action secondaire. */
const moreActions = computed<UiAction[]>(() => [
  ...(completeBeside.value && sideWrapped.value
    ? [
        {
          key: 'complete',
          label: completeLabel.value,
          disabled: status.isPending.value,
          run: complete,
        },
      ]
    : []),
  ...otherActions.value,
])

const otherActions = computed<UiAction[]>(() => {
  const remove: UiAction = {
    key: 'delete',
    label: t('common.delete'),
    tone: 'danger',
    run: () => (deleting.value = true),
  }
  if (props.list.isSent)
    return [
      {
        key: 'reopen',
        label: t('shoppingList.reopen'),
        disabled: !online.value,
        run: () => (reopening.value = true),
      },
      remove,
    ]
  const renameAction: UiAction = { key: 'rename', label: t('shoppingList.rename'), run: openRename }
  if (!props.list.isActive) return [renameAction, remove]

  return [
    ...(canConfigureDrive.value
      ? [{ key: 'configure-drive', label: t('shoppingList.configureDrive'), run: configureDrive }]
      : []),
    renameAction,
    {
      key: 'pause',
      label: t('shoppingList.pause'),
      disabled: status.isPending.value,
      run: () => status.mutate({ id: props.list.id, action: 'pause' }),
    },
    remove,
  ]
})

const statusLabel = (list: ShoppingList) =>
  list.isActive ? 'active' : list.isPaused ? 'paused' : list.isSent ? 'sent' : 'completed'
</script>

<template>
  <header class="flex flex-col gap-3">
    <div>
      <p class="text-sm font-bold text-primary">
        {{
          list.isSent && list.sentAt
            ? t('shoppingList.sentOn', { date: d(new Date(list.sentAt), 'long') })
            : t(`shoppingList.status.${statusLabel(list)}`)
        }}
      </p>
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        <SeasonArt name="title-list" class="mr-2 size-9 align-middle md:size-10" />{{
          list.displayName
        }}
      </h1>
      <p v-if="list.name" class="mt-1 text-muted">
        {{ t('shoppingList.dateLabel', { date: list.dateLabel }) }}
      </p>
    </div>

    <!--
      Une seule rangée, même à 320 px : l'action principale de l'état de la liste à gauche, au plus une action secondaire, et le
      reste dans « ⋮ ». Liste envoyée au drive : lecture seule, seules la reprise de l'envoi, la fin, la réouverture et la
      suppression sont permises.
    -->
    <div class="flex items-center gap-2" data-test="list-actions">
      <!-- Seule la première ligne se voit : une action secondaire qui n'y tient pas passe dans « ⋮ » (useWrappedRow) -->
      <div
        ref="row"
        class="-m-1 flex h-13 min-w-0 flex-1 flex-wrap gap-x-2 gap-y-4 overflow-hidden p-1 md:flex-none"
      >
        <UiLinkButton
          v-if="canResume"
          :to="{ name: 'drive-send', params: { listId: list.id }, query: { ouvrir: '1' } }"
          :class="mainAction"
        >
          {{ t('shoppingList.resumeSend') }}
        </UiLinkButton>
        <UiButton
          v-else-if="canSend"
          variant="accent"
          :class="mainAction"
          :disabled="!online || checking"
          @click="askToSend"
        >
          {{ t('shoppingList.send') }}
        </UiButton>
        <!-- Sans envoi possible (navigateur, drive coupé, liste vide, tout est coché) : « Terminer » devient l'action principale -->
        <UiButton
          v-else-if="list.isActive || list.isSent"
          :class="mainAction"
          :disabled="status.isPending.value"
          @click="complete"
        >
          {{ completeLabel }}
        </UiButton>
        <UiButton
          v-else
          :class="mainAction"
          :disabled="status.isPending.value"
          @click="status.mutate({ id: list.id, action: 'activate' })"
        >
          {{ t('shoppingList.activate') }}
        </UiButton>
        <UiButton
          v-if="completeBeside"
          variant="secondary"
          :class="[sideAction, sideWrapped && 'invisible']"
          :disabled="status.isPending.value"
          @click="complete"
        >
          {{ completeLabel }}
        </UiButton>
      </div>
      <UiActionMenu :label="t('shoppingList.moreActions')" :actions="moreActions" />
    </div>

    <UiDialog
      v-model:open="renaming"
      :title="t('shoppingList.rename')"
      :description="t('shoppingList.renameHelp')"
    >
      <form class="flex flex-col gap-4" @submit.prevent="saveName">
        <UiField :label="t('shoppingList.name')" v-slot="{ id }">
          <UiTextInput :id="id" v-model="name" autocomplete="off" />
        </UiField>
        <div class="flex flex-wrap justify-end gap-2">
          <UiButton variant="ghost" @click="renaming = false">{{ t('common.cancel') }}</UiButton>
          <UiButton type="submit" :disabled="rename.isPending.value">{{
            t('common.save')
          }}</UiButton>
        </div>
      </form>
    </UiDialog>

    <!-- Application trop ancienne : la phrase de l'écran d'envoi et son bouton, aucun envoi n'est enregistré (DRV-641) -->
    <UiDialog
      v-model:open="updating"
      :title="t('shoppingList.send')"
      :description="
        unservedFor === null
          ? t('driveSend.appTooOld.text')
          : t('driveSend.appTooOld.textNamed', { retailer: retailerOf(unservedFor).name })
      "
    >
      <div class="flex justify-end">
        <UiLinkButton :to="{ name: 'drive-help' }">
          {{ t('driveSend.appTooOld.update') }}
        </UiLinkButton>
      </div>
    </UiDialog>

    <UiConfirmDialog
      v-model:open="sending"
      variant="primary"
      :title="t('shoppingList.sendTitle')"
      :description="t('shoppingList.sendHelp')"
      :confirm-label="t('shoppingList.send')"
      :pending="send.isPending.value"
      @confirm="confirmSend"
    />

    <UiConfirmDialog
      v-model:open="reopening"
      variant="primary"
      :title="t('shoppingList.reopenTitle')"
      :description="t('shoppingList.reopenHelp')"
      :confirm-label="t('shoppingList.reopen')"
      :pending="reopen.isPending.value"
      @confirm="confirmReopen"
    />

    <UiConfirmDialog
      v-model:open="deleting"
      :title="t('shoppingList.deleteTitle')"
      :description="t('shoppingList.deleteHelp', { name: list.displayName })"
      :confirm-label="t('common.delete')"
      :pending="remove.isPending.value"
      @confirm="confirmDelete"
    />
  </header>
</template>
