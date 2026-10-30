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

/**
 * Les textes affichés, le diagnostic et le filtre du rapport prennent le nom de l'enseigne en paramètre (DRV-705) : ils ne la nomment plus. Reste la
 * liste blanche des hôtes de photos : une règle de sécurité que l'écran revérifie sans connaître l'enseigne, à rendre propre à chaque enseigne avec la
 * deuxième (DRV-717). Cette liste ne grandit pas : un fichier qui en sort la retire, un autre ne s'y ajoute pas.
 */
const STILL_NAMING = ['photo-url.ts']

describe('l’agent ne nomme pas son enseigne hors de son dossier', () => {
  it('flow, diagnostic, selftest, ui, transport et agent n’importent pas le dossier d’une enseigne', () => {
    const importing = OUTSIDE.filter(({ text }) =>
      /from\s+['"](?:\.\.?\/)+leclerc['"]|import\(.*leclerc/.test(code(text)),
    ).map(({ file }) => file)

    expect(importing).toEqual([])
  })

  it('le mot « leclerc » n’apparaît dans le code que dans les fichiers de la liste d’attente', () => {
    const naming = OUTSIDE.filter(({ text }) => /leclerc/i.test(code(text))).map(({ file }) => file)

    expect(naming.sort()).toEqual(STILL_NAMING)
  })

  it('les fichiers de la liste d’attente existent encore et nomment bien l’enseigne', () => {
    const stillNaming = STILL_NAMING.filter((file) => {
      const found = all.find((item) => item.file === file)
      return found !== undefined && /leclerc/i.test(code(found.text))
    })

    expect(stillNaming).toEqual(STILL_NAMING)
  })
})

// Auchan (DRV-727) : son nom n'est écrit que dans son dossier et dans l'entrée du registre, même dans un commentaire.
describe('l’agent ne nomme Auchan que dans son dossier et dans le registre', () => {
  it('le mot « auchan » n’apparaît que dans auchan/ et retailers/index.ts', () => {
    const naming = all.filter(({ text }) => /auchan/i.test(text)).map(({ file }) => file)

    expect(naming.sort()).toEqual(['auchan/adapter.ts', 'auchan/index.ts', 'retailers/index.ts'])
  })

  it('l’adaptateur d’Auchan n’importe ni le dossier d’une autre enseigne ni le passage', () => {
    const imports = all
      .filter(({ file }) => file.startsWith('auchan/'))
      .flatMap(({ text }) =>
        [...code(text).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]),
      )

    expect(imports.sort()).toEqual(['../retailers/contract', '../retailers/errors', './adapter'])
  })
})
