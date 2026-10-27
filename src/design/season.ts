import { computed, ref, watch, watchEffect } from 'vue'
import { defineStore } from 'pinia'

/**
 * Thème saisonnier « Citrouille & nuit » (ADR 0010) : du 15 octobre au 1er novembre inclus, jour local de l'appareil, chaque année.
 * `public/theme-init.js` applique la même règle avant le premier affichage ; un test garde les deux d'accord.
 */

const KEY = 'repas.season'
const OFF = 'off'

/** La couleur de la barre du navigateur : celle de `index.html` hors saison. */
const BASE_COLOR = '#1E6B4C'
const SEASON_COLOR = '#43206b'

/** Du 15 octobre 00:00:00 au 1er novembre 23:59:59, en heure locale ; l'année ne compte pas. */
export function isHalloweenSeason(date: Date = new Date()): boolean {
  const month = date.getMonth()
  const day = date.getDate()
  return (month === 9 && day >= 15) || (month === 10 && day === 1)
}

/** Une préférence d'affichage, pas un secret : `localStorage` convient. Absente ou inconnue : le décor est activé. */
function storedEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== OFF
  } catch {
    return true
  }
}

/** Pose (ou retire) le thème saisonnier sur <html> et la couleur de la barre du navigateur. */
function paint(active: boolean) {
  const root = document.documentElement
  if (active) root.dataset.season = 'halloween'
  else root.removeAttribute('data-season')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', active ? SEASON_COLOR : BASE_COLOR)
}

/**
 * Applique la saison sans attendre le store : appelée au démarrage et à chaque réévaluation (onglet de nouveau visible, minuit).
 * `public/theme-init.js` fait la même lecture avant le premier affichage, pour éviter l'éclair du mauvais thème.
 */
export function applySeason(date: Date = new Date()): boolean {
  const active = isHalloweenSeason(date) && storedEnabled()
  paint(active)
  return active
}

export const useSeasonStore = defineStore('season', () => {
  const enabled = ref(storedEnabled())
  const inSeason = ref(isHalloweenSeason())
  const active = computed(() => inSeason.value && enabled.value)

  watchEffect(() => paint(active.value))
  watch(enabled, (value) => {
    try {
      if (value) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, OFF)
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la session.
    }
  })

  /** Relit la date : une application laissée ouverte change de thème sans rechargement. */
  function refresh() {
    inSeason.value = isHalloweenSeason()
  }

  return { enabled, inSeason, active, refresh }
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
