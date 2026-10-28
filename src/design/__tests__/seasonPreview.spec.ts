import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { me } from '@/__tests__/helpers'
import fr from '@/i18n/fr'
import { SEASONS, followSeason, useSeasonStore } from '@/design/season'
import { PACKS } from '@/design/season/art'
import { useSessionStore } from '@/session/session'

// ADR 0013 : l'aperçu des thèmes de l'administrateur, en mémoire seulement.

const html = document.documentElement
const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content')
const admin = { ...me, roles: ['ROLE_USER', 'ROLE_ADMIN'], isAdmin: true }

/** Une saison posée dans le calendrier : le 20 octobre (Halloween) ou le 20 décembre (Noël). */
const inHalloween = () => vi.setSystemTime(new Date(2026, 9, 20, 12))

describe('aperçu des thèmes de l’administrateur', () => {
  let visibility: ReturnType<typeof vi.spyOn>
  let stop: () => void = () => {}

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    html.removeAttribute('data-season')
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#1E6B4C">')
    setActivePinia(createPinia())
    visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })
  afterEach(() => {
    stop()
    stop = () => {}
    document.querySelector('meta[name="theme-color"]')?.remove()
  })

  function asAdmin() {
    useSessionStore().user = admin
    return useSeasonStore()
  }

  it('hors saison, un administrateur voit la saison choisie, jusque dans la barre du navigateur', async () => {
    const season = asAdmin()

    season.setPreview('noel')
    await nextTick()

    expect(season.activeSeason).toBe('noel')
    expect(html.dataset.season).toBe('noel')
    expect(meta()).toBe('#7a1530')
    // Le calendrier, lui, n'a pas bougé.
    expect(season.season).toBeNull()
  })

  it('passe avant le calendrier et avant l’interrupteur du décor', async () => {
    inHalloween()
    localStorage.setItem('repas.season', 'halloween')
    const season = asAdmin()
    expect(season.activeSeason).toBeNull()

    season.setPreview('halloween')
    await nextTick()
    expect(html.dataset.season).toBe('halloween')

    // « Sans décor » force le thème de base en pleine saison.
    setActivePinia(createPinia())
    localStorage.clear()
    const other = asAdmin()
    expect(other.activeSeason).toBe('halloween')

    other.setPreview('none')
    await nextTick()
    expect(other.activeSeason).toBeNull()
    expect(html.hasAttribute('data-season')).toBe(false)
    expect(meta()).toBe('#1E6B4C')

    other.setPreview(null)
    await nextTick()
    expect(html.dataset.season).toBe('halloween')
  })

  it('n’écrit rien dans le navigateur', async () => {
    const season = asAdmin()
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const before = JSON.stringify({ ...localStorage })

    for (const choice of ['noel', 'halloween', 'none', null] as const) {
      season.setPreview(choice)
      await nextTick()
    }

    expect(write).not.toHaveBeenCalled()
    expect(JSON.stringify({ ...localStorage })).toBe(before)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })

  it('un utilisateur qui n’est pas administrateur ne peut pas le poser', async () => {
    useSessionStore().user = me
    const season = useSeasonStore()

    season.setPreview('noel')
    await nextTick()

    expect(season.preview).toBeNull()
    expect(season.activeSeason).toBeNull()
    expect(html.hasAttribute('data-season')).toBe(false)
  })

  it('sans session, rien non plus', () => {
    const season = useSeasonStore()

    season.setPreview('halloween')

    expect(season.preview).toBeNull()
  })

  it('est effacé à la déconnexion', async () => {
    const session = useSessionStore()
    const season = asAdmin()
    season.setPreview('noel')
    await nextTick()

    session.user = null
    await nextTick()

    expect(season.preview).toBeNull()
    expect(html.hasAttribute('data-season')).toBe(false)
  })

  it('est effacé quand le compte cesse d’être administrateur', async () => {
    const season = asAdmin()
    season.setPreview('noel')

    useSessionStore().user = me
    await nextTick()

    expect(season.preview).toBeNull()
  })

  describe('en quittant la page', () => {
    it('est effacé quand la page devient cachée', async () => {
      const season = asAdmin()
      stop = followSeason()
      season.setPreview('noel')

      visibility.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      await nextTick()

      expect(season.preview).toBeNull()
      expect(html.hasAttribute('data-season')).toBe(false)
    })

    it('est effacé sur pagehide', async () => {
      const season = asAdmin()
      stop = followSeason()
      season.setPreview('halloween')

      window.dispatchEvent(new Event('pagehide'))
      await nextTick()

      expect(season.preview).toBeNull()
    })

    it('reste posé quand la page redevient visible ou que la date est relue', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
      inHalloween()
      const season = asAdmin()
      stop = followSeason()
      season.setPreview('noel')

      // Un onglet qui redevient visible relit le calendrier, jamais l'aperçu.
      document.dispatchEvent(new Event('visibilitychange'))
      await nextTick()
      expect(season.preview).toBe('noel')
      expect(html.dataset.season).toBe('noel')

      // Minuit : le calendrier avance derrière l'aperçu.
      vi.setSystemTime(new Date(2026, 10, 15, 0, 0, 5))
      await vi.advanceTimersByTimeAsync(24 * 3600 * 1000)
      await nextTick()
      expect(season.season).toBe('noel')
      expect(season.preview).toBe('noel')
    })

    it('le calendrier continue de s’actualiser derrière l’aperçu', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
      vi.setSystemTime(new Date(2026, 10, 1, 23, 59, 0))
      const season = asAdmin()
      stop = followSeason()
      season.setPreview('none')
      expect(season.season).toBe('halloween')

      await vi.advanceTimersByTimeAsync(62 * 1000)
      await nextTick()

      expect(season.season).toBeNull()
      expect(season.preview).toBe('none')
    })

    it('l’arrêt du suivi retire aussi l’écoute de pagehide', () => {
      const season = asAdmin()
      stop = followSeason()
      stop()
      season.setPreview('noel')

      window.dispatchEvent(new Event('pagehide'))

      expect(season.preview).toBe('noel')
    })
  })
})

// Ajouter une saison ne demande qu'une entrée de données et une clé de libellé : aucune vue ne change.
describe('chaque saison de SEASONS', () => {
  it.each(SEASONS)('%s a son libellé d’aperçu et son pack d’illustrations', (name) => {
    const names = fr.season.name as Record<string, string>

    expect(names[name]).toEqual(expect.any(String))
    expect(names[name]).not.toBe('')
    expect(PACKS[name]).toBeDefined()
    expect(Object.keys(PACKS[name]).length).toBeGreaterThan(0)
  })

  it('aucun libellé de nom pour une saison qui n’existe pas', () => {
    expect(Object.keys(fr.season.name).sort()).toEqual([...SEASONS].sort())
  })
})
