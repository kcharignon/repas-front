<script setup lang="ts">
import {
  CircleCheck,
  Image,
  Link,
  LoaderCircle,
  Trash2,
  TriangleAlert,
  Upload,
  WifiOff,
} from 'lucide-vue-next'
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import { ApiError } from '@/api'
import UiButton from '@/design/UiButton.vue'
import UiImage from '@/design/UiImage.vue'
import UiTextInput from '@/design/UiTextInput.vue'
import { messageForImageFailure } from './imageFailures'
import { useStoreImageFromUrl, useUploadImage } from './queries'

/**
 * L'image d'un rayon ou d'un type de recette : on ENVOIE un fichier ou on COLLE un lien que le serveur télécharge. Le même bloc sert les deux
 * écrans d'administration. L'aperçu est la vraie tuile (image de 48 px et nom) ; l'image actuelle ne change que si l'envoi réussit, et rien
 * n'est gardé avant « Enregistrer » du formulaire (le seul bouton principal). Le chemin rendu par le serveur (`images/uploads/…`) va tel quel
 * dans le modèle ; l'image s'affiche toujours par une balise `<img>` (`UiImage`), jamais en `v-html` : un SVG n'entre jamais dans la page.
 */
const props = defineProps<{
  /** Le nom sous l'aperçu : celui du rayon ou du type, tel qu'il est tapé. */
  name: string
  /** Le nom de repli tant que le champ du nom est vide (« Rayon », « Type »). */
  unnamed: string
  /** « Ajoute une image. » : l'image est obligatoire et le formulaire a été validé sans elle. */
  error?: string
}>()

/** Le chemin de l'image (`''` : aucune). */
const model = defineModel<string>({ required: true })
/** Vrai pendant un envoi : le formulaire ne s'enregistre pas avant la fin, sinon il garderait l'ancienne image. */
const busy = defineModel<boolean>('busy', { default: false })

const { t } = useI18n()

/** Les formats que le serveur accepte (le JPEG ne gère pas la transparence), et le plafond de 3 Mio. */
const ACCEPTED = ['image/png', 'image/webp', 'image/svg+xml']
const MAX_BYTES = 3 * 1024 * 1024

const upload = useUploadImage()
const fromUrl = useStoreImageFromUrl()

type Phase = 'idle' | 'sending' | 'fetching'
const phase = ref<Phase>('idle')
const ready = ref(false)
const failure = ref<{ text: string; offline: boolean } | null>(null)
const linkOpen = ref(false)
const link = ref('')

const labelId = useId()
const hintId = useId()
const errorId = useId()
const linkId = useId()
const fileInput = ref<HTMLInputElement | null>(null)
const uploadButton = ref<InstanceType<typeof UiButton> | null>(null)
const linkInput = ref<InstanceType<typeof UiTextInput> | null>(null)

const hasImage = computed(() => model.value !== '')
const working = computed(() => phase.value !== 'idle')
const tileName = computed(() => props.name.trim() || props.unnamed)
const missing = computed(() =>
  props.error && !hasImage.value && failure.value === null ? props.error : null,
)

/** Donne le focus à un composant une fois l'écran à jour (le champ du lien n'existe qu'après son affichage). */
const focus = async (target: () => { $el?: unknown } | null) => {
  await nextTick()
  const element = target()?.$el
  if (element instanceof HTMLElement) element.focus()
}

function refuse(error: unknown) {
  failure.value = {
    text: messageForImageFailure(error),
    offline: error instanceof ApiError && error.status === 0,
  }
}

function finish(path: string) {
  model.value = path
  ready.value = true
  failure.value = null
  linkOpen.value = false
  link.value = ''
}

async function leave(phaseDone: Phase, succeeded: boolean) {
  // Le bouton qui avait le focus vient d'être désactivé : le focus va où l'administrateur attend la suite
  phase.value = 'idle'
  busy.value = false
  if (phaseDone === 'fetching' && !succeeded) await focus(() => linkInput.value)
  else await focus(() => uploadButton.value)
}

function chooseFile() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Le même fichier doit pouvoir être choisi deux fois de suite
  input.value = ''
  // Fenêtre fermée sans choix : rien ne change
  if (file === undefined) return

  ready.value = false
  failure.value = null
  // Refus tout de suite, sans appel réseau : le serveur dirait la même chose (il juge le contenu, jamais l'extension)
  if (file.type !== '' && !ACCEPTED.includes(file.type)) {
    failure.value = { text: t('admin.image.errors.notAnImage'), offline: false }
    return
  }
  if (file.size > MAX_BYTES) {
    failure.value = { text: t('admin.image.errors.tooLarge'), offline: false }
    return
  }

  phase.value = 'sending'
  busy.value = true
  try {
    finish(await upload.mutateAsync(file))
    await leave('sending', true)
  } catch (error) {
    refuse(error)
    await leave('sending', false)
  }
}

async function openLink() {
  failure.value = null
  linkOpen.value = true
  await focus(() => linkInput.value)
}

function closeLink() {
  linkOpen.value = false
  link.value = ''
  failure.value = null
  void focus(() => uploadButton.value)
}

async function useLink() {
  const url = link.value.trim()
  if (url === '' || working.value) return
  ready.value = false
  failure.value = null
  phase.value = 'fetching'
  busy.value = true
  try {
    finish(await fromUrl.mutateAsync(url))
    await leave('fetching', true)
  } catch (error) {
    refuse(error)
    await leave('fetching', false)
  }
}

