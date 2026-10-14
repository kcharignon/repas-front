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

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(stored())

  // `system` retire l'attribut : la feuille de style suit alors `prefers-color-scheme`.
  watchEffect(() => {
    const root = document.documentElement
    if (preference.value === 'system') root.removeAttribute('data-theme')
    else root.dataset.theme = preference.value
    try {
      localStorage.setItem(KEY, preference.value)
    } catch {
      // Stockage indisponible (navigation privée) : le thème vaut pour la session.
    }
  })

  return { preference, preferences: PREFERENCES }
})
