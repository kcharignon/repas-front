// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Le chargeur : un petit favori `javascript:` qui tire le banc depuis jsDelivr (adresse figée sur un commit) et ne
// l'exécute que si son empreinte SHA-384 est celle du fichier publié. Voir DRV-009 et PROCEDURE.md.
//
//   make lab-loader sha=<commit de fusion>     (dans Docker)
//
// Sortie : `drive-agent/lab/dist/lab-loader.txt`, la chaîne à coller dans un favori.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { toBookmarklet } from './bookmarklet.ts'
import { buildLab } from './build.ts'
import { GITHUB_REPO, LOADER_LIMIT, PUBLISHED_FILE } from './published.ts'

const here = dirname(fileURLToPath(import.meta.url))

export interface LoaderInput {
  /** Commit de fusion qui contient `published/lab.js`, en entier (40 caractères hexadécimaux). */
  sha: string
  /** Contenu de `published/lab.js`. */
  published: string
  /** Ce que `make lab` produit maintenant : doit être identique à `published`. */
  current: string
}

export interface Loader {
  /** La chaîne `javascript:…` à coller dans un favori. */
  bookmarklet: string
  url: string
  integrity: string
}

/** Empreinte SHA-384 du fichier, au format de l'attribut `integrity`. */
export function integrityOf(content: string): string {
  return `sha384-${createHash('sha384').update(content, 'utf8').digest('base64')}`
}

export function publishedUrl(sha: string): string {
  return `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${sha}/drive-agent/lab/${PUBLISHED_FILE}`
}

/**
 * Construit le chargeur. Refuse un commit qui n'est pas complet, et un fichier publié qui n'est plus celui du banc actuel.
 * Le texte est en ASCII et sans guillemet double, dièse, pourcentage ni retour à la ligne : il survit à tout copier-coller.
 */
export function buildLoader(input: LoaderInput): Loader {
  if (!/^[0-9a-f]{40}$/i.test(input.sha)) {
    throw new Error(
      'Le commit doit être donné en entier : 40 caractères hexadécimaux (git rev-parse origin/main).',
    )
  }
  if (input.published !== input.current) {
    throw new Error(
      `${PUBLISHED_FILE} ne correspond plus au banc actuel : reconstruire et republier (make lab-publish), puis fusionner une PR.`,
    )
  }
  const url = publishedUrl(input.sha.toLowerCase())
  const integrity = integrityOf(input.published)
  const code =
    '(function(){var s=document.createElement(`script`);' +
    `s.src=\`${url}\`;s.integrity=\`${integrity}\`;s.crossOrigin=\`anonymous\`;` +
    // « réseau » s'écrit sans accent saisi : le texte reste en ASCII, que le presse-papiers de Windows copie sans l'abîmer.
    "s.onerror=function(){alert(`Banc d'essai : chargement impossible (r${String.fromCharCode(233)}seau, empreinte ou adresse).`)};" +
    '(document.head||document.documentElement).appendChild(s)})()'
  const bookmarklet = toBookmarklet(code)
  if (bookmarklet.length > LOADER_LIMIT) {
    throw new Error(
      `Chargeur trop long : ${bookmarklet.length} caractères, limite ${LOADER_LIMIT}.`,
    )
  }
  if (!/^javascript:[\x20-\x7e]+$/.test(bookmarklet) || /[%#"\\<>]/.test(bookmarklet)) {
    throw new Error(
      'Chargeur invalide : caractère interdit (pourcentage, dièse, guillemet double…).',
    )
  }
  return { bookmarklet, url, integrity }
}

async function main(): Promise<void> {
  const sha = process.argv[2] ?? ''
  const published = readFileSync(join(here, PUBLISHED_FILE), 'utf8')
  const { code } = await buildLab()
  const loader = buildLoader({ sha, published, current: code })
  const dist = join(here, 'dist')
  mkdirSync(dist, { recursive: true })
  // Sans retour à la ligne final : la chaîne est copiée telle quelle dans un favori.
  writeFileSync(join(dist, 'lab-loader.txt'), loader.bookmarklet)
  console.log(
    `Chargeur du banc d'essai construit : ${relative(process.cwd(), join(dist, 'lab-loader.txt'))}`,
  )
  console.log(
    `Taille de la chaîne : ${loader.bookmarklet.length} caractères, limite ${LOADER_LIMIT}`,
  )
  console.log(`Adresse du banc : ${loader.url}`)
  console.log(`Empreinte : ${loader.integrity}`)
  console.log(
    'Copier la chaîne dans le presse-papiers de Windows (depuis WSL) : clip.exe < drive-agent/lab/dist/lab-loader.txt',
  )
  console.log('Suite : drive-agent/lab/PROCEDURE.md')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
