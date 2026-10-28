import { computed, ref, watch, watchEffect } from 'vue'
import { defineStore } from 'pinia'

import { useSessionStore } from '@/session/session'

/**
 * Thèmes saisonniers (ADR 0010 « Citrouille & nuit », ADR 0011 « Houx & neige », ADR 0014 « Prairie & œufs » et le registre, ADR 0015
 * « Or & bleu roi » et « Rose & cœur »), jour local de l'appareil, chaque année : la galette du 6 janvier au 2 février inclus, la Saint-Valentin du 7 au 14 février inclus, Pâques du dimanche de Pâques moins 21 jours au lundi de Pâques inclus (date calculée),
 * Halloween du 15 octobre au 1er novembre inclus, Noël du 15 novembre au 5 janvier inclus. Les saisons ne se chevauchent jamais.
 * `public/theme-init.js` applique les mêmes règles avant le premier affichage ; un test garde les deux d'accord.
 */

/** Une saison : sa clé (`data-season`), la couleur de la barre du navigateur (le `--brand` clair) et sa règle de dates. */
interface SeasonDefinition {
  readonly key: string
  readonly color: string
  /** Vrai pour ce jour LOCAL ; l'année ne compte que pour les fêtes mobiles. */
  readonly includes: (date: Date) => boolean
}

/** Le dimanche de Pâques de cette année (calendrier grégorien : Meeus, Jones et Butcher), à minuit, heure locale. */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return new Date(year, month - 1, day)
}

/**
 * LES SAISONS, dans l'ordre chronologique de l'année (aperçu de l'administrateur, préférence écrite). Une saison nouvelle ajoute une
 * entrée ici et dans `public/theme-init.js`, ses fichiers (`art/<clé>/`), ses blocs de `theme.css` et ses libellés : le reste en dérive.
 */
const DEFINITIONS = [
  {
    key: 'galette',
    color: '#223b86',
    // Du 6 janvier 00:00:00 (l'Épiphanie) au 2 février 23:59:59 (la Chandeleur).
    includes: (date) => {
      const month = date.getMonth()
      const day = date.getDate()

      return (month === 0 && day >= 6) || (month === 1 && day <= 2)
    },
  },
  {
    key: 'valentin',
    color: '#a8326a',
    // Du 7 février 00:00:00 au 14 février 23:59:59.
    includes: (date) => {
      const month = date.getMonth()
      const day = date.getDate()

      return month === 1 && day >= 7 && day <= 14
    },
  },
  {
    key: 'paques',
    color: '#6a50b0',
    // Du dimanche de Pâques moins 21 jours (00:00) au lundi de Pâques (23:59:59). Les jours sont reconstruits (`new Date(a, m, j ± n)`),
    // jamais additionnés en millisecondes : un changement d'heure décalerait la borne.
    includes: (date) => {
      const year = date.getFullYear()
      const sunday = easterSunday(year)
      const day = new Date(year, date.getMonth(), date.getDate()).getTime()
      const from = new Date(year, sunday.getMonth(), sunday.getDate() - 21).getTime()
      const to = new Date(year, sunday.getMonth(), sunday.getDate() + 1).getTime()

      return day >= from && day <= to
    },
  },
  {
    key: 'halloween',
    color: '#43206b',
    // Du 15 octobre 00:00:00 au 1er novembre 23:59:59.
    includes: (date) => {
      const month = date.getMonth()
      const day = date.getDate()

      return (month === 9 && day >= 15) || (month === 10 && day === 1)
    },
  },
  {
    key: 'noel',
    color: '#7a1530',
    // Du 15 novembre 00:00:00 au 5 janvier 23:59:59 ; la période enjambe le nouvel an.
    includes: (date) => {
      const month = date.getMonth()
      const day = date.getDate()

      return (month === 10 && day >= 15) || month === 11 || (month === 0 && day <= 5)
    },
  },
] as const satisfies readonly SeasonDefinition[]

export type Season = (typeof DEFINITIONS)[number]['key']

/** L'aperçu de l'administrateur (ADR 0013) : une saison, `none` (le thème de base, sans décor) ou rien (le thème du moment). */
export type SeasonPreview = Season | 'none'

/** L'ordre fixe des saisons (celui de l'année) : celui de la préférence écrite. */
export const SEASONS: readonly Season[] = DEFINITIONS.map((definition) => definition.key)

const KEY = 'repas.season'
/** L'ancienne valeur (version d'Halloween seule) : « décor coupé », lue comme `halloween`. */
const LEGACY_OFF = 'off'

/** La couleur de la barre du navigateur : celle de `index.html` hors saison. */
const BASE_COLOR = '#1E6B4C'
const SEASON_COLOR = Object.fromEntries(
  DEFINITIONS.map((definition) => [definition.key, definition.color]),
) as Record<Season, string>

/** Ce jour local est-il dans cette saison ? La règle de chaque saison, écrite une seule fois. */
export function seasonIncludes(season: Season, date: Date = new Date()): boolean {
  return DEFINITIONS.find((definition) => definition.key === season)!.includes(date)
}

/** Du dimanche de Pâques moins 21 jours au lundi de Pâques inclus, en heure locale ; la date de Pâques est calculée. */
export function isPaquesSeason(date: Date = new Date()): boolean {
  return seasonIncludes('paques', date)
}

/** Du 15 octobre 00:00:00 au 1er novembre 23:59:59, en heure locale ; l'année ne compte pas. */
export function isHalloweenSeason(date: Date = new Date()): boolean {
  return seasonIncludes('halloween', date)
}

