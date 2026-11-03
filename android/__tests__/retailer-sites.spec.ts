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
const registry = join(coreMain, 'eu/kantin/repas/drive/RetailerSites.kt')

/** Les identifiants des enseignes inscrites (allumées ou éteintes), lus dans l’entrée de chaque enseigne du registre. */
const retailerIds = [...codeOf(read(registry)).matchAll(/\bid = "([a-z][a-z0-9]*)"/g)].map((match) => match[1] as string)

describe('le registre des enseignes est le seul endroit du cœur qui nomme une enseigne', () => {
  it('regarde bien les sources du cœur, dont le registre', () => {
    expect(files.length).toBeGreaterThanOrEqual(15)
    expect(files.map((path) => basename(path))).toEqual(expect.arrayContaining(['RetailerSites.kt', 'RetailerSite.kt', 'RetailerValue.kt']))
  })

  it('inscrit Leclerc et Auchan, et aucune autre enseigne', () => {
    expect(retailerIds).toEqual(['leclerc', 'auchan'])
  })

  it('n’écrit le nom d’aucune enseigne inscrite dans le code d’un autre fichier du cœur', () => {
    for (const id of retailerIds) {
      const offenders = files.filter((path) => basename(path) !== 'RetailerSites.kt').filter((path) => new RegExp(id, 'i').test(codeOf(read(path))))

      expect({ id, offenders: offenders.map((path) => path.slice(androidDir.length + 1)) }).toEqual({ id, offenders: [] })
    }
  })

  it('porte l’entrée de chaque enseigne dans le registre', () => {
    const code = codeOf(read(registry))

    expect(code).toMatch(/id = "leclerc"/)
    expect(code).toMatch(/id = "auchan"/)
  })

  it('sert Auchan dans le registre de la version publiée (DRV-738), après Leclerc, et ne garde aucune enseigne éteinte', () => {
    const code = codeOf(read(registry))

    expect(code).toContain('val DEFAULT = RetailerSites(listOf(LECLERC, AUCHAN))')
    expect(code).toContain('val SWITCHED_OFF: List<RetailerSite> = emptyList()')
  })

  it('fait passer Leclerc par sa version mobile (DRV-754) : plus de mode ordinateur, plus de site mobile refusé, Auchan inchangé', () => {
    const code = codeOf(read(registry))
    const leclerc = code.slice(code.indexOf('private val LECLERC'), code.indexOf('private val AUCHAN'))

    expect(leclerc).toContain('siteMode = SiteMode.MOBILE')
    expect(leclerc).not.toContain('SiteMode.DESKTOP')
    expect(leclerc).not.toContain('mobileSiteLabel')
    expect(code).toContain('siteMode = SiteMode.AS_IS')
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

    expect(entry).toMatchObject({ id: 'leclerc', name: 'Leclerc', nameDe: 'de Leclerc', storeIdSource: 'URL' })
    expect(typeof entry?.storeAddressPattern).toBe('string')
    expect(typeof entry?.storeAddressExample).toBe('string')
  })

  it('liste Auchan, au magasin explicite, avec les champs que le cœur compare (DRV-728)', () => {
    const contract = JSON.parse(read(join(coreResources, 'retailers.sample.json'))) as { retailers: Record<string, unknown>[] }
    const entry = contract.retailers.find((retailer) => retailer.id === 'auchan')

    expect(entry).toMatchObject({ id: 'auchan', name: 'Auchan', nameDe: 'd’Auchan', storeIdSource: 'EXPLICIT', storeAddressExample: 'https://www.auchan.fr/' })
    expect(typeof entry?.storeIdPattern).toBe('string')
  })

  it('ne liste que les enseignes inscrites dans le cœur', () => {
    const contract = JSON.parse(read(join(coreResources, 'retailers.sample.json'))) as { retailers: { id: string }[] }

    expect(contract.retailers.map((retailer) => retailer.id)).toEqual(retailerIds)
  })
})