function remove() {
  model.value = ''
  ready.value = false
  failure.value = null
  void focus(() => uploadButton.value)
}
</script>

<template>
  <div
    role="group"
    :aria-labelledby="labelId"
    :aria-describedby="[hintId, missing ? errorId : null].filter(Boolean).join(' ')"
    :aria-busy="working ? 'true' : undefined"
    class="flex flex-col gap-1.5"
  >
    <span :id="labelId" class="text-sm font-semibold">{{ t('admin.image.label') }}</span>
    <p :id="hintId" class="text-sm text-muted">{{ t('admin.image.hint') }}</p>

    <div
      class="mt-1 grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]"
    >
      <div
        role="img"
        :aria-label="
          hasImage ? t('admin.image.preview', { name: tileName }) : t('admin.image.previewNone')
        "
        data-testid="image-preview"
        :class="[
          'flex min-h-22 flex-col items-center gap-1 rounded-2xl border-[1.5px] px-1 pt-2.5 pb-2 text-center text-sm leading-tight',
          hasImage ? 'border-line bg-surface' : 'border-dashed border-line bg-transparent',
        ]"
      >
        <span class="relative flex size-12 items-center justify-center" aria-hidden="true">
          <UiImage v-if="hasImage" :src="model" class="size-12" />
          <Image v-else class="size-8 text-muted" />
          <span
            v-if="working"
            class="absolute inset-0 grid place-items-center rounded-lg bg-surface/70"
          >
            <LoaderCircle class="size-6 animate-spin text-primary" stroke-width="3" />
          </span>
        </span>
        <span aria-hidden="true" class="line-clamp-2 break-words">{{ tileName }}</span>
      </div>

      <div class="flex min-w-0 flex-col items-stretch gap-1.5">
        <UiButton
          ref="uploadButton"
          variant="secondary"
          class="justify-start px-3 text-left leading-tight"
          :disabled="working"
          @click="chooseFile"
        >
          <Upload class="size-5 shrink-0" aria-hidden="true" />
          {{ hasImage ? t('admin.image.replace') : t('admin.image.upload') }}
        </UiButton>
        <UiButton
          variant="ghost"
          class="justify-start px-3 text-left leading-tight"
          :disabled="working"
          :aria-expanded="linkOpen"
          @click="openLink"
        >
          <Link class="size-5 shrink-0" aria-hidden="true" />
          {{ t('admin.image.pasteLink') }}
        </UiButton>
        <UiButton
          v-if="hasImage && !working"
          variant="ghost"
          class="justify-start px-3 text-left leading-tight text-danger"
          @click="remove"
        >
          <Trash2 class="size-5 shrink-0" aria-hidden="true" />
          {{ t('admin.image.remove') }}
        </UiButton>
      </div>

      <div v-if="linkOpen" class="col-span-full flex flex-col gap-2">
        <label :for="linkId" class="text-sm font-semibold">{{ t('admin.image.linkLabel') }}</label>
        <UiTextInput
          :id="linkId"
          ref="linkInput"
          v-model="link"
          type="url"
          inputmode="url"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="t('admin.image.linkPlaceholder')"
          :disabled="working"
          @keydown.enter.prevent="useLink"
        />
        <div class="flex flex-wrap gap-2">
          <UiButton variant="secondary" :disabled="working || link.trim() === ''" @click="useLink">
            {{ t('admin.image.useLink') }}
          </UiButton>
          <UiButton variant="ghost" :disabled="working" @click="closeLink">
            {{ t('common.cancel') }}
          </UiButton>
        </div>
      </div>

      <div role="status" aria-live="polite" class="col-span-full empty:hidden">
        <div v-if="working" class="flex flex-col gap-2">
          <p class="text-sm font-semibold">
            {{ phase === 'sending' ? t('admin.image.sending') : t('admin.image.fetching') }}
          </p>
          <div
            role="progressbar"
            :aria-label="phase === 'sending' ? t('admin.image.sending') : t('admin.image.fetching')"
            class="image-progress h-2 overflow-hidden rounded-full bg-line"
          >
            <i class="block h-full w-2/5 rounded-full bg-primary" />
          </div>
        </div>
        <p
          v-else-if="ready"
          class="flex items-start gap-2 rounded-xl bg-secret-soft px-3 py-2.5 text-sm font-semibold text-on-secret-soft"
        >
          <CircleCheck class="mt-px size-5 shrink-0" aria-hidden="true" />
          <span>{{ t('admin.image.ready') }}</span>
        </p>
      </div>

      <p
        v-if="failure || missing"
        :id="failure ? undefined : errorId"
        role="alert"
        class="col-span-full flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-semibold text-on-danger-soft"
      >
        <WifiOff v-if="failure?.offline" class="mt-px size-5 shrink-0" aria-hidden="true" />
        <TriangleAlert v-else class="mt-px size-5 shrink-0" aria-hidden="true" />
        <span>{{ failure?.text ?? missing }}</span>
      </p>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/webp,image/svg+xml"
      class="hidden"
      data-testid="image-file"
      @change="onFile"
    />
  </div>
</template>

<style scoped>
/* La barre sans pourcentage (un fetch ne sait pas dire où en est un envoi) : un trait qui traverse ; immobile pour qui le demande */
.image-progress > i {
  animation: image-progress 1.4s ease-in-out infinite;
}

@keyframes image-progress {
  0% {
    margin-left: -40%;
  }
  100% {
    margin-left: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .image-progress > i {
    animation: none;
    width: 100%;
    opacity: 0.5;
  }
}
</style>
