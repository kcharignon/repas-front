import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import {
  SEASONS,
  applySeason,
  currentSeason,
  easterSunday,
  followSeason,
  isHalloweenSeason,
  isNoelSeason,
  isPaquesSeason,
  seasonIncludes,
  useSeasonStore,
  type Season,
} from '@/design/season'

const html = document.documentElement
const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content')

// Les dates sont construites en heure LOCALE (le jour de l'appareil), comme la règle.
const at = (year: number, month: number, day: number, h = 0, m = 0, s = 0) =>
  new Date(year, month - 1, day, h, m, s)

/** La couleur de la barre du navigateur de chaque saison (le `--brand` clair), écrite ici pour attraper une divergence des deux registres. */
const COLORS: Record<Season, string> = {
  galette: '#223b86',
  paques: '#6a50b0',
  halloween: '#43206b',
  noel: '#7a1530',
}
const BASE_COLOR = '#1E6B4C'

/** Les quatre instants qui bornent une période : la veille à 23:59:59, le premier jour à 00:00:00, le dernier jour à 23:59:59, le lendemain à 00:00:00. */
type Bounds = readonly [label: string, eve: Date, first: Date, last: Date, next: Date]
const bounds = (
  label: string,
  [fromYear, fromMonth, fromDay]: readonly [number, number, number],
  [toYear, toMonth, toDay]: readonly [number, number, number],
): Bounds => [
  label,
  new Date(fromYear, fromMonth - 1, fromDay - 1, 23, 59, 59),
  at(fromYear, fromMonth, fromDay, 0, 0, 0),
  at(toYear, toMonth, toDay, 23, 59, 59),
  new Date(toYear, toMonth - 1, toDay + 1, 0, 0, 0),
]

/**
 * LA TABLE des règles de dates : une entrée par saison (le type l'exige). Les périodes bornées (veille, premier jour, dernier jour,
 * lendemain) et quelques jours à l'intérieur et à l'extérieur. Une saison nouvelle ajoute ses lignes ici, rien d'autre.
 */
const CASES: Record<
  Season,
  { bounds: readonly Bounds[]; inside: readonly Date[]; outside: readonly Date[] }
