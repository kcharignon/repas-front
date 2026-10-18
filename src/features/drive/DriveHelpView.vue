<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

import UiLinkButton from '@/design/UiLinkButton.vue'
import { APP_RELEASES_URL } from './appInstall'
import { driveBridge } from './bridge'
import DrivePrivacyFull from './DrivePrivacyFull.vue'

// Aide et installation de l'application Android (DRV-316) : lisible dans un navigateur comme dans l'application. Aucune donnée du
// back ; le texte est dans `driveHelp` (fr.ts), les clés ci-dessous ne font que l'ordonner.
const { t } = useI18n()
const route = useRoute()

const inApp = driveBridge.isAvailable()
const version = ref<string | null>(null)

const installSteps = ['chrome', 'download', 'allow', 'open', 'protect', 'launch'] as const
const firstLoginSteps = ['store', 'open', 'login', 'kept'] as const
const sendSteps = ['open', 'check', 'wait', 'back'] as const
const updateItems = ['site', 'how', 'version'] as const
const problems = [
  'blocked',
  'protect',
  'conflict',
  'login',
  'changed',
  'mobile',
  'webview',
] as const

// Les rubriques du sommaire : l'identifiant sert d'ancre (`/drive/aide#envoi`) ; le mode assisté n'a de sens que hors de l'application
const contents = [
  { id: 'installer', label: 'driveHelp.sections.install' },
  { id: 'ancienne-icone', label: 'driveHelp.sections.pwa' },
  { id: 'connexion-leclerc', label: 'driveHelp.sections.firstLogin' },
  { id: 'envoi', label: 'driveHelp.sections.send' },
  { id: 'mise-a-jour', label: 'driveHelp.sections.update' },
  { id: 'desinstaller', label: 'driveHelp.sections.uninstall' },
  { id: 'depannage', label: 'driveHelp.sections.troubleshooting' },
  ...(inApp ? [] : [{ id: 'mode-assiste', label: 'driveHelp.sections.assisted' }]),
  { id: 'vie-privee', label: 'drivePrivacy.full.title' },
]

const sectionClass = 'flex scroll-mt-4 flex-col gap-3 outline-none'
const linkClass =
  'inline-flex min-h-11 items-center font-bold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Amène la rubrique nommée par l'adresse (`#vie-privee`) à l'écran et y pose le focus. */
function showHash() {
  const target = route.hash === '' ? null : document.getElementById(route.hash.slice(1))
  if (target === null) return
  target.scrollIntoView()
  target.focus({ preventScroll: true })
}

watch(
  () => route.hash,
  () => void nextTick(showHash),
)

