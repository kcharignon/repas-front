// @vitest-environment node
// Le nom d'une enseigne n'est écrit que dans le registre du web et dans la section de chaque enseigne des textes (DRV-708, DRV-727). Un composant, un module
// ou un texte qui écrirait « Auchan » à la main, même dans un commentaire, fait échouer ce test : on prend le nom en paramètre (\`retailerParams\`).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory())
      return entry.name === '__tests__' || path === join(SRC, 'api') ? [] : files(path)
    return /\.(ts|vue)$/.test(entry.name) ? [path] : []
  })
}

const naming = (name: RegExp) =>
  files(SRC)
    .filter((path) => name.test(readFileSync(path, 'utf8')))
    .map((path) => relative(SRC, path))
    .sort()

describe('le nom d’Auchan dans le web', () => {
  it('n’apparaît que dans le registre des enseignes et dans le fichier de textes (la section des conditions)', () => {
    expect(naming(/auchan/i)).toEqual(['features/drive/retailers.ts', 'i18n/fr.ts'])
  })

  it('le fichier de textes ne le nomme que dans la section « driveTerms.retailers.auchan »', () => {
    const text = readFileSync(join(SRC, 'i18n', 'fr.ts'), 'utf8')
    const section = /\n {6}auchan: \{[\s\S]*?\n {6}\},/.exec(text)?.[0] ?? ''

    expect(section).toContain('specific:')
    expect(text.replace(section, '')).not.toMatch(/auchan/i)
  })
})
