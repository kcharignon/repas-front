// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// L'empreinte SHA-384 attendue du banc d'essai embarqué dans l'application Android (DRV-011).
//
// La construction de l'APK copie `drive-agent/lab/published/lab.js` dans l'application et échoue si son empreinte n'est pas
// celle de `lab.js.sha384`. Quand le banc change exprès (`make lab-publish`), il faut noter la nouvelle empreinte :
//
//   make android-lab-hash        (dans Docker)    ou    node drive-agent/android-lab/lab-digest.ts --write
//
// Sans option, le script vérifie seulement (code de sortie 1 si les deux ne concordent plus). Le format est celui de l'attribut
// `integrity` (`sha384-<base64>`), le même que celui que `make lab-loader` affiche.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** Le banc d'essai publié, copié dans l'application à la construction. */
export const LAB_FILE = join(here, '..', 'lab', 'published', 'lab.js')
/** L'empreinte attendue, sur une ligne. */
export const DIGEST_FILE = join(here, 'lab.js.sha384')

export function digestOf(content: Buffer | string): string {
  return `sha384-${createHash('sha384').update(content).digest('base64')}`
}

export function expectedDigest(): string {
  return readFileSync(DIGEST_FILE, 'utf8').trim()
}

export function actualDigest(): string {
  return digestOf(readFileSync(LAB_FILE))
}

function main(): void {
  const actual = actualDigest()
  if (process.argv.includes('--write')) {
    writeFileSync(DIGEST_FILE, `${actual}\n`)
    console.log(`Empreinte notée dans ${relative(process.cwd(), DIGEST_FILE)} : ${actual}`)
    console.log('À commiter avec le changement du banc, et à dire dans la PR.')
    return
  }
  const expected = expectedDigest()
  if (actual === expected) {
    console.log(`Le banc embarqué est celui attendu : ${actual}`)
    return
  }
  console.error(`Le banc publié (${actual}) n'est plus celui attendu (${expected}).`)
  console.error('Si le changement est voulu : make android-lab-hash')
  process.exitCode = 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
