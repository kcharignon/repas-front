// @vitest-environment node
// Le dépôt est public : aucun vrai numéro de magasin, aucune adresse de messagerie d'un particulier (revue de sécurité du drive).
// Les valeurs factices du chantier sont listées ici ; un nouveau numéro doit y entrer en connaissance de cause.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.gradle',
  '.kotlin',
  'coverage',
  'test-results',
  'playwright-report',
])
const TEXT_FILE = /\.(ts|vue|kt|kts|md|json|xml|yml|yaml|html|sh|js|mjs|py|txt)$/
/**
 * La copie du contrat OpenAPI du back (`api/contract.json` en fige le commit) et les types qui en sont tirés portent un exemple du back : il se corrige au back, puis
 * `npm run api:update`. Les exemples du back recopiés tels quels (`fixtures/contract`) suivent la même règle.
 */
const COPIES_OF_THE_BACK = new Set(['api/openapi.json', 'src/api/schema.d.ts'])

/** Les numéros de magasin inventés du chantier (et les formes volontairement fausses des tests d'adresse). */
const FICTIONAL_STORES = new Set([
  '000000',
  '000001',
  '000002',
  '000042',
  '000123',
  '000456',
  '001234',
  '005678',
  '123456',
  '654321',
  '999000',
  '999111',
  '1234567890123',
])

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : files(path)
    return TEXT_FILE.test(entry.name) && entry.name !== 'package-lock.json' ? [path] : []
  })
}

const sources = files(root)
  .map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }))
  .filter(({ path }) => !path.endsWith('fictionalData.spec.ts'))

describe('les données du dépôt public sont inventées', () => {
  it('ne contient que des numéros de magasin factices', () => {
    const real = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/magasin-(\d{4,})(?:-(\d{4,}))?/g)]
        .flatMap((found) => [found[1], found[2]])
        .filter((id): id is string => id !== undefined && !FICTIONAL_STORES.has(id))
        .map((id) => `${path} : ${id}`),
    )

    expect([...new Set(real)]).toEqual([])
  })

  it("ne contient aucune adresse d'un fournisseur de messagerie grand public", () => {
    const addresses = sources
      .filter(({ path }) => !COPIES_OF_THE_BACK.has(path))
      .flatMap(({ path, text }) =>
        [
          ...text.matchAll(
            /[\w.+-]+@(?:gmail|googlemail|hotmail|outlook|live|yahoo|icloud|orange|free|laposte|sfr|wanadoo)\.[a-z.]+/gi,
          ),
        ].map((found) => `${path} : ${found[0].replace(/^[^@]*/, '…')}`),
      )

    expect(addresses).toEqual([])
  })
})
