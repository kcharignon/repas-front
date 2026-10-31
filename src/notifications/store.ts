import { ref } from 'vue'
import { defineStore } from 'pinia'

export type NotificationKind = 'success' | 'error'

/** Un geste proposé avec le message (« Voir ») : un bouton qui fait `run`, puis ferme le message. */
export interface NotificationAction {
  label: string
  run: () => void
}

export interface Notification {
  id: number
  kind: NotificationKind
  text: string
  action?: NotificationAction
}

const LIFETIME_MS = 6000

/** Les retours à l'utilisateur après une action (enregistré, refusé, conflit) : affichés par `AppToasts`, lus par les lecteurs d'écran. */
export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<Notification[]>([])
  let next = 1

  function dismiss(id: number) {
    items.value = items.value.filter((item) => item.id !== id)
  }

  function push(
    kind: NotificationKind,
    text: string,
    lifetime = LIFETIME_MS,
    action?: NotificationAction,
  ) {
    const id = next++
    items.value = [...items.value, { id, kind, text, ...(action === undefined ? {} : { action }) }]
    if (lifetime > 0) setTimeout(() => dismiss(id), lifetime)

    return id
  }

  return { items, push, dismiss }
})
