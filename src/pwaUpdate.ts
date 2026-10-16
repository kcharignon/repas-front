const HOUR = 60 * 60 * 1000
const MIN_GAP = 60 * 1000

type Updatable = { update: () => Promise<unknown> }
type Visibility = Pick<Document, 'addEventListener' | 'visibilityState'>

/**
 * Le navigateur ne cherche une nouvelle version du service worker qu'à l'ouverture d'une page : une application reprise de
 * l'arrière-plan (téléphone sorti de la poche) resterait sur l'ancienne version. On la cherche au retour au premier plan
 * (au plus une fois par minute) et toutes les heures ; une version trouvée s'active seule et recharge l'application (`autoUpdate`).
 */
export function watchForUpdates(
  registration: Updatable,
  page: Visibility = document,
  now: () => number = Date.now,
) {
  let lastCheck = now()
  const check = () => {
    if (now() - lastCheck < MIN_GAP) return
    lastCheck = now()
    // Sans réseau la recherche échoue : rien à faire, l'application garde sa version
    registration.update().catch(() => undefined)
  }

  page.addEventListener('visibilitychange', () => {
    if (page.visibilityState === 'visible') check()
  })
  setInterval(check, HOUR)
}
