import { ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import type { DriveEvent } from './bridge'
import { restrictToPlan } from './restrictToPlan'
import type { ExpectedLine } from './restrictToPlan'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * Ce que le drive vient d'annoncer (résultat, refus, réponse mal formée) et où en est l'enregistrement des choix. En mémoire de la
 * page seulement : l'écran du retour le lit, même s'il s'ouvre après l'événement, et un échec d'enregistrement ne perd pas le résultat
 * (« Réessayer l'enregistrement »). Rien n'est gardé dans le navigateur : le brouillon de passage reste la seule trace (`driveBridge`).
 *
 * Le résultat d'un passage n'est enregistré qu'une fois recoupé avec le plan envoyé (DRV-614) : tout de suite quand le brouillon a gardé
 * les lignes du plan, sinon par `check` avec le plan relu du back (`checked` dit où l'on en est). Les lignes que le plan n'explique pas
 * sont retirées du résultat et comptées dans `ignored`.
 */
export const useDriveReturnStore = defineStore('driveReturn', () => {
  const event = shallowRef<DriveEvent | null>(null)
  const status = ref<SaveStatus>('idle')
  const error = shallowRef<unknown>(null)
  const checked = ref(false)
  const ignored = ref(0)

  /** Recoupe le résultat du passage avec les lignes attendues : il ne garde que celles-là. */
  function check(expected: readonly ExpectedLine[]) {
    const current = event.value
    if (current?.kind !== 'result' || current.result.type !== 'result') return
    const restricted = restrictToPlan(current.result, expected)
    event.value = { ...current, result: restricted.result }
    ignored.value = restricted.ignored
    checked.value = true
  }

  function receive(next: DriveEvent) {
    event.value = next
    status.value = 'idle'
    error.value = null
    checked.value = false
    ignored.value = 0
    if (next.kind === 'result' && next.draft.lines !== undefined) check(next.draft.lines)
  }

  function clear() {
    event.value = null
    status.value = 'idle'
    error.value = null
    checked.value = false
    ignored.value = 0
  }

  const saving = () => {
    status.value = 'saving'
    error.value = null
  }
  const saved = () => (status.value = 'saved')
  function failed(cause: unknown) {
    status.value = 'failed'
    error.value = cause
  }

  return { event, status, error, checked, ignored, receive, check, clear, saving, saved, failed }
})
