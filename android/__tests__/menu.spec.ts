// @vitest-environment node
// Les menus de l'application (DRV-621, F13 de l'audit de simplicité) : les entrées de débogage n'existent que dans la variante de
// débogage, jamais dans l'APK signé ; « Ouvrir dans le navigateur » (utile au dépannage, rare pour un proche) vient en dernier.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const kotlin = (name: string) => readFileSync(join(androidDir, 'app', 'src', 'main', 'kotlin', 'eu', 'kantin', 'repas', 'drive', name), 'utf8')

const driveActivity = kotlin('DriveActivity.kt')
const mainActivity = kotlin('MainActivity.kt')

/** Les lignes `add(...)` de `menuEntries()` du drive, dans l'ordre. */
function driveMenuLines(): string[] {
  const start = driveActivity.indexOf('private fun menuEntries()')
  expect(start).toBeGreaterThan(-1)
  const end = driveActivity.indexOf('\n    }\n', start)
  return driveActivity
    .slice(start, end)
    .split('\n')
    .filter((line) => line.includes('R.string.menu_'))
}

/** La ligne parle de cette entrée (et non d'une autre qui commencerait par le même nom). */
const mentions = (line: string, name: string) => new RegExp(`R\\.string\\.${name}\\b`).test(line)

const DEBUG_ENTRIES = ['menu_selftest', 'menu_debug_plan']

describe('les entrées de débogage du menu du drive', () => {
  it.each(DEBUG_ENTRIES)('« %s » n’est ajoutée que sous BuildConfig.DEBUG', (name) => {
    const lines = driveMenuLines().filter((line) => mentions(line, name))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^\s*if \(BuildConfig\.DEBUG\) add\(/)
  })

  it('aucune autre entrée du menu du drive ne dépend de BuildConfig.DEBUG', () => {
    const others = driveMenuLines().filter((line) => !DEBUG_ENTRIES.some((name) => mentions(line, name)))
    expect(others.filter((line) => line.includes('BuildConfig.DEBUG'))).toEqual([])
  })

  it('n’existent pas dans le menu de la coquille Repas', () => {
    for (const name of [...DEBUG_ENTRIES, 'menu_diagnostic']) expect(mainActivity).not.toContain(`R.string.${name}`)
  })
})

describe('l’ordre du menu du drive', () => {
  it('garde « Ouvrir dans le navigateur » en dernier', () => {
    const lines = driveMenuLines()
    expect(lines[lines.length - 1]).toContain('R.string.menu_browser')
  })

  it('offre « Se déconnecter de Leclerc » avant le dépannage (diagnostic, navigateur)', () => {
    const names = driveMenuLines().map((line) => /R\.string\.(menu_\w+)/.exec(line)?.[1])
    expect(names.indexOf('menu_logout_drive')).toBeGreaterThan(-1)
    expect(names.indexOf('menu_logout_drive')).toBeLessThan(names.indexOf('menu_diagnostic'))
    expect(names.indexOf('menu_diagnostic')).toBeLessThan(names.indexOf('menu_browser'))
  })
})

describe('les menus nomment l’enseigne (DRV-707)', () => {
  it('le menu de la coquille offre « Ouvrir le drive » et « Se déconnecter » pour chaque enseigne annoncée, jamais pour une enseigne d’essai', () => {
    const start = mainActivity.indexOf('private fun openMenu()')
    expect(start).toBeGreaterThan(-1)
    const menu = mainActivity.slice(start, mainActivity.indexOf('\n    }\n', start))

    expect(menu).toContain('val announced = repasApp.announced.all')
    expect(menu).toMatch(/announced\.forEach \{ site -> add\(getString\(R\.string\.menu_open_drive, site\.name, site\.nameDe\)/)
    expect(menu).toMatch(/getString\(R\.string\.menu_logout_drive, site\.name, site\.nameDe\)/)
    // l’ordre d’avant, avec une seule enseigne : réglages, ouvrir, version, se déconnecter
    const names = [...menu.matchAll(/R\.string\.(menu_\w+)/g)].map((match) => match[1])
    expect(names).toEqual(['menu_drive_settings', 'menu_open_drive', 'menu_about', 'menu_logout_drive'])
  })

  it('le menu du drive compose chaque texte avec l’enseigne de l’écran', () => {
    expect(driveActivity).toContain('private fun text(resource: Int): String = getString(resource, site.name, site.nameDe)')
    expect(driveActivity).toMatch(/add\(text\(R\.string\.menu_logout_drive\) to \{ confirmClearDriveData\(site, ::clearDriveData\) \}\)/)
  })
})
