// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Point d'entrée du favori : un seul fichier, aucune bibliothèque, aucun code distant.
import { realEnv } from './env'
import { launch } from './ui/shell'

try {
  launch(realEnv())
} catch (error) {
  // Sur un téléphone il n'y a pas de console : un message à l'écran vaut mieux qu'un favori qui ne fait rien.
  window.alert(
    `Banc d’essai : lancement impossible (${error instanceof Error ? error.message : String(error)})`,
  )
}