/** Du 15 novembre 00:00:00 au 5 janvier 23:59:59, en heure locale ; la période enjambe le nouvel an, l'année ne compte pas. */
export function isNoelSeason(date: Date = new Date()): boolean {
  return seasonIncludes('noel', date)
}

/** La saison en cours pour ce jour local, ou `null`. */
export function currentSeason(date: Date = new Date()): Season | null {
  return SEASONS.find((season) => seasonIncludes(season, date)) ?? null
}

/**
 * Les saisons que l'utilisateur a COUPÉES : une liste séparée par des virgules (`noel`, `halloween,noel`). Une préférence
 * d'affichage, pas un secret : `localStorage` convient. Absente, illisible ou inconnue : tout est activé.
 * `off` (version d'Halloween seule) est lu comme `halloween`.
 */
function storedDisabled(): Season[] {
  let value: string | null = null
  try {
    value = localStorage.getItem(KEY)
  } catch {
    return []
  }
  const names = (value ?? '').split(',').map((name) => (name === LEGACY_OFF ? 'halloween' : name))

  return SEASONS.filter((season) => names.includes(season))
}

/** Pose (ou retire) le thème saisonnier sur <html> et la couleur de la barre du navigateur. */
function paint(season: Season | null) {
  const root = document.documentElement
  if (season) root.dataset.season = season
  else root.removeAttribute('data-season')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', season ? SEASON_COLOR[season] : BASE_COLOR)
}

/**
 * Applique la saison sans attendre le store : appelée au démarrage et à chaque réévaluation (onglet de nouveau visible, minuit).
 * `public/theme-init.js` fait la même lecture avant le premier affichage, pour éviter l'éclair du mauvais thème.
 * Renvoie la saison posée, ou `null`.
 */
export function applySeason(date: Date = new Date()): Season | null {
  const season = currentSeason(date)
  const active = season !== null && !storedDisabled().includes(season) ? season : null
  paint(active)
  return active
}

export const useSeasonStore = defineStore('season', () => {
  const disabled = ref<Season[]>(storedDisabled())
  /** La saison en cours dans le calendrier, qu'elle soit coupée ou non. */
  const season = ref<Season | null>(currentSeason())
  const inSeason = computed(() => season.value !== null)
  /** Le décor de la saison en cours est-il voulu ? Couper Halloween ne coupe pas Noël. */
  const enabled = computed({
    get: () => season.value === null || !disabled.value.includes(season.value),
    set: (value: boolean) => {
      const current = season.value
      if (current === null) return
      disabled.value = SEASONS.filter((name) =>
        name === current ? !value : disabled.value.includes(name),
      )
    },
  })
  const active = computed(() => inSeason.value && enabled.value)
  /**
   * L'aperçu de l'administrateur (ADR 0013) : en MÉMOIRE seulement, jamais écrit (ni stockage, ni cookie, ni adresse). Posé, il passe
   * avant le calendrier et l'interrupteur du décor ; un rechargement ou une page cachée le ramène au thème du moment.
   */
  const preview = ref<SeasonPreview | null>(null)
  const session = useSessionStore()
  /** La saison dont le thème est posé, ou `null`. */
  const activeSeason = computed<Season | null>(() => {
    if (preview.value !== null) return preview.value === 'none' ? null : preview.value

    return active.value ? season.value : null
  })

  watchEffect(() => paint(activeSeason.value))
  watch(disabled, (value) => {
    try {
      if (value.length === 0) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, value.join(','))
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la session.
    }
  })

  /** Relit la date : une application laissée ouverte change de thème sans rechargement. */
  function refresh() {
    season.value = currentSeason()
  }

  /** Pose l'aperçu ; ignoré pour qui n'est pas administrateur (la vue masquée ne suffit pas). `null` revient au thème du moment. */
  function setPreview(value: SeasonPreview | null) {
    if (value !== null && !session.isAdmin) return
    preview.value = value
  }

  function clearPreview() {
    preview.value = null
  }

  // Plus d'administrateur (déconnexion, droit retiré) : plus d'aperçu.
  watch(
    () => session.isAdmin,
    (admin) => {
      if (!admin) clearPreview()
    },
    { flush: 'sync' },
  )

  return {
    enabled,
    season,
    inSeason,
    active,
    activeSeason,
    preview,
    refresh,
    setPreview,
    clearPreview,
  }
})

/** Le délai jusqu'au prochain minuit local (le changement d'heure d'été compris : la date est reconstruite, pas additionnée). */
function untilNextMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
}

/**
 * Réévalue la saison quand l'onglet redevient visible et à chaque minuit local. Renvoie la fonction qui arrête le suivi.
 * Appelée une fois au démarrage, après l'installation de Pinia. Quitter la page (onglet caché, `pagehide`) efface l'aperçu de
 * l'administrateur (ADR 0013) ; réévaluer le calendrier ne touche jamais à un aperçu posé.
 */
export function followSeason(): () => void {
  const season = useSeasonStore()
  let timer: ReturnType<typeof setTimeout> | undefined

  const arm = () => {
    // Une seconde de marge : jamais « avant minuit » à cause d'une horloge qui arrondit.
    timer = setTimeout(
      () => {
        season.refresh()
        arm()
      },
      untilNextMidnight(new Date()) + 1000,
    )
  }
  const onVisible = () => {
    if (document.visibilityState === 'hidden') season.clearPreview()
    if (document.visibilityState !== 'visible') return
    season.refresh()
    // L'appareil a pu dormir : le minuit attendu est peut-être passé, on le recalcule.
    clearTimeout(timer)
    arm()
  }

  const onLeave = () => season.clearPreview()

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pagehide', onLeave)
  arm()

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pagehide', onLeave)
    clearTimeout(timer)
  }
}
