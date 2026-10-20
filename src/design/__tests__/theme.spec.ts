import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { applyStoredTheme, useThemeStore } from '@/design/theme'

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

  describe('au démarrage', () => {
    const attribute = () => document.documentElement.getAttribute('data-theme')
    const initScript = readFileSync('public/theme-init.js', 'utf8')
    const runInitScript = () => new Function(initScript)()

    for (const [stored, expected] of [
      ['light', 'light'],
      ['dark', 'dark'],
      ['system', null],
      ['violet', null],
      [null, null],
    ] as const) {
      it(`${stored ?? 'rien d’enregistré'} : data-theme vaut ${expected ?? 'absent'}, comme avec le script d’amorçage`, () => {
        for (const apply of [applyStoredTheme, runInitScript]) {
          document.documentElement.dataset.theme = 'dark'
          if (stored === null) localStorage.removeItem('repas.theme')
          else localStorage.setItem('repas.theme', stored)

          apply()

          expect(attribute()).toBe(expected)
        }
      })
    }

    it('un stockage indisponible laisse le système décider, sans lever', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('stockage indisponible')
      })
      document.documentElement.dataset.theme = 'dark'

      expect(applyStoredTheme).not.toThrow()
      expect(attribute()).toBeNull()
      document.documentElement.dataset.theme = 'dark'
      expect(runInitScript).not.toThrow()
      expect(attribute()).toBeNull()
    })
  })
})
