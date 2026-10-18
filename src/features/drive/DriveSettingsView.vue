<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'

import { hasFailed } from '@/api/query'
import UiButton from '@/design/UiButton.vue'
import UiField from '@/design/UiField.vue'
import UiLinkButton from '@/design/UiLinkButton.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { isStale, messageForFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useOnline } from '@/offline/useOnline'
import { driveBridge } from './bridge'
import { useDriveChoices } from './choicesQueries'
import DrivePrivacyNote from './DrivePrivacyNote.vue'
import { driveKeys, useDriveSettings, useSaveDriveSettings } from './queries'
import { parseStoreAddress, storeTail } from './storeAddress'
import { canReadStoreFromApp, readStoreFromApp, StoreReadError } from './storeReader'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const notifications = useNotificationsStore()
const online = useOnline()

const settings = useDriveSettings()
const enabled = computed(() => settings.data.value?.enabled === true)
const store = computed(() => settings.data.value?.store ?? null)

// Le formulaire : l'adresse du magasin et son nom. Ils suivent le magasin enregistré quand celui-ci change (enregistrement, relecture).
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
const save = useSaveDriveSettings()
const locked = computed(() => !online.value || save.isPending.value)

const typed = computed(() => parseStoreAddress(address.value))
const otherStore = computed(
  () => store.value !== null && typed.value !== null && typed.value.id !== store.value.id,
)

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
  notifications.push('success', t('driveSettings.saved'))
  // L'envoi nous a menés ici faute de magasin : une fois enregistré, la raison n'existe plus
  if (route.query.magasin !== undefined) await router.replace({ name: 'drive-settings' })
}

// La lecture du magasin par l'application (module à part : branché à l'intégration)
const canRead = canReadStoreFromApp()
const reading = ref(false)
const readDone = ref<string | null>(null)
const readError = ref<string | null>(null)

async function readFromApp() {
  reading.value = true
  readDone.value = null
  readError.value = null
  try {
    const found = await readStoreFromApp()
    const parsed = parseStoreAddress(found.baseUrl)
    if (parsed === null || parsed.id !== found.id) throw new StoreReadError('FAILED')
    address.value = parsed.baseUrl
    addressError.value = null
    // L'agent ne lit pas le nom : celui d'un autre magasin ne convient plus
    label.value = found.label ?? (parsed.id === store.value?.id ? label.value : '')
    readDone.value = t('driveSettings.readDone', { tail: storeTail(parsed.id) })
  } catch (error) {
    const code = error instanceof StoreReadError ? error.code : 'FAILED'
    readError.value = t(`driveSettings.readErrors.${code}`)
  } finally {
    reading.value = false
  }
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
      :to="{ name: 'account' }"
      class="inline-flex min-h-11 items-center self-start font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {{ t('driveSettings.back') }}
    </RouterLink>
    <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
      {{ t('driveSettings.title') }}
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
      <DrivePrivacyNote />

      <section class="flex flex-col gap-3" aria-labelledby="store-title">
        <h2 id="store-title" class="font-display text-2xl font-bold">
          {{ t('driveSettings.store') }}
        </h2>
        <p v-if="store === null && route.query.magasin === 'requis'" role="status" :class="notice">
          {{ t('driveSettings.storeRequired') }}
        </p>
        <div :class="card">
          <p v-if="store === null" class="font-bold">{{ t('driveSettings.none') }}</p>
          <p v-else class="flex flex-col">
            <span class="text-lg font-bold break-words">{{
              store.label ?? t('driveSettings.storeNamed', { tail: storeTail(store.id) })
            }}</span>
            <span v-if="store.label" class="text-sm text-muted">{{
              t('driveSettings.storeNamed', { tail: storeTail(store.id) })
            }}</span>
          </p>
          <p class="text-sm text-muted">{{ t('driveSettings.storeHelp') }}</p>
        </div>

        <form :class="card" novalidate @submit.prevent="submit">
          <div v-if="canRead" class="flex flex-col items-start gap-2">
            <UiButton variant="secondary" :disabled="locked || reading" @click="readFromApp">{{
              t('driveSettings.read')
            }}</UiButton>
            <p class="text-sm text-muted">{{ t('driveSettings.readHelp') }}</p>
            <p v-if="readDone" role="status" class="text-sm font-semibold">{{ readDone }}</p>
            <p v-if="readError" role="alert" class="text-sm font-semibold text-danger">
              {{ readError }}
            </p>
          </div>

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
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="app-title">
        <h2 id="app-title" class="font-display text-2xl font-bold">{{ t('driveSettings.app') }}</h2>
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
            <UiLinkButton variant="secondary" :to="{ name: 'drive-help' }">{{
              t('driveSettings.help')
            }}</UiLinkButton>
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
  </main>
</template>
