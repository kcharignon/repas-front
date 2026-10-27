import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { applySeason, followSeason, isHalloweenSeason, useSeasonStore } from '@/design/season'

const html = document.documentElement
const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content')

// Les dates sont construites en heure LOCALE (le jour de l'appareil), comme la règle.
const at = (year: number, month: number, day: number, h = 0, m = 0, s = 0) =>
  new Date(year, month - 1, day, h, m, s)

describe('thème saisonnier : la règle de dates', () => {
  it.each([
    ['le 14 octobre à 23:59:59', at(2026, 10, 14, 23, 59, 59), false],
    ['le 15 octobre à 00:00:00', at(2026, 10, 15, 0, 0, 0), true],
    ['le 27 octobre', at(2026, 10, 27, 12), true],
    ['le 31 octobre', at(2026, 10, 31, 12), true],
    ['le 1er novembre à 23:59:59', at(2026, 11, 1, 23, 59, 59), true],
    ['le 2 novembre à 00:00:00', at(2026, 11, 2, 0, 0, 0), false],
    ['en juin', at(2026, 6, 15, 12), false],
    ['le 1er octobre', at(2026, 10, 1, 12), false],
    ['le 30 novembre', at(2026, 11, 30, 12), false],
    ['le 31 décembre', at(2026, 12, 31, 23, 59, 59), false],
    ['le 1er janvier', at(2026, 1, 1, 0, 0, 0), false],
    // Une année bissextile ne décale rien : février compte un jour de plus, octobre et novembre non.
    ['le 29 février d’une année bissextile', at(2028, 2, 29, 12), false],
    ['le 15 octobre d’une année bissextile', at(2028, 10, 15, 0, 0, 0), true],
    ['le 2 novembre d’une année bissextile', at(2028, 11, 2, 0, 0, 0), false],
    // L'année ne compte pas : chaque année a sa saison.
    ['le 20 octobre 2027', at(2027, 10, 20, 12), true],
    ['le 20 octobre 2031', at(2031, 10, 20, 12), true],
    ['le 14 octobre 2027', at(2027, 10, 14, 12), false],
    ['le 1er novembre 2030', at(2030, 11, 1, 12), true],
  ])('%s : %s', (_, date, expected) => {
    expect(isHalloweenSeason(date)).toBe(expected)
  })

  it('lit le jour de l’appareil, pas celui du méridien de Greenwich', () => {
    // 23 h 59 min 59 s le 1er novembre, heure locale : encore la saison, quel que soit le décalage horaire de l'appareil.
    expect(isHalloweenSeason(new Date(2026, 10, 1, 23, 59, 59, 999))).toBe(true)
    expect(isHalloweenSeason(new Date(2026, 9, 15, 0, 0, 0, 0))).toBe(true)
  })

  it('sans argument, prend la date du jour', () => {
    vi.setSystemTime(at(2026, 10, 20, 9))
    expect(isHalloweenSeason()).toBe(true)

    vi.setSystemTime(at(2026, 6, 20, 9))
    expect(isHalloweenSeason()).toBe(false)
  })
})

