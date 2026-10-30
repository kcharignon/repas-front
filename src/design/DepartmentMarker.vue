<script setup lang="ts">
import { computed } from 'vue'

/**
 * Le repère d'un rayon (ING-017) : une petite pastille avec l'icône du rayon (flocon, boîte), posée DEVANT le nom d'un ingrédient
 * pour distinguer d'un coup d'œil deux ingrédients de même nom rangés dans deux rayons. Décoratif : jamais seul porteur d'une
 * information (le nom du rayon se lit toujours par ailleurs), donc caché aux lecteurs d'écran ; jamais dans un champ, un bouton ni une
 * case à cocher. Un rayon sans icône, ou une icône que ce front ne connaît pas encore (valeur future du back), n'affiche rien.
 * `reserve` garde la place d'une pastille quand d'autres lignes de la même liste en ont une (les noms restent alignés).
 */
const props = defineProps<{ icon?: string | null; size?: 'sm' | 'md'; reserve?: boolean }>()

const kind = computed(() =>
  props.icon === 'snowflake' || props.icon === 'can' ? props.icon : null,
)
const box = computed(() => (props.size === 'md' ? 'size-7 rounded-lg' : 'size-6 rounded-[7px]'))
const glyph = computed(() => (props.size === 'md' ? 'size-[18px]' : 'size-4'))
</script>

<template>
  <span
    v-if="kind !== null"
    aria-hidden="true"
    :data-department-marker="kind"
    :class="[
      'flex shrink-0 items-center justify-center',
      box,
      kind === 'snowflake' ? 'bg-cold-soft text-on-cold-soft' : 'bg-can-soft text-on-can-soft',
    ]"
  >
    <svg
      v-if="kind === 'snowflake'"
      :class="glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 2.5V21.5M9.6 4.6L12 6.9L14.4 4.6M9.6 19.4L12 17.1L14.4 19.4" />
      <g transform="rotate(60 12 12)">
        <path d="M12 2.5V21.5M9.6 4.6L12 6.9L14.4 4.6M9.6 19.4L12 17.1L14.4 19.4" />
      </g>
      <g transform="rotate(120 12 12)">
        <path d="M12 2.5V21.5M9.6 4.6L12 6.9L14.4 4.6M9.6 19.4L12 17.1L14.4 19.4" />
      </g>
    </svg>
    <svg
      v-else
      :class="glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 6.5c0-1.1 2.7-2 6-2s6 .9 6 2-2.7 2-6 2-6-.9-6-2z" />
      <path d="M6 6.5v11c0 1.1 2.7 2 6 2s6-.9 6-2v-11" />
      <path d="M6 11c0 1.1 2.7 2 6 2s6-.9 6-2" />
    </svg>
  </span>
  <span
    v-else-if="reserve"
    aria-hidden="true"
    :class="['shrink-0', size === 'md' ? 'size-7' : 'size-6']"
  />
</template>
