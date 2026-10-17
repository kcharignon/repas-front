// @vitest-environment node
// Les règles de code de l'agent (DRV-301), éprouvées par ESLint lui-même sur du code qui les enfreint : l'agent tourne dans la page
// d'une enseigne, avec les droits de l'utilisateur. Pas de code distant, pas de HTML injecté, pas de requête hors de la page, pas de
// dépendance d'exécution.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({ cwd: repo })
}, 60_000)

/** Les règles enfreintes par un code, vues comme le ferait `eslint` sur ce fichier du dépôt. */
async function violations(code: string, file = 'drive-agent/src/probe.ts') {
  const [result] = await eslint.lintText(code, { filePath: resolve(repo, file) })
  return (result?.messages ?? []).map((message) => ({
    rule: message.ruleId,
    text: message.message,
  }))
}

const forbidden: [string, string, string][] = [
  ['eval', 'eval("1 + 1")', 'no-eval'],
  ['window.eval', 'window.eval("1 + 1")', 'no-eval'],
  ['new Function', 'const make = new Function("return 1"); make()', 'no-new-func'],
  ['Function sans new', 'const make = Function("return 1"); make()', 'no-new-func'],
  ['setTimeout avec une chaîne', 'setTimeout("run()", 10)', 'no-implied-eval'],
  ['une adresse javascript:', 'const link = "javascript:void(0)"; link.length', 'no-script-url'],
  ['innerHTML (écriture)', 'document.body.innerHTML = "<b>x</b>"', 'no-restricted-syntax'],
  [
    'innerHTML (lecture)',
    'const html = document.body.innerHTML; html.length',
    'no-restricted-syntax',
  ],
  ['innerHTML (crochets)', 'document.body["innerHTML"] = "x"', 'no-restricted-syntax'],
  ['outerHTML', 'document.body.outerHTML = "x"', 'no-restricted-syntax'],
  [
    'insertAdjacentHTML',
    'document.body.insertAdjacentHTML("beforeend", "<b>x</b>")',
    'no-restricted-syntax',
  ],
  ['document.write', 'document.write("<b>x</b>")', 'no-restricted-syntax'],
  ['une balise script', 'document.createElement("script")', 'no-restricted-syntax'],
  ['un import dynamique', 'void import("./autre")', 'no-restricted-syntax'],
  ['sendBeacon', 'navigator.sendBeacon("/suivi", "x")', 'no-restricted-syntax'],
  [
    'fetch vers un autre site (https)',
    'void fetch("https://exemple.invalid/api")',
    'no-restricted-syntax',
  ],
  [
    'fetch vers un autre site (http)',
    'void fetch("HTTP://exemple.invalid/api")',
    'no-restricted-syntax',
  ],
  [
    'fetch vers un autre site (sans schéma)',
    'void fetch("//exemple.invalid/api")',
    'no-restricted-syntax',
  ],
  [
    'fetch vers un autre site (gabarit)',
    'const id = "1"; void fetch(`https://exemple.invalid/${id}`)',
    'no-restricted-syntax',
  ],
  [
    'window.fetch vers un autre site',
    'void window.fetch("https://exemple.invalid/api")',
    'no-restricted-syntax',
  ],
  [
    'XMLHttpRequest',
    'const request = new XMLHttpRequest(); request.abort()',
    'no-restricted-globals',
  ],
  [
    'WebSocket',
    'const socket = new WebSocket("wss://exemple.invalid"); socket.close()',
    'no-restricted-globals',
  ],
  [
    'EventSource',
    'const source = new EventSource("/flux"); source.close()',
    'no-restricted-globals',
  ],
  ['Worker', 'const worker = new Worker("/w.js"); worker.terminate()', 'no-restricted-globals'],
  [
    'une dépendance',
    'import { ref } from "vue"\nexport const value = ref(0)',
    'no-restricted-imports',
  ],
  [
    'un module de Node',
    'import { readFileSync } from "node:fs"\nexport const read = readFileSync',
    'no-restricted-imports',
  ],
  [
    'un paquet de la portée',
    'import x from "@exemple/paquet"\nexport default x',
    'no-restricted-imports',
  ],
]

describe('ce que l’agent s’interdit', () => {
  it.each(forbidden)('%s', async (_name, code, rule) => {
    const found = await violations(code)

    expect(found.map((item) => item.rule)).toContain(rule)
  })

  it('dit par un message en français ce qu’il faut faire à la place', async () => {
    const [innerHtml, remoteFetch, dependency] = await Promise.all([
      violations('document.body.innerHTML = "x"'),
      violations('void fetch("https://exemple.invalid/api")'),
      violations('import { ref } from "vue"\nexport const value = ref(0)'),
    ])

    expect(innerHtml[0]?.text).toBe(
      'Pas de innerHTML ni outerHTML : afficher avec textContent ou createElement.',
    )
    expect(remoteFetch[0]?.text).toContain('chemin relatif')
    expect(dependency[0]?.text).toContain("Pas de dépendance d'exécution")
  })
})

describe('ce que l’agent permet', () => {
  it('affiche par textContent et createElement', async () => {
    const code = [
      'const note = document.createElement("p")',
      'note.textContent = "Bonjour"',
      'document.body.append(note)',
    ].join('\n')

    expect(await violations(code)).toEqual([])
  })

  it('appelle fetch avec un chemin relatif ou une adresse construite', async () => {
    const code = [
      'void fetch("/magasin/recherche?texte=farine")',
      'void fetch(new URL("/panier", location.href))',
      'void fetch(`/panier/${1}`)',
      'void fetch("./relatif")',
    ].join('\n')

    expect(await violations(code)).toEqual([])
  })

  it('importe un autre fichier de l’agent par un chemin relatif', async () => {
    expect(await violations('import { run } from "./agent"\nexport const start = run')).toEqual([])
    expect(
      await violations('import { run } from "../src/agent"\nexport const start = run'),
    ).toEqual([])
  })

  it('ne s’applique qu’au code de l’agent, pas aux tests', async () => {
    expect(
      await violations('document.body.innerHTML = "<b>x</b>"', 'drive-agent/test/probe.ts'),
    ).toEqual([])
  })
})

describe('le code actuel de l’agent', () => {
  it('respecte toutes les règles', async () => {
    const results = await eslint.lintFiles(['drive-agent/src/**/*.ts'])

    expect(results.length).toBeGreaterThan(0)
    expect(results.flatMap((result) => result.messages)).toEqual([])
  })
})
