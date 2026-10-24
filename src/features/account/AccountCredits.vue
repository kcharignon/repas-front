<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Les crédits de « Moi » (back #53) : Flaticon demande de nommer le site et de renvoyer vers la licence. Les icônes des rayons et des
// ingrédients sont servies par le back (`/images`) ; le fichier de licence qui liste les auteurs du lot est servi au même endroit.
const { t } = useI18n()

const FLATICON_URL = 'https://www.flaticon.com'
const LICENSE_URL = '/images/ingredient/license/license.html'

const linkClass =
  'font-bold underline underline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary'
</script>

<template>
  <section class="flex flex-col gap-2" data-testid="account-credits">
    <h2 class="font-display text-2xl font-bold">{{ t('account.credits.title') }}</h2>
    <p class="text-muted">
      {{ t('account.credits.icons') }}
      <a :href="FLATICON_URL" target="_blank" rel="noopener noreferrer" :class="linkClass">
        {{ t('account.credits.site') }}
      </a>
      ·
      <a :href="LICENSE_URL" target="_blank" rel="noopener noreferrer" :class="linkClass">
        {{ t('account.credits.license') }}
      </a>
    </p>
  </section>
</template>
