<script setup lang="ts">
import { EllipsisVertical } from 'lucide-vue-next'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { ref, useTemplateRef } from 'vue'

import UiButton from './UiButton.vue'
import { cn } from './cn'

/** Une action du menu : son libellé, ce qu'elle fait ; `danger` pour une action destructive (couleur de danger). */
export interface UiAction {
  key: string
  label: string
  run: () => void
  disabled?: boolean
  tone?: 'danger'
  /** Une courte raison, écrite sous le libellé : pourquoi l'action est grisée. */
  hint?: string
}

defineProps<{
  /** Le nom accessible du bouton « ⋮ » (« Plus d'actions »). */
  label: string
  actions: UiAction[]
}>()

const open = ref(false)
const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger')

/*
 * Le menu se ferme AVANT que l'action choisie ne s'exécute : le focus revient au bouton « ⋮ », puis l'action ouvre au besoin sa
 * fenêtre (renommer, confirmer la suppression), qui rendra le focus à ce même bouton en se fermant. Fermé par un clic ailleurs,
 * le menu laisse le focus là où l'utilisateur l'a mis.
 */
let pending: (() => void) | null = null
let interactedOutside = false

function choose(action: UiAction) {
  pending = action.run
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  if (!interactedOutside) trigger.value?.$el.focus()
  interactedOutside = false
  const run = pending
  pending = null
  run?.()
}
</script>

<template>
  <DropdownMenuRoot v-model:open="open" :modal="false">
    <DropdownMenuTrigger as-child>
      <UiButton ref="trigger" variant="secondary" size="icon" :aria-label="label" class="shrink-0">
        <EllipsisVertical class="size-5" aria-hidden="true" />
      </UiButton>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        side="bottom"
        align="end"
        :side-offset="6"
        :collision-padding="16"
        loop
        class="z-50 flex min-w-48 flex-col gap-0.5 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-lg"
        @close-auto-focus="onCloseAutoFocus"
        @interact-outside="interactedOutside = true"
      >
        <DropdownMenuItem
          v-for="action in actions"
          :key="action.key"
          :disabled="action.disabled"
          :class="
            cn(
              'flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-base font-semibold whitespace-nowrap outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-soft',
              action.tone === 'danger' &&
                'text-danger data-highlighted:bg-danger-soft data-highlighted:text-on-danger-soft',
            )
          "
          @select="choose(action)"
        >
          <span class="flex flex-col">
            <span>{{ action.label }}</span>
            <span v-if="action.hint" class="text-sm font-normal">{{ action.hint }}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
