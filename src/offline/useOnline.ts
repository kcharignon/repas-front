import { readonly, ref } from 'vue'

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
let listening = false

/** Le navigateur est-il connecté ? Un seul écouteur pour toute l'application ; l'état suit les événements `online` / `offline`. */
export function useOnline() {
  if (!listening && typeof window !== 'undefined') {
    listening = true
    window.addEventListener('online', () => (online.value = true))
    window.addEventListener('offline', () => (online.value = false))
  }

  return readonly(online)
}
