// @vitest-environment node
// Le garde-fou du registre (DRV-704) : une enseigne n'est nommée qu'à l'intérieur de son dossier (`src/leclerc/`) et de l'entrée du registre
// (`src/retailers/index.ts`, `contract.ts`). Le passage, le diagnostic, le test automatique et l'interface ne l'importent plus ; ajouter une
// enseigne, c'est un dossier de plus et une entrée de registre, pas une retouche de ces couches.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return files(full)
    return name.endsWith('.ts') ? [full] : []
  })
}

/** Le code sans ses commentaires (un commentaire peut dire « Leclerc » : seul le code compte), les chaînes restent. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

const all = files(SRC).map((file) => ({
  file: relative(SRC, file),
  text: readFileSync(file, 'utf8'),
}))
const OUTSIDE = all.filter(
  ({ file }) =>
    !file.startsWith('leclerc/') &&
    file !== 'retailers/index.ts' &&
    file !== 'retailers/contract.ts',
)

describe('l’agent ne nomme pas son enseigne hors de son dossier', () => {
  it('flow, diagnostic, selftest, ui, transport et agent n’importent pas le dossier d’une enseigne', () => {
    const importing = OUTSIDE.filter(({ text }) =>
      /from\s+['"](?:\.\.?\/)+leclerc['"]|import\(.*leclerc/.test(code(text)),
    ).map(({ file }) => file)

    expect(importing).toEqual([])
  })

  // Les textes affichés, le diagnostic, le filtre du rapport et la liste blanche des photos prennent le nom de l'enseigne (ou sa règle) en paramètre
  // (DRV-705, DRV-717) : plus aucun fichier hors de son dossier et du registre ne nomme Leclerc dans son code.
  it('le mot « leclerc » n’apparaît dans le code que dans le dossier de l’enseigne et le registre', () => {
    const naming = OUTSIDE.filter(({ text }) => /leclerc/i.test(code(text))).map(({ file }) => file)

    expect(naming.sort()).toEqual([])
  })
})

// Auchan (DRV-727) : son nom n'est écrit que dans son dossier et dans l'entrée du registre, même dans un commentaire.
// Auchan (DRV-727, DRV-717) : son nom n'est écrit que dans son dossier, dans l'entrée du registre et dans le tableau des causes (qui reprend les
// siennes), même dans un commentaire.
const REGISTRY_FILES = ['retailers/causes.ts', 'retailers/index.ts']

describe('l’agent ne nomme Auchan que dans son dossier et dans le registre', () => {
  it('le mot « auchan » n’apparaît que dans auchan/, retailers/index.ts et retailers/causes.ts', () => {
    const naming = all
      .filter(({ text }) => /auchan/i.test(text))
      .map(({ file }) => file)
      .filter((file) => !file.startsWith('auchan/'))

    expect(naming.sort()).toEqual(REGISTRY_FILES)
  })

  it('l’adaptateur d’Auchan n’importe ni le dossier d’une autre enseigne ni le passage, l’interface ou le diagnostic', () => {
    const imports = all
      .filter(({ file }) => file.startsWith('auchan/'))
      .flatMap(({ file, text }) =>
        [...code(text).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => ({
          file,
          from: match[1] ?? '',
        })),
      )
    const forbidden = imports.filter(({ from }) =>
      /(^|\/)(leclerc|flow|diagnostic|selftest|ui|transport|agent)(\/|$)/.test(from),
    )

    expect(forbidden).toEqual([])
  })

  it('le dossier d’Auchan ne nomme pas non plus Leclerc dans son code', () => {
    const naming = all
      .filter(({ file }) => file.startsWith('auchan/'))
      .filter(({ text }) => /leclerc/i.test(code(text)))
      .map(({ file }) => file)

    expect(naming).toEqual([])
  })
})
