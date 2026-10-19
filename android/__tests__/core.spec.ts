// @vitest-environment node
// Le découpage de l'application en cœur sans Android (`android/core`) et en application (`android/app`) : AUTH-015, `android/ARCHITECTURE.md`.
// La règle d'or : le cœur n'importe rien d'Android. `CoreArchitectureTest` (Kotlin, `make android-test`) la tient aussi ; ce fichier la rejoue
// dans `make check`, sans construire l'application, et vérifie la tuyauterie Gradle et que la page d'architecture dit vrai.
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const coreMain = join(androidDir, 'core', 'src', 'main', 'kotlin')
const coreTest = join(androidDir, 'core', 'src', 'test', 'kotlin')
const appMain = join(androidDir, 'app', 'src', 'main', 'kotlin')

const read = (path: string) => readFileSync(path, 'utf8')

function kotlinFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? kotlinFiles(path) : entry.name.endsWith('.kt') ? [path] : []
  })
}

/** Le code sans ses commentaires (KDoc compris) : une phrase qui dit « sans `android.net.Uri` » ne compte pas. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
}

const coreFiles = kotlinFiles(coreMain)
const appFiles = kotlinFiles(appMain)

describe('le cœur de l’application n’importe rien d’Android', () => {
  // `CoreArchitectureTest` donne des exemples d’imports d’Android : il est le seul fichier que la règle ne lit pas.
  const files = [...coreFiles, ...kotlinFiles(coreTest)].filter((path) => basename(path) !== 'CoreArchitectureTest.kt')

  it('regarde bien les sources du cœur', () => {
    expect(coreFiles.length).toBeGreaterThanOrEqual(15)
    expect(files.length).toBeGreaterThan(coreFiles.length)
  })

  it('n’importe ni ne nomme android.* ou androidx.* dans aucun fichier, tests compris', () => {
    const offenders = files.filter((path) => /\b(android|androidx)\.[a-z]/.test(codeOf(read(path))))

    expect(offenders.map((path) => path.slice(androidDir.length + 1))).toEqual([])
  })

  it('ne lit ni BuildConfig ni R (ce que la construction de l’application génère)', () => {
    const offenders = coreFiles.filter((path) => /\b(BuildConfig|R\.(string|color|drawable|id|layout))\b/.test(codeOf(read(path))))

    expect(offenders.map((path) => path.slice(androidDir.length + 1))).toEqual([])
  })
})

describe('la tuyauterie Gradle', () => {
  const settings = codeOf(read(join(androidDir, 'settings.gradle.kts')))
  const core = codeOf(read(join(androidDir, 'core', 'build.gradle.kts')))
  const app = codeOf(read(join(androidDir, 'app', 'build.gradle.kts')))

  it('compte le cœur parmi les modules', () => {
    expect(settings).toMatch(/include\(":app", ":core"\)/)
  })

  it('fait du cœur un module Kotlin sans le plugin Android ni bibliothèque Android', () => {
    expect(core).toContain('id("org.jetbrains.kotlin.jvm")')
    for (const forbidden of ['com.android', 'org.jetbrains.kotlin.android', 'androidx', 'project(":app")']) {
      expect(core).not.toContain(forbidden)
    }
  })

  it('fait dépendre l’application du cœur, jamais le contraire', () => {
    expect(app).toContain('implementation(project(":core"))')
  })
})

describe('les services de plateforme', () => {
  it('sont des interfaces du cœur, que l’application implémente', () => {
    expect(codeOf(read(join(coreMain, 'eu/kantin/repas/drive/IdentityProvider.kt')))).toMatch(/interface IdentityProvider/)
    expect(codeOf(read(join(coreMain, 'eu/kantin/repas/drive/LinkOpener.kt')))).toMatch(/interface LinkOpener/)
    expect(codeOf(read(join(appMain, 'eu/kantin/repas/drive/AndroidServices.kt')))).toMatch(/class AndroidLinkOpener\([^)]*\) : LinkOpener/)
  })
})

describe('android/ARCHITECTURE.md', () => {
  const doc = read(join(androidDir, 'ARCHITECTURE.md'))
  const appHeading = doc.indexOf("L'application : ")
  const coreSection = doc.slice(doc.indexOf('## Où est quoi'), appHeading)
  const appSection = doc.slice(appHeading, doc.indexOf('Les tests suivent'))

  it('sépare bien le cœur de l’application', () => {
    expect(coreSection.length).toBeGreaterThan(500)
    expect(appSection.length).toBeGreaterThan(300)
  })

  it('nomme chaque fichier Kotlin du cœur dans la partie du cœur', () => {
    const missing = coreFiles.map((path) => basename(path)).filter((name) => !coreSection.includes(`\`${name}\``))

    expect(missing).toEqual([])
  })

  it('nomme chaque fichier Kotlin de l’application dans la partie de l’application', () => {
    const missing = appFiles.map((path) => basename(path)).filter((name) => !appSection.includes(`\`${name}\``))

    expect(missing).toEqual([])
  })

  it('garde la règle d’or et la section que CoreArchitectureTest cite', () => {
    expect(doc).toContain("Le cœur n'importe rien d'Android")
    expect(doc).toContain('## Ce que Kotlin Multiplatform demandera')
    expect(read(join(coreTest, 'eu/kantin/repas/drive/CoreArchitectureTest.kt'))).toContain('Ce que Kotlin Multiplatform demandera')
  })
})
