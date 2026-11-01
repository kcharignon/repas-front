// Construit l'agent du drive (DRV-301) : `src/index.ts` en un seul fichier IIFE minifié, sans dépendance à l'exécution.
//
//   make agent-build     (dans Docker)    ou    node drive-agent/scripts/build.mjs
//   make agent-verify                            idem, deux fois de suite, en échouant si les deux constructions diffèrent
//
// Sorties dans `drive-agent/dist/` (jamais commitées) :
//   - `agent.js`       le code, précédé d'une ligne de version ; l'application Android l'embarque (DRV-313) ;
//   - `manifest.json`  `{version, bytes, sha384}` : la version, la taille et l'empreinte SHA-384 (au format `sha384-<base64>`,
//                      celui de l'attribut `integrity`) de `agent.js`, que la construction de l'application compare à l'empreinte attendue.
//
// Construction reproductible : versions épinglées par le verrou de npm, aucune date ni chemin absolu dans le fichier, donc deux
// constructions (ici, en CI, sur un autre poste) donnent la même empreinte.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'

import { AGENT_VERSION } from '../src/version.ts'

/**
 * @typedef {object} AgentManifest
 * @property {string} version  la version de l'agent (semver)
 * @property {number} bytes    la taille de `agent.js` en octets
 * @property {string} sha384   l'empreinte de `agent.js`, au format `sha384-<base64>`
 */

/**
 * @typedef {object} AgentBuild
 * @property {string} code            le contenu de `agent.js`
 * @property {AgentManifest} manifest  le contenu de `manifest.json`
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Le dossier des sorties. */
export const DIST = join(root, 'dist')

/**
 * Le budget de taille de `agent.js` : un garde-fou contre une bibliothèque embarquée par mégarde, pas une limite d'un navigateur
 * (l'agent est un actif de l'application, plus une chaîne de favori). Modifiable pour un essai : `AGENT_MAX_BYTES=<octets>`.
 */
export const DEFAULT_MAX_BYTES = 300_000

/** L'empreinte SHA-384 d'un contenu, au format de l'attribut `integrity` : `sha384-<base64>`. */
export function digestOf(/** @type {string | Uint8Array} */ content) {
  return `sha384-${createHash('sha384').update(content).digest('base64')}`
}

/**
 * Construit l'agent, sans rien écrire.
 *
 * @param {{ maxBytes?: number, entry?: string }} [options]  `entry` : le point d'entrée, relatif à `drive-agent/` (`src/index.ts`
 *   par défaut ; les tests en donnent un autre pour éprouver la chaîne de construction sur un code qui ne soit pas vide)
 * @returns {Promise<AgentBuild>}
 * @throws {Error} si la construction ne donne pas un seul fichier ou dépasse le budget de taille.
 */
export async function buildAgent({ maxBytes = DEFAULT_MAX_BYTES, entry = 'src/index.ts' } = {}) {
  const result = await build({
    configFile: false,
    root,
    logLevel: 'warn',
    publicDir: false,
    build: {
      write: false,
      // Les WebView à jour des téléphones (Chrome 94 et plus). Le même résultat sur tous les postes : la cible est écrite ici.
      target: 'es2022',
      minify: true,
      sourcemap: false,
      reportCompressedSize: false,
      emptyOutDir: false,
      modulePreload: false,
      rolldownOptions: {
        input: resolve(root, entry),
        output: { format: 'iife', entryFileNames: 'agent.js' },
      },
    },
  })
  /** @type {import('vite').Rolldown.RolldownOutput[]} */
  const outputs = Array.isArray(result) ? result : [/** @type {any} */ (result)]
  const chunks = outputs.flatMap((output) => output.output).filter((item) => item.type === 'chunk')
  const chunk = chunks[0]
  if (chunks.length !== 1 || chunk === undefined) {
    throw new Error(`L'agent doit tenir en un seul fichier (${chunks.length} trouvés).`)
  }
  const body = chunk.code.trim()
  const code = `/*! Repas Drive agent ${AGENT_VERSION} */\n${body === '' ? '' : `${body}\n`}`
  const bytes = Buffer.byteLength(code)
  if (bytes > maxBytes) {
    throw new Error(
      `L'agent fait ${bytes} octets, au-delà du budget de ${maxBytes} octets : une bibliothèque est-elle entrée dans le fichier ?`,
    )
  }
  return { code, manifest: { version: AGENT_VERSION, bytes, sha384: digestOf(code) } }
}

/**
 * Écrit `agent.js` et `manifest.json` dans `dist/` et rend leurs chemins.
 *
 * @param {AgentBuild} built
 * @param {string} [dist]
 */
export function writeBuild(built, dist = DIST) {
  mkdirSync(dist, { recursive: true })
  const agent = join(dist, 'agent.js')
  const manifest = join(dist, 'manifest.json')
  writeFileSync(agent, built.code)
  writeFileSync(manifest, `${JSON.stringify(built.manifest, null, 2)}\n`)
  return { agent, manifest }
}

/** Le budget demandé par l'environnement (`AGENT_MAX_BYTES`), ou celui par défaut. */
function maxBytesFromEnvironment() {
  const raw = process.env.AGENT_MAX_BYTES
  if (raw === undefined || raw === '') return DEFAULT_MAX_BYTES
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `AGENT_MAX_BYTES doit être un nombre entier d'octets, positif (reçu « ${raw} »).`,
    )
  }
  return value
}

/** @param {number} bytes */
function kilo(bytes) {
  return (bytes / 1000).toFixed(1).replace('.', ',')
}

async function main() {
  const maxBytes = maxBytesFromEnvironment()
  const built = await buildAgent({ maxBytes })
  if (process.argv.includes('--twice')) {
    const again = await buildAgent({ maxBytes })
    if (again.manifest.sha384 !== built.manifest.sha384) {
      console.error(
        'Construction non reproductible : deux constructions successives donnent deux empreintes.',
      )
      console.error(`  première : ${built.manifest.sha384}`)
      console.error(`  seconde  : ${again.manifest.sha384}`)
      process.exitCode = 1
      return
    }
    console.log(
      'Construction reproductible : deux constructions successives donnent la même empreinte.',
    )
  }
  const written = writeBuild(built)
  const { version, bytes, sha384 } = built.manifest
  console.log(`Agent construit : ${relative(process.cwd(), written.agent)}`)
  console.log(`Version : ${version}`)
  console.log(
    `Taille : ${bytes} octets (${kilo(bytes)} Ko), budget ${maxBytes} octets (${kilo(maxBytes)} Ko)`,
  )
  console.log(`Empreinte SHA-384 : ${sha384}`)
  console.log(`Manifeste : ${relative(process.cwd(), written.manifest)}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
