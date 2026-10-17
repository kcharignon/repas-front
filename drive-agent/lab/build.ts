// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Construit le favori du banc d'essai : `src/main.ts` en un seul fichier minifié, puis la chaîne `javascript:…`.
//
//   make lab        (dans Docker)    ou    node drive-agent/lab/build.ts
//
// Sorties dans `drive-agent/lab/dist/` : `lab.js` (le code) et `lab-bookmarklet.txt` (la chaîne à coller dans un favori).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'
import type { Rolldown } from 'vite'

import { toBookmarklet } from './bookmarklet.ts'
import { PUBLISHED_FILE } from './published.ts'
import { BOOKMARKLET_LIMIT, LAB_NOTICE } from './src/config.ts'

const here = dirname(fileURLToPath(import.meta.url))

export interface LabBuild {
  /** Le code, un seul fichier, minifié, précédé de la mention « outil jetable ». */
  code: string
  /** La chaîne `javascript:…` prête à coller dans un favori. */
  bookmarklet: string
}

export async function buildLab(): Promise<LabBuild> {
  const result = await build({
    configFile: false,
    root: here,
    logLevel: 'warn',
    publicDir: false,
    build: {
      write: false,
      target: 'es2020',
      minify: true,
      sourcemap: false,
      reportCompressedSize: false,
      emptyOutDir: false,
      modulePreload: false,
      rolldownOptions: {
        input: resolve(here, 'src/main.ts'),
        output: { format: 'iife', entryFileNames: 'lab.js' },
      },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[]
  const chunks = outputs.flatMap((output) => output.output).filter((item) => item.type === 'chunk')
  if (chunks.length !== 1 || chunks[0] === undefined) {
    throw new Error(`Le favori doit tenir en un seul fichier (${chunks.length} trouvés).`)
  }
  const code = `/*! ${LAB_NOTICE} */\n${chunks[0].code.trim()}\n`
  return { code, bookmarklet: toBookmarklet(code) }
}

function kilo(bytes: number): string {
  return (bytes / 1000).toFixed(1).replace('.', ',')
}

async function main(): Promise<void> {
  const { code, bookmarklet } = await buildLab()
  const dist = join(here, 'dist')
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(dist, 'lab.js'), code)
  if (process.argv.includes('--publish')) {
    // Le fichier que jsDelivr servira (adresse figée sur un commit) et que le chargeur vérifie par son empreinte.
    mkdirSync(join(here, 'published'), { recursive: true })
    writeFileSync(join(here, PUBLISHED_FILE), code)
    console.log(
      `Code publié : drive-agent/lab/${PUBLISHED_FILE} (${Buffer.byteLength(code)} octets)`,
    )
  }
  // Sans retour à la ligne final : la chaîne est copiée telle quelle dans un favori.
  writeFileSync(join(dist, 'lab-bookmarklet.txt'), bookmarklet)

  const size = Buffer.byteLength(bookmarklet)
  const target = relative(process.cwd(), join(dist, 'lab-bookmarklet.txt'))
  console.log(`Favori du banc d'essai construit : ${target}`)
  console.log(
    `Taille de la chaîne : ${size} octets (${kilo(size)} Ko), limite ${BOOKMARKLET_LIMIT} octets (${kilo(BOOKMARKLET_LIMIT)} Ko)`,
  )
  console.log(`Code minifié : ${Buffer.byteLength(code)} octets`)
  if (size >= BOOKMARKLET_LIMIT) {
    console.error(
      'Trop gros : un navigateur peut refuser un favori de cette taille. Réduire le code.',
    )
    process.exitCode = 1
    return
  }
  console.log(`Début de la chaîne : ${bookmarklet.slice(0, 70)}…`)
  console.log(`Fin de la chaîne : …${bookmarklet.slice(-30)}`)
  console.log(
    'Copier la chaîne dans le presse-papiers de Windows (depuis WSL) : clip.exe < drive-agent/lab/dist/lab-bookmarklet.txt',
  )
  console.log('Suite : drive-agent/lab/PROCEDURE.md')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