describe('thème saisonnier : application', () => {
  beforeEach(() => {
    localStorage.clear()
    html.removeAttribute('data-season')
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#1E6B4C">')
    setActivePinia(createPinia())
  })
  afterEach(() => document.querySelector('meta[name="theme-color"]')?.remove())

  it('en saison : data-season sur <html> et barre du navigateur violette', () => {
    expect(applySeason(at(2026, 10, 20))).toBe(true)

    expect(html.dataset.season).toBe('halloween')
    expect(meta()).toBe('#43206b')
  })

  it('hors saison : rien sur <html>, la barre du navigateur retrouve son vert', () => {
    applySeason(at(2026, 10, 20))

    expect(applySeason(at(2026, 11, 2))).toBe(false)

    expect(html.hasAttribute('data-season')).toBe(false)
    expect(meta()).toBe('#1E6B4C')
  })

  it('désactivé par l’utilisateur : jamais de thème saisonnier, même en saison', () => {
    localStorage.setItem('repas.season', 'off')

    expect(applySeason(at(2026, 10, 20))).toBe(false)

    expect(html.hasAttribute('data-season')).toBe(false)
    expect(meta()).toBe('#1E6B4C')
  })

  it('sans balise theme-color, ne lève rien', () => {
    document.querySelector('meta[name="theme-color"]')?.remove()

    expect(() => applySeason(at(2026, 10, 20))).not.toThrow()
    expect(html.dataset.season).toBe('halloween')
  })

  it('un stockage indisponible laisse le décor activé, sans lever', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })

    expect(applySeason(at(2026, 10, 20))).toBe(true)
  })

  describe('le store', () => {
    it('est actif en saison par défaut et pose data-season', () => {
      vi.setSystemTime(at(2026, 10, 20))

      const season = useSeasonStore()

      expect(season.inSeason).toBe(true)
      expect(season.enabled).toBe(true)
      expect(season.active).toBe(true)
      expect(html.dataset.season).toBe('halloween')
    })

    it('hors saison : inactif, rien sur <html>', () => {
      const season = useSeasonStore()

      expect(season.inSeason).toBe(false)
      expect(season.active).toBe(false)
      expect(html.hasAttribute('data-season')).toBe(false)
    })

    it('retient le choix de couper le décor, et le retire en le rallumant', async () => {
      vi.setSystemTime(at(2026, 10, 20))
      const season = useSeasonStore()

      season.enabled = false
      await nextTick()

      expect(localStorage.getItem('repas.season')).toBe('off')
      expect(html.hasAttribute('data-season')).toBe(false)

      season.enabled = true
      await nextTick()

      expect(localStorage.getItem('repas.season')).toBeNull()
      expect(html.dataset.season).toBe('halloween')
    })

    it('relit le choix enregistré, et ignore une valeur inconnue', () => {
      vi.setSystemTime(at(2026, 10, 20))
      localStorage.setItem('repas.season', 'off')
      expect(useSeasonStore().enabled).toBe(false)

      setActivePinia(createPinia())
      localStorage.setItem('repas.season', 'peut-être')
      expect(useSeasonStore().enabled).toBe(true)
    })

    it('un choix coupé reste retenu hors saison : il revient l’an prochain', async () => {
      localStorage.setItem('repas.season', 'off')

      const season = useSeasonStore()
      await nextTick()

      expect(season.inSeason).toBe(false)
      expect(localStorage.getItem('repas.season')).toBe('off')
    })
  })

  describe('le suivi de la date', () => {
    let visibility: ReturnType<typeof vi.spyOn>
    let stop: () => void = () => {}

    beforeEach(() => {
      visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    })
    afterEach(() => stop())

    it('réévalue quand l’onglet redevient visible', async () => {
      vi.setSystemTime(at(2026, 10, 14, 12))
      const season = useSeasonStore()
      stop = followSeason()
      expect(season.active).toBe(false)

      vi.setSystemTime(at(2026, 10, 20, 12))
      document.dispatchEvent(new Event('visibilitychange'))

      await nextTick()
      expect(season.active).toBe(true)
      expect(html.dataset.season).toBe('halloween')
    })

    it('ne fait rien tant que l’onglet est caché', () => {
      vi.setSystemTime(at(2026, 10, 14, 12))
      const season = useSeasonStore()
      stop = followSeason()

      vi.setSystemTime(at(2026, 10, 20, 12))
      visibility.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))

      expect(season.active).toBe(false)
    })

    it('change de thème à minuit, sans rechargement : entrée dans la saison', async () => {
      vi.setSystemTime(at(2026, 10, 14, 23, 59, 0))
      const season = useSeasonStore()
      stop = followSeason()
      expect(season.active).toBe(false)

      await vi.advanceTimersByTimeAsync(30 * 1000)
      expect(season.active).toBe(false)

      await vi.advanceTimersByTimeAsync(31 * 1000)
      await nextTick()
      expect(season.active).toBe(true)
      expect(html.dataset.season).toBe('halloween')
    })

    it('change de thème à minuit : sortie de la saison, puis le minuit suivant est réarmé', async () => {
      vi.setSystemTime(at(2026, 11, 1, 23, 59, 0))
      const season = useSeasonStore()
      stop = followSeason()
      expect(season.active).toBe(true)

      await vi.advanceTimersByTimeAsync(62 * 1000)
      await nextTick()
      expect(season.active).toBe(false)
      expect(html.hasAttribute('data-season')).toBe(false)

      // Rien d'autre ne bouge pendant les jours suivants, mais le suivi continue : une minuterie reste armée.
      expect(vi.getTimerCount()).toBe(1)
    })

    it('l’arrêt retire l’écoute et la minuterie', () => {
      vi.setSystemTime(at(2026, 10, 14, 12))
      const season = useSeasonStore()
      stop = followSeason()

      stop()
      vi.setSystemTime(at(2026, 10, 20, 12))
      document.dispatchEvent(new Event('visibilitychange'))

      expect(season.active).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})

