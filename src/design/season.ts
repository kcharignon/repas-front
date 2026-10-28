import { computed, ref, watch, watchEffect } from 'vue'
import { defineStore } from 'pinia'

/**
 * Thèmes saisonniers (ADR 0010 « Citrouille & nuit », ADR 0011 « Houx & neige »), jour local de l'appareil, chaque année :
 * Halloween du 15 octobre au 1er novembre inclus, Noël du 15 novembre au 5 janvier inclus. Les deux ne se chevauchent jamais.
 * `public/theme-init.js` applique les mêmes règles avant le premier affichage ; un test garde les deux d'accord.
 */

export type Season = 'halloween' | 'noel'

/** L'ordre fixe des saisons : celui de la préférence écrite. */
export const SEASONS: readonly Season[] = ['halloween', 'noel']

const KEY = 'repas.season'
/** L'ancienne valeur (version d'Halloween seule) : « décor coupé », lue comme `halloween`. */
const LEGACY_OFF = 'off'

/** La couleur de la barre du navigateur : celle de `index.html` hors saison. */
const BASE_COLOR = '#1E6B4C'
const SEASON_COLOR: Record<Season, string> = { halloween: '#43206b', noel: '#7a1530' }

/** Du 15 octobre 00:00:00 au 1er novembre 23:59:59, en heure locale ; l'année ne compte pas. */
export function isHalloweenSeason(date: Date = new Date()): boolean {
  const month = date.getMonth()
  const day = date.getDate()
  return (month === 9 && day >= 15) || (month === 10 && day === 1)
}

/** Du 15 novembre 00:00:00 au 5 janvier 23:59:59, en heure locale ; la période enjambe le nouvel an, l'année ne compte pas. */
export function isNoelSeason(date: Date = new Date()): boolean {
  const month = date.getMonth()
  const day = date.getDate()
  return (month === 10 && day >= 15) || month === 11 || (month === 0 && day <= 5)
}

/** La saison en cours pour ce jour local, ou `null`. */
export function currentSeason(date: Date = new Date()): Season | null {
  if (isHalloweenSeason(date)) return 'halloween'
  if (isNoelSeason(date)) return 'noel'
  return null
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
  /** La saison dont le thème est posé, ou `null`. */
  const activeSeason = computed<Season | null>(() => (active.value ? season.value : null))

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

  return { enabled, season, inSeason, active, activeSeason, refresh }
})

/** Le délai jusqu'au prochain minuit local (le changement d'heure d'été compris : la date est reconstruite, pas additionnée). */
function untilNextMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
}

/**
 * Réévalue la saison quand l'onglet redevient visible et à chaque minuit local. Renvoie la fonction qui arrête le suivi.
 * Appelée une fois au démarrage, après l'installation de Pinia.
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
    if (document.visibilityState !== 'visible') return
    season.refresh()
    // L'appareil a pu dormir : le minuit attendu est peut-être passé, on le recalcule.
    clearTimeout(timer)
    arm()
  }

  document.addEventListener('visibilitychange', onVisible)
  arm()

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    clearTimeout(timer)
  }
}
