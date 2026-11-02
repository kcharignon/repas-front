// Coupe le JavaScript de la page du drive le temps d'une lecture de l'écran (`ui` de lib.sh), par le débogage à distance de la WebView (APK de DÉBOGAGE seulement, comme
// display.mjs ; le socket est redirigé vers 127.0.0.1:9222 par `adb forward`). Lancé DANS le conteneur : `node /opt/repas-emulator/quiet.mjs <secondes>`.
//
// Pourquoi : `uiautomator dump` attend que l'arbre d'accessibilité soit au repos. Tant que la carte du guide est à l'écran, l'agent bascule l'attribut `hidden` toutes les 500 ms
// (`drive-agent/src/ui/fit.ts`, `check()`, puis `apply`) : l'arbre ne se repose jamais et le dump échoue (« could not get idle state »). Sans JavaScript, plus rien ne bouge et l'écran se lit.
// La page reprend toute seule au bout du délai (ou dès que lib.sh dépose /tmp/quiet.stop) : rien n'est modifié dans l'application. Le défaut de l'agent reste jugé par le scénario 8.
//
// Toute page http(s) de la WebView convient (le drive d'une enseigne, quelle qu'elle soit : Leclerc, Auchan, l'enseigne d'essai, ou la coquille de Repas) ; s'il n'y en a aucune, ou si
// le débogage est injoignable, le programme le dit sur la sortie d'erreur et sort avec le code 2 (lib.sh ne l'ignore pas). Aucune donnée d'enseigne : seulement la coupure et la reprise.
import { existsSync } from 'node:fs'

const PORT = 9222
const STOP = '/tmp/quiet.stop'
const seconds = Number(process.argv[2] ?? 12)
const fail = (message) => {
  console.error(`quiet.mjs : ${message}`)
  process.exit(2)
}
let targets
try {
  targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
} catch {
  fail('débogage à distance injoignable (adb forward manquant ? APK de débogage ?)')
}
const page = targets.find((target) => target.type === 'page' && /^https?:\/\//.test(target.url))
if (!page) fail('aucune page http(s) dans la WebView : rien à couper')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve) => {
  socket.onopen = resolve
  socket.onerror = () => fail('connexion au débogage refusée')
})
let counter = 0
const call = (value) =>
  socket.send(JSON.stringify({ id: ++counter, method: 'Emulation.setScriptExecutionDisabled', params: { value } }))
// La reprise : au bout du délai, ou dès que lib.sh a lu l'écran et déposé le fichier témoin (un signal ne traverserait pas `docker exec`) ; on la dit à la page avant de partir
const resume = () => {
  call(false)
  setTimeout(() => process.exit(0), 400)
}
call(true)
console.log('quiet')
const until = Date.now() + seconds * 1000
const timer = setInterval(() => {
  if (existsSync(STOP) || Date.now() >= until) {
    clearInterval(timer)
    resume()
  }
}, 100)
