// @vitest-environment node
// Règles du ticket DRV-001 vérifiées sur le code source du favori (hors tests).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))

const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.ts') && !path.includes('__tests__'))
  .map((path) => ({
    path: relative(SRC, join(SRC, path)),
    text: readFileSync(join(SRC, path), 'utf8'),
  }))

/** Le code sans commentaires de fin de ligne ni blocs `/* … *\/`, pour ne pas compter les phrases qui expliquent l'interdit. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('code source du favori', () => {
  it('compte bien les fichiers du favori', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each([
    ['eval', /\beval\s*\(/],
    ['new Function', /new\s+Function\b/],
    ['innerHTML', /innerHTML/],
    ['insertAdjacentHTML', /insertAdjacentHTML/],
    ['document.write', /document\.write\b/],
    ['console', /\bconsole\./],
    ['stockage persistant', /localStorage|sessionStorage|indexedDB|caches\./],
    [
      'bibliothèque ou code distant',
      /^\s*import\s[^'"]*from\s+['"](?!\.)|importScripts|\bimport\(/m,
    ],
  ])('n’utilise jamais : %s', (_name, forbidden) => {
    const offenders = files
      .filter((file) => forbidden.test(code(file.text)))
      .map((file) => file.path)

    expect(offenders).toEqual([])
  })

  it('ne lit les cookies que dans la sonde, pour un booléen', () => {
    const readers = files
      .filter((file) => /\.cookie\b/.test(code(file.text)))
      .map((file) => file.path)

    expect(readers).toEqual(['probe.ts'])
  })

  it('marque chaque fichier comme outil jetable', () => {
    const unmarked = files.filter(
      (file) =>
        !file.text.includes('Outil de test jetable, à supprimer après la décision G1 (DRV-005)'),
    )

    expect(unmarked.map((file) => file.path)).toEqual([])
  })

  it('ne cite qu’une adresse extérieure à Leclerc : Repas, dans la configuration', () => {
    const urls = files.flatMap((file) =>
      (code(file.text).match(/https?:\/\/[A-Za-z0-9.-]+/g) ?? []).map(
        (url) => `${file.path} ${url}`,
      ),
    )

    expect(urls).toEqual(['config.ts https://kantin.eu'])
  })
})
