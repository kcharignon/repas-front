// L'empreinte SHA-384 attendue de l'agent embarqué dans l'application Android (DRV-313).
//
// La construction de l'APK copie `drive-agent/dist/agent.js` (produit par `make agent-build`) dans l'application et échoue si son
// empreinte n'est pas celle de `android/agent.js.sha384`. Quand l'agent change exprès (n'importe quel fichier de `drive-agent/src` ou de
// `drive-agent/protocol`), il faut noter la nouvelle empreinte :
//
//   make android-agent-hash        (dans Docker)    ou    node android/agent-digest.ts --write
//
// Sans option, le script vérifie seulement (code de sortie 1 si les deux ne concordent plus). Le fichier se compare à une construction
// toute fraîche de l'agent (la construction est reproductible, `make agent-verify`), jamais à un `dist/` qui peut être périmé.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildAgent } from '../drive-agent/scripts/build.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/** L'empreinte attendue, sur une ligne, au format de l'attribut `integrity` (`sha384-<base64>`). */
export const DIGEST_FILE = join(here, 'agent.js.sha384')

export function expectedDigest(): string {
  return readFileSync(DIGEST_FILE, 'utf8').trim()
}

/** L'empreinte de l'agent tel que le construit le code actuel. */
export async function freshDigest(): Promise<string> {
  return (await buildAgent()).manifest.sha384
}

async function main(): Promise<void> {
  const actual = await freshDigest()
  if (process.argv.includes('--write')) {
    writeFileSync(DIGEST_FILE, `${actual}\n`)
    console.log(`Empreinte notée dans ${relative(process.cwd(), DIGEST_FILE)} : ${actual}`)
    console.log('À commiter avec le changement de l’agent, et à dire dans la PR.')
    return
  }
  const expected = expectedDigest()
  if (actual === expected) {
    console.log(`L’agent embarqué est celui attendu : ${actual}`)
    return
  }
  console.error(`L’agent construit (${actual}) n’est plus celui attendu (${expected}).`)
  console.error('Si le changement est voulu : make android-agent-hash')
  process.exitCode = 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
