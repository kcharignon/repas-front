<script setup lang="ts">
import { RouterView } from 'vue-router'

import AppToasts from '@/app/AppToasts.vue'
import { useDriveReturn } from '@/features/drive/useDriveReturn'

// Le résultat du drive peut arriver à tout moment : on l'écoute dès le démarrage, quel que soit l'écran ouvert
useDriveReturn()
</script>

<template>
  <RouterView />
  <AppToasts />
</template>