> = {
  // Du 6 janvier au 2 février inclus (la Chandeleur) ; l'année ne compte pas, le 29 février d'une année bissextile n'en fait pas partie.
  galette: {
    bounds: [
      bounds('2027', [2027, 1, 6], [2027, 2, 2]),
      bounds('2028, bissextile', [2028, 1, 6], [2028, 2, 2]),
      bounds('2031', [2031, 1, 6], [2031, 2, 2]),
    ],
    inside: [at(2027, 1, 15, 12), at(2027, 1, 31, 12), at(2027, 2, 1, 8), at(2028, 1, 20, 12)],
    outside: [
      at(2027, 1, 5, 12),
      at(2027, 2, 3, 12),
      at(2028, 2, 29, 12),
      at(2026, 6, 15, 12),
      at(2026, 12, 25, 12),
    ],
  },
  // Du dimanche de Pâques moins 21 jours au lundi de Pâques inclus : les fenêtres de plusieurs années, Pâques extrêmes comprises
  // (2035 : le 25 mars, 2038 : le 25 avril), une année bissextile (2028) et le début de mars (2024).
  paques: {
    bounds: [
      bounds('2024 (Pâques le 31 mars)', [2024, 3, 10], [2024, 4, 1]),
      bounds('2026 (Pâques le 5 avril)', [2026, 3, 15], [2026, 4, 6]),
      bounds('2027 (Pâques le 28 mars)', [2027, 3, 7], [2027, 3, 29]),
      bounds('2028, bissextile (Pâques le 16 avril)', [2028, 3, 26], [2028, 4, 17]),
      bounds('2029 (Pâques le 1er avril)', [2029, 3, 11], [2029, 4, 2]),
      bounds('2030 (Pâques le 21 avril)', [2030, 3, 31], [2030, 4, 22]),
      bounds('2032 (Pâques le 28 mars)', [2032, 3, 7], [2032, 3, 29]),
      bounds('2035, Pâques précoce (le 25 mars)', [2035, 3, 4], [2035, 3, 26]),
      bounds('2038, Pâques tardive (le 25 avril)', [2038, 4, 4], [2038, 4, 26]),
      bounds('2040 (Pâques le 1er avril)', [2040, 3, 11], [2040, 4, 2]),
    ],
    inside: [at(2027, 3, 20, 12), at(2027, 3, 28, 12), at(2028, 4, 9, 12), at(2030, 4, 15, 8)],
    outside: [
      at(2027, 4, 5, 12),
      at(2027, 3, 1, 12),
      at(2026, 6, 15, 12),
      at(2028, 2, 29, 12),
      at(2026, 12, 25, 12),
    ],
  },
  // Du 15 octobre au 1er novembre inclus ; l'année ne compte pas.
  halloween: {
    bounds: [
      bounds('2026', [2026, 10, 15], [2026, 11, 1]),
      bounds('2028, bissextile', [2028, 10, 15], [2028, 11, 1]),
      bounds('2031', [2031, 10, 15], [2031, 11, 1]),
    ],
    inside: [at(2026, 10, 27, 12), at(2026, 10, 31, 12), at(2027, 10, 20, 12)],
    outside: [
      at(2026, 10, 1, 12),
      at(2026, 11, 30, 12),
      at(2026, 12, 31, 23, 59, 59),
      at(2026, 1, 1),
      at(2026, 6, 15, 12),
      at(2028, 2, 29, 12),
    ],
  },
  // Du 15 novembre au 5 janvier inclus ; la période enjambe le nouvel an.
  noel: {
    bounds: [
      bounds('2026-2027', [2026, 11, 15], [2027, 1, 5]),
      bounds('2028-2029, année bissextile au départ', [2028, 11, 15], [2029, 1, 5]),
      bounds('2031-2032', [2031, 11, 15], [2032, 1, 5]),
    ],
    inside: [
      at(2026, 11, 30, 12),
      at(2026, 12, 24, 20),
      at(2026, 12, 31, 23, 59, 59),
      at(2027, 1, 1),
      at(2028, 12, 31, 12),
      at(2028, 1, 5, 23, 59, 59),
    ],
    outside: [
      at(2026, 11, 2, 12),
      at(2026, 6, 15, 12),
      at(2026, 10, 20, 12),
      at(2028, 2, 29, 12),
      at(2027, 1, 6),
    ],
  },
}

/** Tous les jours de 2024 à 2040 (midi). */
function everyDay(): Date[] {
  const days: Date[] = []
  for (let year = 2024; year <= 2040; year++)
    for (let day = new Date(year, 0, 1); day.getFullYear() === year; day.setDate(day.getDate() + 1))
      days.push(new Date(year, day.getMonth(), day.getDate(), 12))

  return days
}

