<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AuthLayout from '@/views/AuthLayout.vue'
import InstallApp from './InstallApp.vue'

// La page publique d'installation de l'application Android, `/installer` (DRV-639) : sans connexion, pour qu'on puisse envoyer son adresse à
// un proche. Dans l'application elle-même, la route renvoie à la page « Mettre à jour l'application » (`router/index.ts`).
const { t } = useI18n()
</script>

<template>
  <AuthLayout :title="t('install.title')">
    <InstallApp />
  </AuthLayout>
</template>
