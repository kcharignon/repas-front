<script setup lang="ts">
import { RouterView } from 'vue-router'

import AppToasts from '@/app/AppToasts.vue'
import { useAppVersionReport } from '@/features/drive/useAppVersionReport'
import { useDriveReturn } from '@/features/drive/useDriveReturn'

// Le résultat du drive peut arriver à tout moment : on l'écoute dès le démarrage, quel que soit l'écran ouvert
useDriveReturn()
// Dans l'application, une fois la session ouverte : le serveur apprend sa version (DRV-637)
useAppVersionReport()
</script>

<template>
  <RouterView />
  <AppToasts />
</template>
