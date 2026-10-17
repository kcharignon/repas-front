// Un point d'entrée d'essai : l'adaptateur Leclerc tout entier, appelé sur des valeurs connues seulement à l'exécution, pour mesurer ce
// qu'il ajoute à l'agent (la construction ne retire que ce que personne n'appelle).
import { browserDeps, LeclercAdapter } from '../../src/leclerc'

window.addEventListener('message', (event) => {
  const adapter = new LeclercAdapter(browserDeps(window))
  const query = String(event.data)
  void adapter.searchProducts(query).then((candidates) => {
    document.title = JSON.stringify([adapter.readStore(), candidates])
  })
  void adapter.setCartQuantity(query, Number(query))
  void adapter.readProductFromSearch(query, query)
})
