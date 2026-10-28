<script setup lang="ts">
import { RouterView } from 'vue-router'

import AppToasts from '@/app/AppToasts.vue'
import { useAppVersionReport } from '@/features/drive/useAppVersionReport'
import SeasonCorner from '@/design/season/SeasonCorner.vue'
import SeasonScene from '@/design/season/SeasonScene.vue'
import { useDriveReturn } from '@/features/drive/useDriveReturn'

// Le résultat du drive peut arriver à tout moment : on l'écoute dès le démarrage, quel que soit l'écran ouvert
useDriveReturn()
// Dans l'application, une fois la session ouverte : le serveur apprend sa version (DRV-637)
useAppVersionReport()
</script>

<template>
  <!-- Le décor de saison (ADR 0012), posé une fois : rien hors saison, rien quand l'utilisateur l'a coupé -->
  <SeasonScene />
  <SeasonCorner />
  <RouterView />
  <AppToasts />
</template>
