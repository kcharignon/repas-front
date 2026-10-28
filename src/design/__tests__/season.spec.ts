import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import {
  applySeason,
  currentSeason,
  followSeason,
  isHalloweenSeason,
  isNoelSeason,
  useSeasonStore,
} from '@/design/season'

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

describe('thème de Noël : la règle de dates', () => {
  it.each([
    ['le 14 novembre à 23:59:59', at(2026, 11, 14, 23, 59, 59), false],
    ['le 15 novembre à 00:00:00', at(2026, 11, 15, 0, 0, 0), true],
    ['le 30 novembre', at(2026, 11, 30, 12), true],
    ['le 24 décembre', at(2026, 12, 24, 20), true],
    ['le 31 décembre à 23:59:59', at(2026, 12, 31, 23, 59, 59), true],
    ['le 1er janvier à 00:00:00', at(2027, 1, 1, 0, 0, 0), true],
    ['le 5 janvier à 23:59:59', at(2027, 1, 5, 23, 59, 59), true],
    ['le 6 janvier à 00:00:00', at(2027, 1, 6, 0, 0, 0), false],
    ['le 2 novembre', at(2026, 11, 2, 12), false],
    ['le 14 novembre', at(2026, 11, 14, 12), false],
    ['en juin', at(2026, 6, 15, 12), false],
    ['le 20 octobre', at(2026, 10, 20, 12), false],
    ['le 29 février d’une année bissextile', at(2028, 2, 29, 12), false],
    ['le 31 décembre d’une année bissextile', at(2028, 12, 31, 12), true],
    ['le 5 janvier d’une année bissextile', at(2028, 1, 5, 23, 59, 59), true],
    ['le 20 décembre 2031', at(2031, 12, 20, 12), true],
    ['le 3 janvier 2032', at(2032, 1, 3, 12), true],
  ])('%s : %s', (_, date, expected) => {
    expect(isNoelSeason(date)).toBe(expected)
  })

  it('lit le jour de l’appareil, pas celui du méridien de Greenwich', () => {
    expect(isNoelSeason(new Date(2027, 0, 5, 23, 59, 59, 999))).toBe(true)
    expect(isNoelSeason(new Date(2026, 10, 15, 0, 0, 0, 0))).toBe(true)
  })

  it('les deux saisons ne se chevauchent jamais, et currentSeason les distingue', () => {
    expect(currentSeason(at(2026, 11, 1, 23, 59, 59))).toBe('halloween')
    expect(currentSeason(at(2026, 11, 2))).toBeNull()
    expect(currentSeason(at(2026, 11, 14, 23, 59, 59))).toBeNull()
    expect(currentSeason(at(2026, 11, 15))).toBe('noel')
    expect(currentSeason(at(2027, 1, 5, 23, 59, 59))).toBe('noel')
    expect(currentSeason(at(2027, 1, 6))).toBeNull()
    expect(currentSeason(at(2026, 10, 14))).toBeNull()
    expect(currentSeason(at(2026, 10, 15))).toBe('halloween')

    for (const year of [2028, 2029]) {
      for (
        let time = new Date(year, 0, 1);
        time.getFullYear() === year;
        time.setDate(time.getDate() + 1)
      ) {
        expect(isHalloweenSeason(time) && isNoelSeason(time)).toBe(false)
      }
    }
  })

  it('sans argument, prend la date du jour', () => {
    vi.setSystemTime(at(2026, 12, 20, 9))
    expect(currentSeason()).toBe('noel')
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
    expect(applySeason(at(2026, 10, 20))).toBe('halloween')

    expect(html.dataset.season).toBe('halloween')
    expect(meta()).toBe('#43206b')
  })

  it('hors saison : rien sur <html>, la barre du navigateur retrouve son vert', () => {
    applySeason(at(2026, 10, 20))

    expect(applySeason(at(2026, 11, 2))).toBeNull()

    expect(html.hasAttribute('data-season')).toBe(false)
    expect(meta()).toBe('#1E6B4C')
  })

  it('désactivé par l’utilisateur : jamais de thème saisonnier, même en saison', () => {
    localStorage.setItem('repas.season', 'off')

    expect(applySeason(at(2026, 10, 20))).toBeNull()

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

    expect(applySeason(at(2026, 10, 20))).toBe('halloween')
  })

  it('en saison de Noël : data-season="noel" et barre du navigateur bordeaux', () => {
    expect(applySeason(at(2026, 12, 20))).toBe('noel')

    expect(html.dataset.season).toBe('noel')
    expect(meta()).toBe('#7a1530')
  })

  it('de Halloween à Noël, la saison et la couleur suivent', () => {
    applySeason(at(2026, 10, 20))
    applySeason(at(2026, 11, 20))

    expect(html.dataset.season).toBe('noel')
    expect(meta()).toBe('#7a1530')

    applySeason(at(2027, 1, 6))
    expect(html.hasAttribute('data-season')).toBe(false)
    expect(meta()).toBe('#1E6B4C')
  })

  describe('la préférence, saison par saison', () => {
    it.each([
      ['absente', null, { halloween: 'halloween', noel: 'noel' }],
      ['illisible', 'peut-être', { halloween: 'halloween', noel: 'noel' }],
      ['halloween', 'halloween', { halloween: null, noel: 'noel' }],
      ['noel', 'noel', { halloween: 'halloween', noel: null }],
      ['halloween,noel', 'halloween,noel', { halloween: null, noel: null }],
      ['noel,halloween (autre ordre)', 'noel,halloween', { halloween: null, noel: null }],
      // La valeur écrite par la version d'Halloween seule : le décor d'Halloween coupé, pas celui de Noël.
      ['off (version historique)', 'off', { halloween: null, noel: 'noel' }],
      ['off,noel', 'off,noel', { halloween: null, noel: null }],
    ] as const)('%s', (_, stored, expected) => {
      if (stored !== null) localStorage.setItem('repas.season', stored)

      expect(applySeason(at(2026, 10, 20))).toBe(expected.halloween)
      expect(applySeason(at(2026, 12, 20))).toBe(expected.noel)
    })
  })

  describe('le store', () => {
    it('est actif en saison par défaut et pose data-season', () => {
      vi.setSystemTime(at(2026, 10, 20))

      const season = useSeasonStore()

      expect(season.inSeason).toBe(true)
      expect(season.season).toBe('halloween')
      expect(season.enabled).toBe(true)
      expect(season.active).toBe(true)
      expect(season.activeSeason).toBe('halloween')
      expect(html.dataset.season).toBe('halloween')
    })

    it('en saison de Noël : actif, data-season="noel"', () => {
      vi.setSystemTime(at(2026, 12, 20))

      const season = useSeasonStore()

      expect(season.season).toBe('noel')
      expect(season.activeSeason).toBe('noel')
      expect(html.dataset.season).toBe('noel')
    })

    it('hors saison : inactif, rien sur <html>', () => {
      const season = useSeasonStore()

      expect(season.inSeason).toBe(false)
      expect(season.season).toBeNull()
      expect(season.active).toBe(false)
      expect(season.activeSeason).toBeNull()
      expect(html.hasAttribute('data-season')).toBe(false)
    })

    it('retient le choix de couper le décor, et le retire en le rallumant', async () => {
      vi.setSystemTime(at(2026, 10, 20))
      const season = useSeasonStore()

      season.enabled = false
      await nextTick()

      expect(localStorage.getItem('repas.season')).toBe('halloween')
      expect(html.hasAttribute('data-season')).toBe(false)

      season.enabled = true
      await nextTick()

      expect(localStorage.getItem('repas.season')).toBeNull()
      expect(html.dataset.season).toBe('halloween')
    })

    it('couper Halloween ne coupe pas Noël, et inversement', async () => {
      vi.setSystemTime(at(2026, 10, 20))
      const season = useSeasonStore()
      season.enabled = false
      await nextTick()
      expect(localStorage.getItem('repas.season')).toBe('halloween')

      // Le même appareil, un mois plus tard : Noël est encore activé.
      vi.setSystemTime(at(2026, 12, 20))
      season.refresh()
      await nextTick()
      expect(season.enabled).toBe(true)
      expect(html.dataset.season).toBe('noel')

      season.enabled = false
      await nextTick()
      expect(localStorage.getItem('repas.season')).toBe('halloween,noel')
      expect(html.hasAttribute('data-season')).toBe(false)

      // Rallumer Noël garde Halloween coupé.
      season.enabled = true
      await nextTick()
      expect(localStorage.getItem('repas.season')).toBe('halloween')
      expect(html.dataset.season).toBe('noel')
    })

    it('hors saison, l’interrupteur ne change rien', async () => {
      const season = useSeasonStore()

      season.enabled = false
      await nextTick()

      expect(localStorage.getItem('repas.season')).toBeNull()
    })

    it('relit le choix enregistré, et ignore une valeur inconnue', () => {
      vi.setSystemTime(at(2026, 10, 20))
      localStorage.setItem('repas.season', 'off')
      expect(useSeasonStore().enabled).toBe(false)

      // La valeur historique `off` ne coupe que le décor d'Halloween.
      setActivePinia(createPinia())
      vi.setSystemTime(at(2026, 12, 20))
      expect(useSeasonStore().enabled).toBe(true)

      setActivePinia(createPinia())
      vi.setSystemTime(at(2026, 10, 20))
      localStorage.setItem('repas.season', 'noel')
      expect(useSeasonStore().enabled).toBe(true)

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

    it('change de thème à minuit : entrée dans Noël, puis sortie après le 5 janvier', async () => {
      vi.setSystemTime(at(2026, 11, 14, 23, 59, 0))
      const season = useSeasonStore()
      stop = followSeason()
      expect(season.active).toBe(false)

      await vi.advanceTimersByTimeAsync(62 * 1000)
      await nextTick()
      expect(html.dataset.season).toBe('noel')

      vi.setSystemTime(at(2027, 1, 5, 23, 59, 0))
      document.dispatchEvent(new Event('visibilitychange'))
      await nextTick()
      expect(html.dataset.season).toBe('noel')

      await vi.advanceTimersByTimeAsync(62 * 1000)
      await nextTick()
      expect(html.hasAttribute('data-season')).toBe(false)
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

  // Chacun part d'un état opposé : ce qui est posé vient de lui.
  function run(apply: () => unknown, stored: string | null) {
    html.dataset.season = 'halloween'
    document.querySelector('meta[name="theme-color"]')!.setAttribute('content', 'autre')
    if (stored === null) localStorage.removeItem('repas.season')
    else localStorage.setItem('repas.season', stored)
    apply()

    return state()
  }

  const preferences = [null, 'on', 'inconnu', 'off', 'noel', 'halloween', 'halloween,noel'] as const
  const expectedState = (date: Date, stored: string | null) => {
    const names = (stored ?? '').split(',').map((name) => (name === 'off' ? 'halloween' : name))
    const season = currentSeason(date)
    const on = season !== null && !names.includes(season)

    return {
      season: on ? season : null,
      color: on ? (season === 'noel' ? '#7a1530' : '#43206b') : '#1E6B4C',
    }
  }

  for (const [label, date] of [
    ['14 octobre 23:59:59', at(2026, 10, 14, 23, 59, 59)],
    ['15 octobre 00:00:00', at(2026, 10, 15)],
    ['31 octobre', at(2026, 10, 31, 12)],
    ['1er novembre 23:59:59', at(2026, 11, 1, 23, 59, 59)],
    ['2 novembre 00:00:00', at(2026, 11, 2)],
    ['14 novembre 23:59:59', at(2026, 11, 14, 23, 59, 59)],
    ['15 novembre 00:00:00', at(2026, 11, 15)],
    ['20 décembre', at(2026, 12, 20, 12)],
    ['31 décembre 23:59:59', at(2026, 12, 31, 23, 59, 59)],
    ['1er janvier 00:00:00', at(2027, 1, 1)],
    ['5 janvier 23:59:59', at(2027, 1, 5, 23, 59, 59)],
    ['6 janvier 00:00:00', at(2027, 1, 6)],
    ['juin', at(2026, 6, 15, 12)],
    ['15 octobre 2028 (bissextile)', at(2028, 10, 15)],
    ['2 novembre 2028 (bissextile)', at(2028, 11, 2)],
  ] as const) {
    for (const stored of preferences) {
      it(`${label}, préférence ${stored ?? 'absente'} : le script d’amorçage et applySeason posent la même chose`, () => {
        vi.setSystemTime(date)

        const results = [() => applySeason(), runInitScript].map((apply) => run(apply, stored))

        expect(results[1]).toEqual(results[0])
        expect(results[1]).toEqual(expectedState(date, stored))
      })
    }
  }

  // Tous les jours d'une année bissextile (2028) et de la suivante : les deux implémentations ne divergent jamais.
  for (const stored of preferences) {
    it(`chaque jour de 2028 et de 2029, préférence ${stored ?? 'absente'} : le script d’amorçage et applySeason sont d’accord`, () => {
      const divergences: string[] = []
      for (const year of [2028, 2029]) {
        for (const [hour, minute, second] of [
          [0, 0, 0],
          [23, 59, 59],
        ] as const) {
          for (
            let day = new Date(year, 0, 1);
            day.getFullYear() === year;
            day.setDate(day.getDate() + 1)
          ) {
            const date = new Date(year, day.getMonth(), day.getDate(), hour, minute, second)
            vi.setSystemTime(date)
            const app = run(() => applySeason(), stored)
            const init = run(runInitScript, stored)
            if (JSON.stringify(app) !== JSON.stringify(init)) divergences.push(date.toString())
            if (JSON.stringify(init) !== JSON.stringify(expectedState(date, stored)))
              divergences.push(`attendu ${date.toString()}`)
          }
        }
      }

      expect(divergences).toEqual([])
    })
  }

  it('une préférence « halloween » ne coupe pas Noël, y compris au démarrage', () => {
    vi.setSystemTime(at(2026, 12, 20))
    localStorage.setItem('repas.season', 'halloween')

    runInitScript()

    expect(state()).toEqual({ season: 'noel', color: '#7a1530' })
  })

  it('la valeur historique « off » ne coupe que le décor d’Halloween', () => {
    localStorage.setItem('repas.season', 'off')

    vi.setSystemTime(at(2026, 10, 20))
    runInitScript()
    expect(state()).toEqual({ season: null, color: '#1E6B4C' })

    vi.setSystemTime(at(2026, 12, 20))
    runInitScript()
    expect(state()).toEqual({ season: 'noel', color: '#7a1530' })
  })

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

  it('un stockage indisponible laisse aussi Noël activé, sans lever', () => {
    vi.setSystemTime(at(2026, 12, 20))
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })

    expect(runInitScript).not.toThrow()
    expect(html.dataset.season).toBe('noel')
  })
})