describe('thème saisonnier : au démarrage', () => {
  const initScript = readFileSync('public/theme-init.js', 'utf8')
  const runInitScript = () => new Function(initScript)()

  const state = () => ({ season: html.getAttribute('data-season'), color: meta() })

  beforeEach(() => {
    localStorage.clear()
    html.removeAttribute('data-season')
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#1E6B4C">')
  })
  afterEach(() => document.querySelector('meta[name="theme-color"]')?.remove())

  for (const [label, date] of [
    ['14 octobre 23:59:59', at(2026, 10, 14, 23, 59, 59)],
    ['15 octobre 00:00:00', at(2026, 10, 15)],
    ['31 octobre', at(2026, 10, 31, 12)],
    ['1er novembre 23:59:59', at(2026, 11, 1, 23, 59, 59)],
    ['2 novembre 00:00:00', at(2026, 11, 2)],
    ['juin', at(2026, 6, 15, 12)],
    ['15 octobre 2028 (bissextile)', at(2028, 10, 15)],
    ['2 novembre 2028 (bissextile)', at(2028, 11, 2)],
  ] as const) {
    for (const stored of [null, 'on', 'off', 'inconnu']) {
      it(`${label}, préférence ${stored ?? 'absente'} : le script d’amorçage et applySeason posent la même chose`, () => {
        vi.setSystemTime(date)
        const results = []
        for (const apply of [() => applySeason(), runInitScript]) {
          // Chacun part d'un état opposé : ce qui est posé vient de lui.
          html.dataset.season = 'halloween'
          document.querySelector('meta[name="theme-color"]')!.setAttribute('content', 'autre')
          if (stored === null) localStorage.removeItem('repas.season')
          else localStorage.setItem('repas.season', stored)

          apply()
          results.push(state())
        }

        expect(results[1]).toEqual(results[0])
        const expected = isHalloweenSeason(date) && stored !== 'off'
        expect(results[1]).toEqual({
          season: expected ? 'halloween' : null,
          color: expected ? '#43206b' : '#1E6B4C',
        })
      })
    }
  }

  it('un stockage indisponible laisse le décor activé, sans lever', () => {
    vi.setSystemTime(at(2026, 10, 20))
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })

    expect(runInitScript).not.toThrow()
    expect(html.dataset.season).toBe('halloween')
  })

  it('sans balise theme-color, ne lève rien', () => {
    vi.setSystemTime(at(2026, 10, 20))
    document.querySelector('meta[name="theme-color"]')?.remove()

    expect(runInitScript).not.toThrow()
    expect(html.dataset.season).toBe('halloween')
  })
})
