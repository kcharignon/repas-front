// Coupe le JavaScript de la page du drive le temps d'une lecture de l'écran (`ui` de lib.sh), par le débogage à distance de la WebView (APK de DÉBOGAGE seulement, comme
// display.mjs ; le socket est redirigé vers 127.0.0.1:9222 par `adb forward`). Lancé DANS le conteneur : `node /opt/repas-emulator/quiet.mjs <secondes>`.
//
// Pourquoi : `uiautomator dump` attend que l'arbre d'accessibilité soit au repos. Tant que la carte du guide est à l'écran, l'agent retire et remet l'attribut `hidden` de la carte toutes
// les 500 ms (`drive-agent/src/ui/fit.ts`, `check()`) : l'arbre ne se repose jamais et le dump échoue (« could not get idle state »). Sans JavaScript, plus rien ne bouge et l'écran se lit.
// La page reprend toute seule au bout du délai (ou à la fin de ce programme) : rien n'est modifié dans l'application. Le défaut de l'agent reste jugé par `a11y_idle` (lib.sh).
// Aucune donnée d'enseigne : seulement la coupure et la reprise.
const PORT = 9222
const seconds = Number(process.argv[2] ?? 12)
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = targets.find((target) => target.type === 'page' && /leclercdrive\.fr/.test(target.url))
if (!page) {
  console.error('aucune page du drive dans la WebView')
  process.exit(1)
}
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = () => reject(new Error('débogage à distance injoignable'))
})
let counter = 0
const call = (value) =>
  socket.send(JSON.stringify({ id: ++counter, method: 'Emulation.setScriptExecutionDisabled', params: { value } }))
// La reprise : au bout du délai, ou dès que lib.sh a lu l'écran et déposé le fichier /tmp/quiet.stop (un signal ne traverserait pas `docker exec`) ; on la dit à la page avant de partir
import { existsSync } from 'node:fs'
const STOP = '/tmp/quiet.stop'
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
