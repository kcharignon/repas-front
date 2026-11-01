<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DriveStorePayload } from '@/api'
import UiButton from '@/design/UiButton.vue'
import type { Drive } from './drives'
import StoreManualForm from './StoreManualForm.vue'
import { retailerParams } from './retailers'
import type { Retailer } from './retailers'
import { storeTail } from './storeAddress'

// Un drive de « Mes drives » (DRV-709) : son nom, son magasin, et ce qu'on peut en faire. Les textes prennent le nom du drive en paramètre.
const props = defineProps<{
  drive: Drive
  retailer: Retailer
  /**
   * Ce que la ligne propose pour lire le magasin : `button` (l'application le lit), `update` (l'application ne connaît pas ce drive : la phrase de
   * mise à jour), `browser` (dans un navigateur, seule la saisie à la main existe), `wait` (l'application n'a pas encore dit ce qu'elle sait servir).
   */
  reader: 'button' | 'update' | 'browser' | 'wait'
  /** La lecture du magasin de CE drive est en cours. */
  reading: boolean
  /** Une lecture ou une écriture est en cours quelque part : rien d'autre ne démarre. */
  busy: boolean
  online: boolean
  /** Les derniers chiffres du magasin qui vient d'être enregistré ici (et lu dans l'application). */
  savedTail: string | null
  /** Le nom du magasin enregistré, quand l'application l'a lu (jamais inventé). */
  savedLabel?: string | null
  readError: string | null
  save: (store: DriveStorePayload) => Promise<void>
}>()
const emit = defineEmits<{ read: []; remove: []; readAddress: [address: string] }>()

/** L'adresse du site mobile collée dans la saisie à la main (DRV-741) : l'écran la fait lire par l'application. */
const readAddress = (address: string): Promise<void> => {
  emit('readAddress', address)

  return Promise.resolve()
}

const { t: translate } = useI18n()
const t = (key: string, named: Record<string, unknown> = {}) =>
  translate(key, { ...retailerParams(props.retailer), retailer: props.drive.name, ...named })

// La saisie à la main n'existe que pour un drive dont le magasin se lit dans l'adresse ; elle est repliée quand l'application sait lire.
const canType = props.retailer.storeIdSource !== 'EXPLICIT'
const manualOpen = ref(props.reader === 'browser')
watch(
  () => props.readError,
  (error) => {
    if (error !== null) manualOpen.value = true
  },
)
</script>

<template>
  <li class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
    <h3 class="font-display text-xl font-bold">{{ drive.name }}</h3>
    <p v-if="savedTail" role="status" class="flex flex-col text-lg font-bold">
      <span v-if="savedLabel" class="break-words">{{ savedLabel }}</span>
      <span :class="{ 'text-sm font-normal text-muted': savedLabel }">{{
        t('driveSettings.readDone', { tail: savedTail })
      }}</span>
    </p>
    <p v-else-if="drive.store === null" class="font-bold">{{ t('driveSettings.none') }}</p>
    <p v-else class="flex flex-col">
      <span class="text-lg font-bold break-words">{{
        drive.store.label ??
        t('driveSettings.drives.storeNamed', { tail: storeTail(drive.store.id) })
      }}</span>
      <span v-if="drive.store.label" class="text-sm text-muted">{{
        t('driveSettings.drives.storeNamed', { tail: storeTail(drive.store.id) })
      }}</span>
    </p>

    <div v-if="reader === 'button'" class="flex flex-col items-start gap-2">
      <div class="flex flex-wrap gap-2">
        <UiButton
          :variant="drive.configured ? 'secondary' : 'primary'"
          :disabled="busy || !online"
          :aria-busy="reading ? 'true' : undefined"
          :aria-label="drive.configured ? t('driveSettings.drives.changeNamed') : undefined"
          @click="emit('read')"
          >{{
            drive.configured ? t('driveSettings.change') : t('driveSettings.drives.choose')
          }}</UiButton
        >
        <UiButton
          v-if="drive.configured"
          variant="ghost"
          class="px-2 text-danger"
          :disabled="busy || !online"
          @click="emit('remove')"
          >{{ t('driveSettings.drives.remove') }}</UiButton
        >
      </div>
      <p v-if="!drive.configured" class="text-sm text-muted">{{ t('driveSettings.readHelp') }}</p>
    </div>
    <template v-else>
      <p v-if="reader === 'update'" class="font-semibold">
        {{ t('driveSettings.drives.updateApp') }}
      </p>
      <p v-else-if="reader === 'browser' && !canType" class="text-muted">
        {{ t('driveSettings.drives.inApp') }}
      </p>
      <div v-if="drive.configured">
        <UiButton
          variant="ghost"
          class="px-2 text-danger"
          :disabled="busy || !online"
          @click="emit('remove')"
          >{{ t('driveSettings.drives.remove') }}</UiButton
        >
      </div>
    </template>
    <p v-if="readError" role="alert" class="text-sm font-semibold text-danger">{{ readError }}</p>
    <p v-if="!online && reader === 'button'" class="rounded-xl bg-soft px-4 py-3 font-semibold">
      {{ t('driveSettings.offline') }}
    </p>

    <StoreManualForm
      v-if="canType"
      v-model:open="manualOpen"
      :retailer="retailer"
      :store="drive.store"
      :locked="busy || !online"
      :online="online"
      :save="save"
      :read-address="reader === 'button' ? readAddress : null"
    />
  </li>
</template>
