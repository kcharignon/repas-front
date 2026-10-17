// @vitest-environment node
// L'agent embarqué dans l'application Android (DRV-313) : le fichier d'empreinte attendue, le manifeste de la construction et ce que
// Kotlin recopie doivent dire la même chose. Si l'agent change, la CI le dit ici avant la construction de l'APK. Remède :
// `make android-agent-hash`.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { validateCommand, validatePlan } from '../../drive-agent/protocol'
import { buildAgent, digestOf, writeBuild } from '../../drive-agent/scripts/build.mjs'
import { expectedDigest } from '../agent-digest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const KOTLIN = join(androidDir, 'app/src/main/kotlin/eu/kantin/repas/drive')
const INJECTION = readFileSync(join(androidDir, 'app/src/main/assets/injection.js'), 'utf8')
const read = (path: string) => readFileSync(join(androidDir, path), 'utf8')

type Built = Awaited<ReturnType<typeof buildAgent>>
let built: Built
const folders: string[] = []

beforeAll(async () => {
  built = await buildAgent()
}, 60_000)

afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

describe('l’empreinte de l’agent embarqué', () => {
  it('a le format de l’attribut integrity, sur une ligne', () => {
    expect(expectedDigest()).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/)
    expect(read('agent.js.sha384')).toMatch(/^sha384-[A-Za-z0-9+/]{64}\n$/)
  })

  it('est celle de l’agent que construit le code actuel', () => {
    expect(
      expectedDigest(),
      'l’agent a changé : lancer make android-agent-hash, relire, commiter agent.js.sha384 et le dire dans la PR',
    ).toBe(built.manifest.sha384)
  })

  it('concorde avec manifest.json et avec agent.js tels que make agent-build les écrit', () => {
    // Given
    const folder = mkdtempSync(join(tmpdir(), 'repas-agent-'))
    folders.push(folder)

    // When
    const written = writeBuild(built, folder)

    // Then : l'actif de l'application (agent.js), son manifeste et l'empreinte attendue disent la même chose
    const manifest = JSON.parse(readFileSync(written.manifest, 'utf8')) as Built['manifest']
    expect(digestOf(readFileSync(written.agent))).toBe(expectedDigest())
    expect(manifest.sha384).toBe(expectedDigest())
    expect(manifest.bytes).toBe(readFileSync(written.agent).length)
  })

  it('porte la version de l’agent dans sa première ligne, que l’application affiche', () => {
    expect(built.code.split('\n')[0]).toBe(`/*! Repas Drive agent ${built.manifest.version} */`)
  })
})

describe('le script injecté dans les pages', () => {
  const PLACEHOLDER = '/*__AGENT__*/'

  it('contient le marqueur de l’agent une seule fois, et Kotlin cherche le même', () => {
    expect(INJECTION.split(PLACEHOLDER)).toHaveLength(2)
    expect(read('app/src/main/kotlin/eu/kantin/repas/drive/AgentAsset.kt')).toContain(
      `PLACEHOLDER = "${PLACEHOLDER}"`,
    )
  })

  it('est de la JavaScript valide une fois l’agent réel en place', () => {
    const script = INJECTION.replace(PLACEHOLDER, () => built.code)

    expect(() => new Function(script)).not.toThrow()
  })

  it('annonce la page à l’application par le message hello que Kotlin reconnaît', () => {
    expect(INJECTION).toContain(`'{"v":1,"type":"hello"}'`)
  })

  it('ne touche à aucun objet natif de l’application autre que repasHost', () => {
    expect(INJECTION).not.toMatch(/addJavascriptInterface|Android\b|\beval\(|new Function/)
  })
})

describe('les messages que l’application envoie à l’agent suivent le protocole v1', () => {
  it('la commande de diagnostic écrite en Kotlin est l’exemple valide du protocole', () => {
    const kotlin = /COMMAND_DIAGNOSTIC = """(.*)"""/.exec(
      readFileSync(join(KOTLIN, 'BridgeMessages.kt'), 'utf8'),
    )?.[1]
    const example = JSON.parse(
      readFileSync(
        join(androidDir, '../drive-agent/protocol/examples/valid/command-diagnostic.json'),
        'utf8',
      ),
    ) as unknown

    expect(JSON.parse(kotlin ?? 'null')).toEqual(example)
    expect(validateCommand(JSON.parse(kotlin ?? 'null'))).toEqual(example)
  })

  it('le message setup de l’essai (fichier de référence du test Kotlin) est un setup valide', () => {
    const setup = JSON.parse(read('app/src/test/resources/setup-message.json')) as unknown

    expect(validatePlan(setup)).toMatchObject({ type: 'setup' })
  })
})
