// Un point d'entrée d'essai (pas l'agent) : un code qui n'est pas vide, avec une importation relative, pour éprouver la chaîne de
// construction (un seul fichier, IIFE, minifié, aucune variable globale). `build.spec.ts` le construit à la place de `src/index.ts`.
import { greet } from './sample-greet'

const note = document.createElement('p')
note.textContent = greet('test')
document.body.append(note)