describe('thème saisonnier : la règle de dates, saison par saison', () => {
  it('la table couvre toutes les saisons et le registre est dans l’ordre de l’année', () => {
    expect(Object.keys(CASES).sort()).toEqual([...SEASONS].sort())
    expect(SEASONS).toEqual(['galette', 'paques', 'halloween', 'noel'])
    expect(Object.keys(COLORS).sort()).toEqual([...SEASONS].sort())
  })

  describe.each(SEASONS)('%s', (season) => {
    it.each(CASES[season].bounds)(
      '%s : la veille hors saison, le premier et le dernier jour en saison, le lendemain hors saison',
      (_, eve, first, last, next) => {
        expect([eve, first, last, next].map((date) => seasonIncludes(season, date))).toEqual([
          false,
          true,
          true,
          false,
        ])
        expect([currentSeason(first), currentSeason(last)]).toEqual([season, season])
      },
    )

    it.each(CASES[season].inside.map((date) => [date.toString(), date] as const))(
      'en saison le %s',
      (_, date) => {
        expect(seasonIncludes(season, date)).toBe(true)
        expect(currentSeason(date)).toBe(season)
      },
    )

    it.each(CASES[season].outside.map((date) => [date.toString(), date] as const))(
      'hors saison le %s',
      (_, date) => {
        expect(seasonIncludes(season, date)).toBe(false)
      },
    )

    it('lit le jour de l’appareil, pas celui du méridien de Greenwich', () => {
      const [, , first, last] = CASES[season].bounds[0]!
      // La première et la dernière milliseconde du jour local : quel que soit le décalage horaire de l'appareil.
      expect(
        seasonIncludes(
          season,
          new Date(first.getFullYear(), first.getMonth(), first.getDate(), 0, 0, 0, 0),
        ),
      ).toBe(true)
      expect(
        seasonIncludes(
          season,
          new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999),
        ),
      ).toBe(true)
    })
  })

  it('les noms historiques lisent la même règle que le registre, et sans argument prennent la date du jour', () => {
    vi.setSystemTime(at(2027, 3, 20, 9))
    expect([isPaquesSeason(), isHalloweenSeason(), isNoelSeason()]).toEqual([true, false, false])
    expect(currentSeason(at(2027, 1, 15, 9))).toBe('galette')

    vi.setSystemTime(at(2026, 10, 20, 9))
    expect([isPaquesSeason(), isHalloweenSeason(), isNoelSeason()]).toEqual([false, true, false])

    vi.setSystemTime(at(2026, 12, 20, 9))
    expect([isPaquesSeason(), isHalloweenSeason(), isNoelSeason()]).toEqual([false, false, true])
    expect(currentSeason()).toBe('noel')

    vi.setSystemTime(at(2026, 6, 20, 9))
    expect(currentSeason()).toBeNull()
  })

  it('les saisons ne se chevauchent jamais : tous les jours de 2024 à 2040, au plus une est vraie', () => {
    const overlaps: string[] = []
    for (const day of everyDay())
      for (const [hour, minute, second] of [
        [0, 0, 0],
        [23, 59, 59],
      ] as const) {
        const date = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          hour,
          minute,
          second,
        )
        const on = SEASONS.filter((season) => seasonIncludes(season, date))
        if (on.length > 1) overlaps.push(`${date.toString()} : ${on.join(', ')}`)
        if (currentSeason(date) !== (on[0] ?? null))
          overlaps.push(`currentSeason ${date.toString()}`)
      }

    expect(overlaps).toEqual([])
  })

  it('chaque saison a des jours chaque année de 2024 à 2040', () => {
    const days = everyDay()
    for (const season of SEASONS)
      for (let year = 2024; year <= 2040; year++)
        expect(
          days.some((day) => day.getFullYear() === year && seasonIncludes(season, day)),
          `${season} ${year}`,
        ).toBe(true)
  })
})

