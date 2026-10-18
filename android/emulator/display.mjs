// Mesure l'affichage de la page du drive dans la WebView de l'APK de DÉBOGAGE (jamais de publication : le débogage à distance n'y existe pas), par
// son socket de débogage que `adb forward` a redirigé vers 127.0.0.1:9222 (voir `display_measures` de lib.sh). Lancé DANS le conteneur de
// l'émulateur, avec le Node qui y est (`node /opt/repas-emulator/display.mjs`). N'écrit qu'une ligne de JSON sur la sortie standard :
//
//   {"innerWidth":980,"innerHeight":2016,"screenWidth":412,"screenHeight":924,"dpr":2.625,"scale":0.4207,"visibleWidth":980,"visibleHeight":2016,"factor":2.377,"frameWidth":412.19,"frameHeight":848}
//
// - `innerWidth`, `innerHeight` : la fenêtre de la page (px CSS) ; `screenWidth`, `screenHeight` : l'écran (dp) ; `dpr` : pixels physiques par dp ;
//   `scale` : les dp par pixel CSS de la page (`visualViewport.scale`, zoom de la fenêtre large compris) ; `visibleWidth`, `visibleHeight` : la partie
//   de la page que l'on voit (px CSS) ;
// - `factor`, `frameWidth`, `frameHeight` : ce que l'agent a posé pour son interface, lu dans son Shadow DOM fermé que seul le débogage à distance
//   traverse (facteur d'agrandissement, taille du cadre en px CSS), absents tant que l'agent n'affiche rien.
// Sort avec le code 1 et un message sur la sortie d'erreur si la page du drive n'est pas joignable. Aucune donnée d'enseigne : seulement des nombres.
const PORT = 9222

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
const waiting = new Map()
socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  waiting.get(message.id)?.(message)
}
const call = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++counter
    waiting.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })

const page_ = await call('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const seen = window.visualViewport
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenWidth: screen.width,
      screenHeight: screen.height,
      dpr: window.devicePixelRatio,
      scale: seen ? Number(seen.scale.toFixed(4)) : 0,
      visibleWidth: seen ? Math.round(seen.width) : 0,
      visibleHeight: seen ? Math.round(seen.height) : 0,
    }
  })()`,
})
const measures = page_.result?.result?.value ?? {}

// Le cadre de l'interface de l'agent : `div.overlay`, dans le Shadow DOM fermé du conteneur (DOM.getDocument le traverse avec `pierce`).
const { result } = await call('DOM.getDocument', { depth: -1, pierce: true })
const find = (node) => {
  const attributes = node.attributes ?? []
  if (node.nodeName === 'DIV' && attributes[attributes.indexOf('class') + 1] === 'overlay') return node
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const found = find(child)
    if (found) return found
  }
  return null
}
const overlay = find(result.root)
if (overlay) {
  const attributes = overlay.attributes
  const style = attributes[attributes.indexOf('style') + 1] ?? ''
  const read = (name) => Number(new RegExp(`(?:^|[ ;])${name}:\\s*([0-9.]+)`).exec(style)?.[1])
  const factor = Number(/scale\(([0-9.]+)\)/.exec(style)?.[1] ?? 1)
  Object.assign(measures, { factor, frameWidth: read('width'), frameHeight: read('height') })
}

console.log(JSON.stringify(measures))
socket.close()
process.exit(0)
