<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { LOGO_LAYOUTS, LOGO_SHAPES, LOGO_WORD_PATH } from '@/design/logoGeometry'

/**
 * Le logo de Repas : le dessin (anneau-horloge, fourchette, couteau) et le mot « Repas » en Playfair Display Bold, en tracés.
 * Empilé par défaut ; horizontal quand la hauteur manque (moins de 88 px : en-tête, téléphone). Référence : docs/logo/README.md.
 * Le mot et le dessin prennent `currentColor` (la couleur du texte du parent) ; la coche est toujours en safran.
 */
defineProps<{ variant: 'stack' | 'horizontal' }>()

const { t } = useI18n()
const SAFFRON = '#f4b73f'
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="LOGO_LAYOUTS[variant].viewBox"
    role="img"
    :aria-label="t('app.name')"
    data-repas-logo
    :data-variant="variant"
  >
    <g :transform="LOGO_LAYOUTS[variant].iconTransform">
      <template v-for="(shape, i) in LOGO_SHAPES" :key="i">
        <path
          v-if="shape.stroke"
          :d="shape.d"
          fill="none"
          :stroke="shape.role === 'accent' ? SAFFRON : 'currentColor'"
          :stroke-width="shape.stroke"
          :stroke-linecap="shape.cap"
          stroke-linejoin="round"
        />
        <path v-else :d="shape.d" fill="currentColor" />
      </template>
    </g>
    <path
      :transform="LOGO_LAYOUTS[variant].wordTransform"
      :d="LOGO_WORD_PATH"
      fill="currentColor"
    />
  </svg>
</template>
