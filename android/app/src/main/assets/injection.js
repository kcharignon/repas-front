/* Repas Drive : ce que l'application évalue dans chaque page de leclercdrive.fr (DRV-313). Le marqueur AGENT ci-dessous est remplacé par
   l'agent (agent.js) avant l'injection : l'application ne lance que ce fichier, jamais un code reçu d'un site.

   1. Le pont. L'application expose à la page un canal de messages `repasHost` (addWebMessageListener, réservé aux pages
      https://*.leclercdrive.fr). Ce petit script le remplace par un objet à la forme exacte qu'attend l'agent (drive-agent/src/transport/
      bridge.ts) : `postMessage(texte)` vers l'application et `addEventListener('message', ...)` pour ses messages. Il garde en file les
      messages reçus avant que l'agent ait fini de démarrer, et signale la page à l'application (message `hello`) : c'est ce premier message
      qui lui donne le canal de réponse vers cette page.
   2. L'agent ne démarre que dans la page principale, une seule fois, et seulement si le pont est en place.
   3. Le mode débogage (DRV-318). L'application remplace le marqueur DEBUG ci-dessous par `true` dans sa variante de débogage seulement. Alors le
      pont porte `isDebug` et le message d'accueil annonce `debug: true` : c'est ce qui permet à l'agent d'honorer la commande `selftest`.
      Dans toute autre variante le marqueur vaut `false`, le pont n'a pas `isDebug` et l'agent refuse la commande. */
if (
  (function () {
    'use strict'
    var win = window
    // Un cadre (par exemple le défi anti-robot) n'a ni agent ni pont.
    if (win.top !== win) return false
    var channel = win.repasHost
    if (!channel || typeof channel.postMessage !== 'function' || typeof channel.addEventListener !== 'function') return false
    // Déjà installé (page évaluée deux fois) : ni second pont, ni second agent.
    if (Object.prototype.hasOwnProperty.call(channel, 'isRepasBridge')) return false

    var DEBUG = /*__DEBUG__*/false
    var MAX_QUEUED = 4
    var defer = win.setTimeout.bind(win)
    var listeners = []
    var queued = []

    function deliver(data) {
      listeners.slice().forEach(function (listener) {
        try {
          listener({ data: data })
        } catch {
          /* l'écouteur d'un autre ne doit pas empêcher le suivant */
        }
      })
    }

    channel.addEventListener('message', function (event) {
      var data = event && event.data
      // Seuls les textes passent (le protocole est du JSON en texte).
      if (typeof data !== 'string') return
      if (listeners.length === 0) {
        if (queued.length < MAX_QUEUED) queued.push(data)
        return
      }
      deliver(data)
    })

    var bridge = {
      postMessage: function (text) {
        if (typeof text === 'string') channel.postMessage(text)
      },
      addEventListener: function (type, listener) {
        if (type !== 'message' || typeof listener !== 'function') return
        listeners.push(listener)
        // Les messages arrivés avant l'agent lui sont rendus une fois que son démarrage est fini.
        var waiting = queued.splice(0, queued.length)
        if (waiting.length > 0) {
          defer(function () {
            waiting.forEach(deliver)
          }, 0)
        }
      },
      removeEventListener: function (type, listener) {
        var index = listeners.indexOf(listener)
        if (type === 'message' && index >= 0) listeners.splice(index, 1)
      },
    }
    Object.defineProperty(bridge, 'isRepasBridge', { value: true })
    if (DEBUG) Object.defineProperty(bridge, 'isDebug', { value: true })
    Object.freeze(bridge)

    try {
      Object.defineProperty(win, 'repasHost', { value: bridge, configurable: true, writable: false })
    } catch {
      return false
    }
    if (win.repasHost !== bridge) return false
    channel.postMessage(DEBUG ? '{"v":1,"type":"hello","debug":true}' : '{"v":1,"type":"hello"}')
    return true
  })()
) {
  /*__AGENT__*/
}