describe('la date de Pâques', () => {
  it.each([
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2028, 4, 16],
    [2029, 4, 1],
    [2030, 4, 21],
    [2031, 4, 13],
    [2032, 3, 28],
    [2033, 4, 17],
    [2034, 4, 9],
    [2035, 3, 25],
    [2036, 4, 13],
    [2037, 4, 5],
    [2038, 4, 25],
    [2040, 4, 1],
    // Les extrêmes du calendrier grégorien : le 22 mars (1818) et le 25 avril (1943).
    [1818, 3, 22],
    [1943, 4, 25],
  ])('en %s, le dimanche de Pâques est le %s/%s', (year, month, day) => {
    const sunday = easterSunday(year)

    expect([
      sunday.getFullYear(),
      sunday.getMonth() + 1,
      sunday.getDate(),
      sunday.getDay(),
    ]).toEqual([year, month, day, 0])
  })

  it('la fenêtre de 2027 va du 7 au 29 mars, celle de 2030 du 31 mars au 22 avril', () => {
    expect(
      [at(2027, 3, 6, 12), at(2027, 3, 7, 12), at(2027, 3, 29, 12), at(2027, 3, 30, 12)].map(
        isPaquesSeason,
      ),
    ).toEqual([false, true, true, false])
    expect(
      [at(2030, 3, 30, 12), at(2030, 3, 31, 12), at(2030, 4, 22, 12), at(2030, 4, 23, 12)].map(
        isPaquesSeason,
      ),
    ).toEqual([false, true, true, false])
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

  it('en saison de Pâques : data-season="paques" et barre du navigateur violette', () => {
    expect(applySeason(at(2027, 3, 20))).toBe('paques')

    expect(html.dataset.season).toBe('paques')
    expect(meta()).toBe('#6a50b0')

    applySeason(at(2027, 3, 30))
    expect(html.hasAttribute('data-season')).toBe(false)
    expect(meta()).toBe('#1E6B4C')
  })

  it('en saison de la galette : data-season="galette" et barre du navigateur bleu roi, jusqu’à la Chandeleur', () => {
    expect(applySeason(at(2027, 1, 15))).toBe('galette')

    expect(html.dataset.season).toBe('galette')
    expect(meta()).toBe('#223b86')

    applySeason(at(2027, 2, 3))
    expect(html.hasAttribute('data-season')).toBe(false)
    expect(meta()).toBe('#1E6B4C')
  })

  it('de Halloween à Noël puis à la galette, la saison et la couleur suivent', () => {
    applySeason(at(2026, 10, 20))
    applySeason(at(2026, 11, 20))

    expect(html.dataset.season).toBe('noel')
    expect(meta()).toBe('#7a1530')

    // Le 6 janvier, la galette prend le relais de Noël ; la Chandeleur passée, le thème de base revient.
    applySeason(at(2027, 1, 6))
    expect(html.dataset.season).toBe('galette')
    expect(meta()).toBe('#223b86')

    applySeason(at(2027, 2, 3))
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

    it('en saison de Pâques : actif, data-season="paques"', () => {
      vi.setSystemTime(at(2027, 3, 20))

      const season = useSeasonStore()

      expect(season.season).toBe('paques')
      expect(season.activeSeason).toBe('paques')
      expect(html.dataset.season).toBe('paques')
    })

    it('en saison de la galette : actif, data-season="galette", sans couper les autres saisons', async () => {
      vi.setSystemTime(at(2027, 1, 15))
      localStorage.setItem('repas.season', 'halloween,noel')

      const season = useSeasonStore()

      expect(season.season).toBe('galette')
      expect(season.activeSeason).toBe('galette')
      expect(html.dataset.season).toBe('galette')

      season.enabled = false
      await nextTick()
      expect(localStorage.getItem('repas.season')).toBe('galette,halloween,noel')
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

    it('couper Pâques garde Halloween et Noël, et se retient dans l’ordre de l’année', async () => {
      vi.setSystemTime(at(2027, 3, 20))
      const season = useSeasonStore()
      season.enabled = false
      await nextTick()
      expect(localStorage.getItem('repas.season')).toBe('paques')
      expect(html.hasAttribute('data-season')).toBe(false)

      vi.setSystemTime(at(2026, 12, 20))
      season.refresh()
      season.enabled = false
      await nextTick()
      expect(localStorage.getItem('repas.season')).toBe('paques,noel')

      vi.setSystemTime(at(2026, 10, 20))
      season.refresh()
      season.enabled = false
      await nextTick()
      // L'ordre écrit est celui de SEASONS, quel que soit l'ordre des clics.
      expect(localStorage.getItem('repas.season')).toBe('paques,halloween,noel')
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

      // Minuit passé : la galette prend le relais de Noël.
      await vi.advanceTimersByTimeAsync(62 * 1000)
      await nextTick()
      expect(html.dataset.season).toBe('galette')
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
  const initFunction = new Function(initScript)
  const runInitScript = () => initFunction()

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

  const preferences = [
    null,
    'on',
    'inconnu',
    'off',
    ...SEASONS,
    'halloween,noel',
    SEASONS.join(','),
  ] as const
  const expectedState = (date: Date, stored: string | null) => {
    const names = (stored ?? '').split(',').map((name) => (name === 'off' ? 'halloween' : name))
    const season = currentSeason(date)
    const on = season !== null && !names.includes(season)

    return { season: on ? season : null, color: on ? COLORS[season] : BASE_COLOR }
  }

  // Les bornes de chaque saison (veille, premier jour, dernier jour, lendemain) : générique sur le registre.
  const boundaryDates = SEASONS.flatMap((season) =>
    CASES[season].bounds.flatMap(
      ([label, eve, first, last, next]) =>
        [
          [`${season} ${label}, la veille`, eve],
          [`${season} ${label}, le premier jour`, first],
          [`${season} ${label}, le dernier jour`, last],
          [`${season} ${label}, le lendemain`, next],
        ] as const,
    ),
  )

  for (const [label, date] of [
    ...boundaryDates,
    ['juin', at(2026, 6, 15, 12)],
    ['29 février 2028', at(2028, 2, 29, 12)],
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

  // Tous les jours de 2024 à 2040 (années bissextiles comprises), au premier et au dernier instant du jour : les deux implémentations ne
  // divergent jamais, saison par saison.
  for (const stored of [null, 'off', 'paques', 'halloween,noel'] as const) {
    it(`chaque jour de 2024 à 2040, préférence ${stored ?? 'absente'} : le script d’amorçage et applySeason sont d’accord`, () => {
      const divergences: string[] = []
      for (const day of everyDay()) {
        for (const [hour, minute, second] of [
          [0, 0, 0],
          [23, 59, 59],
        ] as const) {
          const date = new Date(
            day.getFullYear(),
            day.getMonth(),
            day.getDate(),
            hour,
            minute,
            second,
          )
          vi.setSystemTime(date)
          const app = run(() => applySeason(), stored)
          const init = run(runInitScript, stored)
          if (JSON.stringify(app) !== JSON.stringify(init)) divergences.push(date.toString())
          if (JSON.stringify(init) !== JSON.stringify(expectedState(date, stored)))
            divergences.push(`attendu ${date.toString()}`)
        }
      }

      expect(divergences).toEqual([])
    })
  }

  it('une préférence « halloween » ne coupe pas Noël ni Pâques, y compris au démarrage', () => {
    localStorage.setItem('repas.season', 'halloween')

    vi.setSystemTime(at(2026, 12, 20))
    runInitScript()
    expect(state()).toEqual({ season: 'noel', color: '#7a1530' })

    vi.setSystemTime(at(2027, 3, 20))
    runInitScript()
    expect(state()).toEqual({ season: 'paques', color: '#6a50b0' })
  })

  it('une préférence « paques » ne coupe que Pâques', () => {
    localStorage.setItem('repas.season', 'paques')

    vi.setSystemTime(at(2027, 3, 20))
    runInitScript()
    expect(state()).toEqual({ season: null, color: '#1E6B4C' })

    vi.setSystemTime(at(2026, 10, 20))
    runInitScript()
    expect(state()).toEqual({ season: 'halloween', color: '#43206b' })
  })

  it('une préférence « galette » ne coupe que la galette, au démarrage aussi', () => {
    localStorage.setItem('repas.season', 'galette')

    vi.setSystemTime(at(2027, 1, 15))
    runInitScript()
    expect(state()).toEqual({ season: null, color: '#1E6B4C' })

    vi.setSystemTime(at(2027, 3, 20))
    runInitScript()
    expect(state()).toEqual({ season: 'paques', color: '#6a50b0' })
  })

  it('la valeur historique « off » ne coupe que le décor d’Halloween', () => {
    localStorage.setItem('repas.season', 'off')

    vi.setSystemTime(at(2026, 10, 20))
    runInitScript()
    expect(state()).toEqual({ season: null, color: '#1E6B4C' })

    vi.setSystemTime(at(2026, 12, 20))
    runInitScript()
    expect(state()).toEqual({ season: 'noel', color: '#7a1530' })

    vi.setSystemTime(at(2027, 3, 20))
    runInitScript()
    expect(state()).toEqual({ season: 'paques', color: '#6a50b0' })
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

  it('un stockage indisponible laisse aussi Noël et Pâques activés, sans lever', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })

    vi.setSystemTime(at(2026, 12, 20))
    expect(runInitScript).not.toThrow()
    expect(html.dataset.season).toBe('noel')

    vi.setSystemTime(at(2027, 3, 20))
    expect(runInitScript).not.toThrow()
    expect(html.dataset.season).toBe('paques')
  })
})
