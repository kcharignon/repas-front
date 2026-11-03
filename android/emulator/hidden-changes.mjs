// Mesure le SYMPTÔME du défaut de la carte du guide (scénario 8) : combien de fois, en <secondes>, l'attribut `hidden` d'un élément de l'interface de l'agent change-t-il ?
// Par le débogage à distance de la WebView (APK de DÉBOGAGE seulement, comme display.mjs et quiet.mjs ; socket redirigé vers 127.0.0.1:9222 par `adb forward`). Lancé DANS le conteneur :
// `node /opt/repas-emulator/hidden-changes.mjs <secondes>`.
//
// L'interface de l'agent vit dans un Shadow DOM fermé que le JavaScript de la page ne voit pas : le protocole DOM du débogage, lui, le traverse (`pierce`) et signale chaque changement
// d'attribut (`DOM.attributeModified`, `DOM.attributeRemoved`). On ne compte que les éléments DE l'interface de l'agent (sous une racine d'ombre). Une carte posée une fois : au plus 1 changement.
// Constaté le 2026-11-02 (agent 0.62.x) : 8 pose-et-retrait de `hidden` en 4 s sur un élément de la carte (`fit.ts`, `check()` toutes les 500 ms, puis `apply`).
//
// Sortie, une ligne : `max=<plus grand nombre de changements d'un même élément> element=<balise et classes de celui-là> total=<tous éléments>`.
// Code 2 et message sur la sortie d'erreur si aucune page http(s), ou si aucune racine d'ombre n'est trouvée (rien à mesurer : un faux vert serait pire qu'un échec).
const PORT = 9222
const seconds = Number(process.argv[2] ?? 4)
const fail = (message) => {
  console.error(`hidden-changes.mjs : ${message}`)
  process.exit(2)
}
let targets
try {
  targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
} catch {
  fail('débogage à distance injoignable (adb forward manquant ? APK de débogage ?)')
}
const page = targets.find((target) => target.type === 'page' && /^https?:\/\//.test(target.url))
if (!page) fail('aucune page http(s) dans la WebView')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve) => {
  socket.onopen = resolve
  socket.onerror = () => fail('connexion au débogage refusée')
})
let counter = 0
const waiting = new Map()
const changes = new Map()
let tracked = new Map()
socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined) waiting.get(message.id)?.(message)
  else if (
    (message.method === 'DOM.attributeModified' || message.method === 'DOM.attributeRemoved') &&
    message.params?.name === 'hidden' &&
    tracked.has(message.params.nodeId)
  ) {
    const id = message.params.nodeId
    changes.set(id, (changes.get(id) ?? 0) + 1)
  }
}
const call = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++counter
    waiting.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
await call('DOM.enable')
const { result } = await call('DOM.getDocument', { depth: -1, pierce: true })
if (!result?.root) fail('le document de la page est illisible')
// Les éléments sous une racine d'ombre : ce sont ceux de l'interface de l'agent (la page du site n'en a pas de fermée)
const labelOf = (node) => {
  const attributes = node.attributes ?? []
  const at = attributes.indexOf('class')
  return `${node.nodeName.toLowerCase()}${at >= 0 ? `.${String(attributes[at + 1]).trim().split(/\s+/).join('.')}` : ''}`
}
let shadowRoots = 0
const walk = (node, inShadow) => {
  if (inShadow && node.nodeType === 1) tracked.set(node.nodeId, labelOf(node))
  for (const root of node.shadowRoots ?? []) {
    shadowRoots += 1
    walk(root, true)
  }
  for (const child of node.children ?? []) walk(child, inShadow)
  if (node.contentDocument) walk(node.contentDocument, inShadow)
}
walk(result.root, false)
if (shadowRoots === 0) fail("aucune racine d'ombre : l'interface de l'agent n'est pas à l'écran")
await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
let max = 0
let worst = '-'
let total = 0
for (const [id, count] of changes) {
  total += count
  if (count > max) {
    max = count
    worst = tracked.get(id) ?? '?'
  }
}
console.log(`max=${max} element=${worst} total=${total}`)
process.exit(0)
