import { ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import type { DriveEvent } from './bridge'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * Ce que le drive vient d'annoncer (résultat, refus, réponse mal formée) et où en est l'enregistrement des choix. En mémoire de la
 * page seulement : l'écran du retour le lit, même s'il s'ouvre après l'événement, et un échec d'enregistrement ne perd pas le résultat
 * (« Réessayer l'enregistrement »). Rien n'est gardé dans le navigateur : le brouillon de passage reste la seule trace (`driveBridge`).
 */
export const useDriveReturnStore = defineStore('driveReturn', () => {
  const event = shallowRef<DriveEvent | null>(null)
  const status = ref<SaveStatus>('idle')
  const error = shallowRef<unknown>(null)

  function receive(next: DriveEvent) {
    event.value = next
    status.value = 'idle'
    error.value = null
  }

  function clear() {
    event.value = null
    status.value = 'idle'
    error.value = null
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

  return { event, status, error, receive, clear, saving, saved, failed }
})
