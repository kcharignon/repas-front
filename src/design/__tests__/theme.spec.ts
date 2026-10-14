import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { useThemeStore } from '@/design/theme'

describe('thème', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    setActivePinia(createPinia())
  })

  it('suit le système par défaut : aucun attribut sur <html>', () => {
    useThemeStore()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('applique et retient le choix de l’utilisateur', async () => {
    const theme = useThemeStore()

    theme.preference = 'dark'
    await nextTick()

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('repas.theme')).toBe('dark')
  })

  it('revient au système en retirant l’attribut', async () => {
    const theme = useThemeStore()
    theme.preference = 'light'
    await nextTick()

    theme.preference = 'system'
    await nextTick()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('relit le choix enregistré, et ignore une valeur inconnue', () => {
    localStorage.setItem('repas.theme', 'dark')
    expect(useThemeStore().preference).toBe('dark')

    setActivePinia(createPinia())
    localStorage.setItem('repas.theme', 'violet')
    expect(useThemeStore().preference).toBe('system')
  })
})