onMounted(() => {
  showHash()
  if (!inApp) return
  // L'application donne sa version ; si elle ne répond pas, la page s'en passe
  driveBridge.info().then(
    (info) => (version.value = info.version),
    () => undefined,
  )
})
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6">
    <header class="flex flex-col gap-3">
      <h1 class="font-display text-3xl leading-tight font-bold md:text-4xl">
        {{ t(inApp ? 'driveHelp.titleInApp' : 'driveHelp.title') }}
      </h1>
      <p class="max-w-prose text-muted">
        {{ t(inApp ? 'driveHelp.introInApp' : 'driveHelp.intro') }}
      </p>
      <p class="max-w-prose rounded-xl bg-soft px-4 py-3 font-semibold">
        <template v-if="!inApp">{{ t('driveHelp.state.browser') }}</template>
        <template v-else-if="version !== null">
          {{ t('driveHelp.state.inAppVersion', { version }) }}
        </template>
        <template v-else>{{ t('driveHelp.state.inApp') }}</template>
      </p>
    </header>

    <nav :aria-label="t('driveHelp.contents')" class="flex flex-col gap-1">
      <h2 class="font-display text-xl font-bold">{{ t('driveHelp.contents') }}</h2>
      <ul class="flex flex-col">
        <li v-for="entry in contents" :key="entry.id">
          <RouterLink :to="{ hash: `#${entry.id}` }" :class="linkClass">
            {{ t(entry.label) }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <section id="installer" tabindex="-1" aria-labelledby="installer-titre" :class="sectionClass">
      <h2 id="installer-titre" class="font-display text-2xl font-bold">
        {{ t('driveHelp.sections.install') }}
      </h2>
      <ol class="flex max-w-prose list-decimal flex-col gap-3 pl-6">
        <li v-for="step in installSteps" :key="step">
          {{ t(`driveHelp.install.${step}`) }}
          <a
            v-if="step === 'download'"
            :href="APP_RELEASES_URL"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t('driveHelp.downloadFor')"
            class="mt-2 flex min-h-11 w-fit items-center justify-center rounded-xl bg-primary px-5 font-bold text-on-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('driveHelp.download') }}
          </a>
        </li>
      </ol>
    </section>

    <section
      id="ancienne-icone"
      tabindex="-1"
      aria-labelledby="ancienne-icone-titre"
      :class="sectionClass"
    >
      <h2 id="ancienne-icone-titre" class="font-display text-2xl font-bold">
        {{ t('driveHelp.sections.pwa') }}
      </h2>
      <p class="max-w-prose">{{ t('driveHelp.pwa.text') }}</p>
      <p class="max-w-prose text-muted">{{ t('driveHelp.pwa.careful') }}</p>
    </section>

    <section
      id="connexion-leclerc"
      tabindex="-1"
      aria-labelledby="connexion-leclerc-titre"
      :class="sectionClass"
    >
      <h2 id="connexion-leclerc-titre" class="font-display text-2xl font-bold">
        {{ t('driveHelp.sections.firstLogin') }}
      </h2>
      <ol class="flex max-w-prose list-decimal flex-col gap-3 pl-6">
        <li v-for="step in firstLoginSteps" :key="step">
          {{ t(`driveHelp.firstLogin.${step}`) }}
          <div v-if="step === 'store'">
            <RouterLink :to="{ name: 'drive-settings' }" :class="linkClass">
              {{ t('driveHelp.firstLogin.settings') }}
            </RouterLink>
          </div>
        </li>
      </ol>
    </section>

    <section id="envoi" tabindex="-1" aria-labelledby="envoi-titre" :class="sectionClass">
      <h2 id="envoi-titre" class="font-display text-2xl font-bold">
        {{ t('driveHelp.sections.send') }}
      </h2>
      <ol class="flex max-w-prose list-decimal flex-col gap-3 pl-6">
        <li v-for="step in sendSteps" :key="step">{{ t(`driveHelp.send.${step}`) }}</li>
      </ol>
    </section>

    <section
      id="mise-a-jour"
      tabindex="-1"
      aria-labelledby="mise-a-jour-titre"
      :class="sectionClass"
    >
      <h2 id="mise-a-jour-titre" class="font-display text-2xl font-bold">
        {{ t('driveHelp.sections.update') }}
      </h2>
      <p v-for="item in updateItems" :key="item" class="max-w-prose">
        {{ t(`driveHelp.update.${item}`) }}
      </p>
    </section>

    <section
      id="desinstaller"
      tabindex="-1"
      aria-labelledby="desinstaller-titre"
      :class="sectionClass"
    >
      <h2 id="desinstaller-titre" class="font-display text-2xl font-bold">
        {{ t('driveHelp.sections.uninstall') }}
      </h2>
      <p class="max-w-prose">{{ t('driveHelp.uninstall.text') }}</p>
      <p class="max-w-prose">{{ t('driveHelp.uninstall.clear') }}</p>
    </section>

    <section id="depannage" tabindex="-1" aria-labelledby="depannage-titre" :class="sectionClass">
      <h2 id="depannage-titre" class="font-display text-2xl font-bold">
        {{ t('driveHelp.sections.troubleshooting') }}
      </h2>
      <div class="flex flex-col gap-2">
        <details
          v-for="problem in problems"
          :key="problem"
          class="group rounded-xl border border-line bg-surface"
        >
          <summary
            class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
          >
            {{ t(`driveHelp.problems.${problem}.q`) }}
            <ChevronRight
              class="size-5 shrink-0 text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <p class="max-w-prose px-4 pb-4">{{ t(`driveHelp.problems.${problem}.a`) }}</p>
        </details>
      </div>
    </section>

    <section
      v-if="!inApp"
      id="mode-assiste"
      tabindex="-1"
      aria-labelledby="mode-assiste-titre"
      :class="sectionClass"
    >
      <h2 id="mode-assiste-titre" class="font-display text-2xl font-bold">
        {{ t('driveHelp.sections.assisted') }}
      </h2>
      <p class="max-w-prose">{{ t('driveHelp.assisted.text') }}</p>
      <UiLinkButton variant="secondary" :to="{ name: 'shopping-list' }" class="self-start">
        {{ t('driveHelp.assisted.action') }}
      </UiLinkButton>
    </section>

    <DrivePrivacyFull />

    <div>
      <UiLinkButton variant="secondary" :to="{ name: 'shopping-list' }">
        {{ t('driveHelp.back') }}
      </UiLinkButton>
    </div>
  </main>
</template>
