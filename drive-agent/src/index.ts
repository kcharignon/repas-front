// Point d'entrée de `dist/agent.js` : exécute l'agent au chargement du fichier. Rien n'est exporté (le bundle est une fonction
// anonyme appelée sur-le-champ, il ne laisse aucune variable globale dans la page de l'enseigne).
import { run } from './agent'

run()
