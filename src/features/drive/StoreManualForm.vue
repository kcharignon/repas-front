<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DriveStorePayload } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { messageForFailure } from '@/notifications/failures'
import { retailerParams } from './retailers'
import type { Retailer } from './retailers'
import { parseMobileStoreAddress, parseStoreAddress } from './storeAddress'

// La saisie du magasin à la main (l'adresse et son nom), repliée quand l'application sait le lire. Un formulaire par drive : l'adresse
// se lit avec la règle de ce drive (`retailer`), et le texte d'aide donne l'exemple de ce drive.
const props = defineProps<{
  retailer: Retailer
  /** Le magasin enregistré chez ce drive : le formulaire le suit quand il change. */
  store: { id: string; baseUrl: string; label?: string | null } | null
  locked: boolean
  online: boolean
  /** Enregistre le magasin ; rejette si l'écriture échoue (l'échec s'affiche ici). */
  save: (store: DriveStorePayload) => Promise<void>
  /**
   * Dans l'application (DRV-741) : lit le magasin à l'adresse du site mobile que la personne a collée, au lieu de l'enregistrer (l'application l'ouvre
   * en mode ordinateur, l'enseigne la redirige vers le bon hôte, et la lecture du magasin est enregistrée par l'écran). Absent hors de l'application :
   * une adresse mobile y est expliquée, jamais enregistrée.
   */
  readAddress?: ((address: string) => Promise<void>) | null
}>()
const open = defineModel<boolean>('open', { default: false })

const { t: translate } = useI18n()
const t = (key: string) => translate(key, retailerParams(props.retailer))

const address = ref('')
const label = ref('')
watch(
  () => props.store,
  (next) => {
    address.value = next?.baseUrl ?? ''
    label.value = next?.label ?? ''
  },
  { immediate: true },
)
const addressError = ref<string | null>(null)
const failure = ref<string | null>(null)

const typed = computed(() => parseStoreAddress(address.value, props.retailer))
const otherStore = computed(
  () => props.store !== null && typed.value !== null && typed.value.id !== props.store.id,
)

async function submit() {
  failure.value = null
  const parsed = parseStoreAddress(address.value, props.retailer)
  if (parsed === null) {
    // L'adresse du site mobile n'est jamais enregistrée (son hôte n'est pas celui du magasin) : l'application la fait lire, un navigateur l'explique
    const mobile = parseMobileStoreAddress(address.value, props.retailer)
    if (mobile !== null && props.readAddress) {
      addressError.value = null
      await props.readAddress(mobile)

      return
    }
    addressError.value =
      mobile === null ? t('driveSettings.errors.address') : t('driveSettings.errors.mobile')

    return
  }
  addressError.value = null
  const name = label.value.trim()
  try {
    await props.save({ id: parsed.id, baseUrl: parsed.baseUrl, label: name === '' ? null : name })
  } catch (error) {
    failure.value = messageForFailure(error)
  }
}
</script>

<template>
  <details
    class="rounded-2xl border border-line bg-surface px-4 py-1"
    :open="open"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
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

      <p v-if="otherStore" role="status" class="rounded-xl bg-soft px-4 py-3 font-semibold">
        {{ t('driveSettings.changeWarning') }}
      </p>
      <p v-if="!online" class="rounded-xl bg-soft px-4 py-3 font-semibold">
        {{ t('driveSettings.offline') }}
      </p>
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
</template>
