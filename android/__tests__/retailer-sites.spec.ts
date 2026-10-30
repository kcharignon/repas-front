// @vitest-environment node
// Le registre des enseignes du cœur de l'application (DRV-706, ADR 0027 du back) : la seule liste, et le seul endroit du cœur qui nomme une enseigne.
// `RetailerSitesArchitectureTest` (Kotlin, `make android-test`) tient la même règle ; ce fichier la rejoue dans `make check`, sans construire l'application,
// et vérifie que la copie du contrat des enseignes lue par les tests Kotlin n'a pas dérivé.
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const coreMain = join(androidDir, 'core', 'src', 'main', 'kotlin')
const coreResources = join(androidDir, 'core', 'src', 'test', 'resources')
const contractDir = join(androidDir, '..', 'drive-agent', 'fixtures', 'contract')

const read = (path: string) => readFileSync(path, 'utf8')

function kotlinFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? kotlinFiles(path) : entry.name.endsWith('.kt') ? [path] : []
  })
}

/** Le code sans ses commentaires (KDoc compris) : une phrase qui explique un constat sur un site peut nommer l'enseigne. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
}

const files = kotlinFiles(coreMain)

describe('le registre des enseignes est le seul endroit du cœur qui nomme une enseigne', () => {
  it('regarde bien les sources du cœur, dont le registre', () => {
    expect(files.length).toBeGreaterThanOrEqual(15)
    expect(files.map((path) => basename(path))).toEqual(expect.arrayContaining(['RetailerSites.kt', 'RetailerSite.kt', 'RetailerValue.kt']))
  })

  it('n’écrit « leclerc » dans le code d’aucun autre fichier du cœur', () => {
    const offenders = files
      .filter((path) => basename(path) !== 'RetailerSites.kt')
      .filter((path) => /leclerc/i.test(codeOf(read(path))))

    expect(offenders.map((path) => path.slice(androidDir.length + 1))).toEqual([])
  })

  it('porte l’entrée d’aujourd’hui dans le registre', () => {
    expect(codeOf(read(join(coreMain, 'eu/kantin/repas/drive/RetailerSites.kt')))).toMatch(/id = "leclerc"/)
  })

  it('n’écrit aucune règle d’origine à la main hors du modèle d’enseigne', () => {
    const offenders = files.filter((path) => basename(path) !== 'RetailerSite.kt').filter((path) => /"https:\/\/\*/.test(codeOf(read(path))))

    expect(offenders.map((path) => path.slice(androidDir.length + 1))).toEqual([])
  })
})

describe('le contrat des enseignes lu par les tests Kotlin', () => {
  it('est la copie exacte de l’exemple du back recopié pour l’agent', () => {
    expect(read(join(coreResources, 'retailers.sample.json'))).toBe(read(join(contractDir, 'retailers.sample.json')))
  })

  it('liste l’enseigne d’aujourd’hui avec les champs que le cœur compare', () => {
    const contract = JSON.parse(read(join(coreResources, 'retailers.sample.json'))) as { retailers: Record<string, unknown>[] }
    const entry = contract.retailers.find((retailer) => retailer.id === 'leclerc')

    expect(entry).toMatchObject({ id: 'leclerc', name: 'Leclerc', nameDe: 'de Leclerc' })
    expect(typeof entry?.storeAddressPattern).toBe('string')
    expect(typeof entry?.storeAddressExample).toBe('string')
  })
})
