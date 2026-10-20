import { ref, watchEffect } from 'vue'
import { defineStore } from 'pinia'

export type ThemePreference = 'system' | 'light' | 'dark'

const KEY = 'repas.theme'
const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

/** Une préférence d'affichage, pas un secret : `localStorage` convient (le jeton d'accès, lui, n'y va jamais). */
function stored(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY)
    return PREFERENCES.find((preference) => preference === value) ?? 'system'
  } catch {
    return 'system'
  }
}

/** Pose (ou retire, pour `system`) le thème sur <html> : la feuille de style suit alors `prefers-color-scheme`. */
function applyTheme(preference: ThemePreference) {
  const root = document.documentElement
  if (preference === 'system') root.removeAttribute('data-theme')
  else root.dataset.theme = preference
}

/**
 * Applique le thème enregistré sans attendre le store (qui n'existait qu'une fois l'écran « Moi » ouvert) : appelée au démarrage.
 * `public/theme-init.js` fait la même lecture avant le premier affichage, pour éviter l'éclair du mauvais thème.
 */
export function applyStoredTheme() {
  applyTheme(stored())
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(stored())

  watchEffect(() => {
    applyTheme(preference.value)
    try {
      localStorage.setItem(KEY, preference.value)
    } catch {
      // Stockage indisponible (navigation privée) : le thème vaut pour la session.
    }
  })

  return { preference, preferences: PREFERENCES }
})
