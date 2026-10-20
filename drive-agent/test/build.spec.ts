// @vitest-environment node
// La chaîne de construction de l'agent : un seul fichier, IIFE, minifié, sans dépendance ni code distant, reproductible, avec sa
// version et son empreinte SHA-384. Le vrai agent n'a presque rien à faire encore (DRV-301) : la forme du fichier est aussi éprouvée sur
// un point d'entrée d'essai qui n'est pas vide.
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildAgent, DEFAULT_MAX_BYTES, digestOf, writeBuild } from '../scripts/build.mjs'
import { AGENT_VERSION } from '../src/version'

const SAMPLE = 'test/entries/sample.ts'

type Built = Awaited<ReturnType<typeof buildAgent>>
let agent: Built
let sample: Built
const folders: string[] = []

beforeAll(async () => {
  ;[agent, sample] = await Promise.all([buildAgent(), buildAgent({ entry: SAMPLE })])
}, 60_000)

afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

describe('la version et l’empreinte', () => {
  it('la version est un semver', () => {
    expect(AGENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('l’en-tête de agent.js porte la version', () => {
    expect(agent.code.startsWith(`/*! Repas Drive agent ${AGENT_VERSION} */\n`)).toBe(true)
  })

  it('le manifeste donne la version, la taille et l’empreinte SHA-384 du fichier', () => {
    const expected = createHash('sha384').update(agent.code).digest('base64')

    expect(agent.manifest).toEqual({
      version: AGENT_VERSION,
      bytes: Buffer.byteLength(agent.code),
      sha384: `sha384-${expected}`,
    })
    expect(agent.manifest.sha384).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/)
  })

  it('calcule un SHA-384 en base64 (vecteur de test officiel de « abc »)', () => {
    expect(digestOf('abc')).toBe(
      'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn',
    )
  })

  it('le fichier se termine par un seul retour à la ligne', () => {
    expect(agent.code).toMatch(/[^\n]\n$/)
  })
})

describe('la reproductibilité', () => {
  it('deux constructions successives de l’agent donnent le même fichier et la même empreinte', async () => {
    const again = await buildAgent()

    expect(again.code).toBe(agent.code)
    expect(again.manifest).toEqual(agent.manifest)
  })

  it('deux constructions successives d’un code non vide donnent la même empreinte', async () => {
    const again = await buildAgent({ entry: SAMPLE })

    expect(sample.code.length).toBeGreaterThan(100)
    expect(again.manifest.sha384).toBe(sample.manifest.sha384)
  })

  it('le fichier ne contient ni date, ni chemin absolu, ni trace de la machine', () => {
    for (const { code } of [agent, sample]) {
      expect(code).not.toContain(process.cwd())
      expect(code).not.toContain(tmpdir())
      expect(code).not.toMatch(/node_modules|file:\/\/|\/home\/|\/Users\/|\/app\/|[A-Za-z]:\\/)
      expect(code).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })
})

describe('un seul fichier, sans dépendance ni code distant', () => {
  it('n’a ni import, ni export, ni require, ni chargement dynamique', () => {
    for (const { code } of [agent, sample]) {
      expect(code).not.toMatch(/(?:^|[;{}\n])\s*(?:import|export)\s*[{*\w'"]/)
      expect(code).not.toMatch(/\brequire\s*\(|importScripts|\bimport\s*\(/)
    }
  })

  it('n’a ni eval, ni new Function, ni HTML injecté, ni réseau hors de la page', () => {
    for (const { code } of [agent, sample]) {
      expect(code).not.toMatch(/\beval\s*\(|new\s+Function|\bFunction\s*\(/)
      expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/)
      // L'en-tête `X-Requested-With: XMLHttpRequest` du panier de l'enseigne (DRV-303) est un texte, pas l'API XMLHttpRequest.
      const withoutHeader = code.replace(/"X-Requested-With":`XMLHttpRequest`/g, '')
      expect(withoutHeader).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/)
      // Aucune adresse absolue, sauf l'adresse de base du magasin bâtie sur l'hôte de la page (`https://${hôte}`, DRV-303) et la base
      // fictive qui sert à analyser un chemin.
      const withoutPageHost = code
        .replace(/https:\/\/\$\{[^}]*\}/g, '')
        .replace('https://x.invalid', '')
      expect(withoutPageHost).not.toMatch(/https?:\/\//)
    }
  })

  it('est une fonction appelée sur-le-champ, minifiée, qui ne laisse aucune variable globale', () => {
    expect(sample.code).toMatch(/^\/\*![^\n]*\*\/\n\(\s*(?:function|\(\)\s*=>|async)/)
    // Les noms sont raccourcis et le code tient sur peu de lignes.
    expect(sample.code).not.toContain('greet')
    expect(sample.code.trim().split('\n').length).toBeLessThanOrEqual(3)

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
    })
    const before = Object.getOwnPropertyNames(dom.window)
    dom.window.eval(sample.code)

    expect(Object.getOwnPropertyNames(dom.window)).toEqual(before)
    expect(dom.window.document.body.textContent).toBe('Bonjour test')
  })

  it('le vrai agent, exécuté dans une page, ne change rien : ni élément, ni variable globale', () => {
    const dom = new JSDOM('<!doctype html><html><body><p>Page</p></body></html>', {
      runScripts: 'outside-only',
    })
    const before = dom.serialize()
    const names = Object.getOwnPropertyNames(dom.window)

    dom.window.eval(agent.code)

    expect(dom.serialize()).toBe(before)
    expect(Object.getOwnPropertyNames(dom.window)).toEqual(names)
  })
})

describe('le vrai agent construit, avec un plan', () => {
  it('affiche son interface fermée à la page quand l’application envoie un plan, sans variable globale ni requête', async () => {
    // Given : une page de magasin inventée, et le pont de l'application
    const dom = new JSDOM('<!doctype html><html><body><p>Page</p></body></html>', {
      runScripts: 'outside-only',
      url: 'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/recherche.aspx',
    })
    let receive: (event: { data: unknown }) => void = () => undefined
    const sent: string[] = []
    Object.assign(dom.window, {
      repasHost: {
        postMessage: (text: string) => sent.push(text),
        addEventListener: (_type: string, listener: typeof receive) => (receive = listener),
      },
    })
    // Le site ne répond jamais : le passage reste en cours, son interface reste affichée.
    Object.assign(dom.window, { fetch: () => new Promise(() => undefined) })
    const names = Object.getOwnPropertyNames(dom.window)
    dom.window.eval(agent.code)
    expect(dom.window.document.documentElement.children).toHaveLength(2)

    // When
    receive({
      data: JSON.stringify({
        v: 1,
        type: 'plan',
        runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c',
        retailer: 'leclerc',
        store: { id: '000123', host: 'fd0-courses.leclercdrive.fr' },
        returnPath: '/drive/retour',
        lines: [
          {
            ingredientSlug: 'sel',
            name: 'Sel',
            status: 'KNOWN',
            products: [{ id: '1000001', label: 'Sel fin', packs: 1, packsStatus: 'COMPUTED' }],
            rejected: [],
            searchQuery: 'sel',
          },
        ],
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Then : un conteneur de plus, que la page ne peut pas lire, et rien d'envoyé avant la fin du passage
    const host = dom.window.document.documentElement.lastElementChild as HTMLElement
    expect(host.tagName).toBe('DIV')
    expect(host.shadowRoot).toBeNull()
    expect(host.textContent).toBe('')
    expect(sent).toEqual([])
    expect(Object.getOwnPropertyNames(dom.window)).toEqual(names)
  })
})

describe('le budget de taille', () => {
  it('refuse un fichier qui dépasse le budget', async () => {
    await expect(buildAgent({ maxBytes: 8 })).rejects.toThrow(/au-delà du budget de 8 octets/)
  })

  it('le budget par défaut est large pour un agent et se vérifie à la construction', () => {
    expect(agent.manifest.bytes).toBeLessThanOrEqual(DEFAULT_MAX_BYTES)
    expect(DEFAULT_MAX_BYTES).toBe(256_000)
  })
})

describe('les fichiers écrits', () => {
  it('agent.js et manifest.json sont écrits tels quels dans le dossier demandé', () => {
    const folder = mkdtempSync(join(tmpdir(), 'agent-'))
    folders.push(folder)

    const written = writeBuild(agent, folder)

    expect(readFileSync(written.agent, 'utf8')).toBe(agent.code)
    const manifestText = readFileSync(written.manifest, 'utf8')
    expect(manifestText.endsWith('}\n')).toBe(true)
    expect(JSON.parse(manifestText)).toEqual(agent.manifest)
    expect(digestOf(readFileSync(written.agent))).toBe(agent.manifest.sha384)
  })
})
