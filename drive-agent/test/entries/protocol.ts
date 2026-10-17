// Un point d'entrée d'essai : les quatre fonctions du protocole, appelées sur une valeur connue seulement à l'exécution, pour mesurer
// ce qu'elles ajoutent à l'agent (la construction ne retire que ce que personne n'appelle).
import { decodeMessage, encodeMessage, validatePlan, validateResult } from '../../protocol'

window.addEventListener('message', (event) => {
  const message = decodeMessage(String(event.data))
  validatePlan(message)
  validateResult(message)
  document.title = encodeMessage(message)
})
