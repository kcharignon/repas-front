// @vitest-environment node
// Le chargeur du banc (DRV-009) : une petite chaîne qui tire le banc depuis jsDelivr et vérifie son empreinte.
// Données SYNTHÉTIQUES : un faux fichier publié, un faux commit, un faux document.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { fromBookmarklet } from '../../bookmarklet'
import { buildLab } from '../../build'
import { buildLoader, integrityOf, publishedUrl } from '../../loader'
import { GITHUB_REPO, LOADER_LIMIT } from '../../published'

const SHA = '0123456789abcdef0123456789abcdef01234567'
const FAKE_LAB =
  '/*! Outil de test jetable, à supprimer après la décision G1 (DRV-005) */\n(()=>{})();\n'

const build = (overrides: Partial<Parameters<typeof buildLoader>[0]> = {}) =>
  buildLoader({ sha: SHA, published: FAKE_LAB, current: FAKE_LAB, ...overrides })

describe('buildLoader', () => {
  it('contient l’adresse jsDelivr figée sur le commit et l’empreinte SHA-384 du fichier publié', () => {
    // When
    const loader = build()

    // Then
    const expected = `sha384-${createHash('sha384').update(FAKE_LAB, 'utf8').digest('base64')}`
    expect(loader.integrity).toBe(expected)
    expect(loader.url).toBe(
      `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${SHA}/drive-agent/lab/published/lab.js`,
    )
    const code = fromBookmarklet(loader.bookmarklet)
    expect(code).toContain(loader.url)
    expect(code).toContain(expected)
    expect(code).not.toContain('@main')
  })

  it('donne une chaîne javascript: courte, sans pourcentage, dièse, guillemet double ni retour à la ligne', () => {
    const { bookmarklet } = build()

    expect(bookmarklet.startsWith('javascript:')).toBe(true)
    expect(bookmarklet.endsWith(';void 0')).toBe(true)
    expect(bookmarklet.length).toBeLessThanOrEqual(LOADER_LIMIT)
    expect(bookmarklet).toMatch(/^javascript:[\x20-\x7e]+$/)
    expect(bookmarklet).not.toMatch(/[%#"\\<>\r\n\t]/)
    // La chaîne se décode en elle-même : rien n'a été échappé.
    expect(fromBookmarklet(bookmarklet)).toBe(bookmarklet.slice('javascript:'.length))
  })

  it('met le commit en minuscules', () => {
    expect(build({ sha: SHA.toUpperCase() }).url).toContain(`@${SHA}/`)
  })

  it.each([
    ['vide', ''],
    ['trop court', 'abc123'],
    ['39 caractères', SHA.slice(1)],
    ['41 caractères', `${SHA}0`],
    ['pas hexadécimal', `${SHA.slice(0, 39)}g`],
    ['une branche', 'main'],
  ])('refuse un commit invalide : %s', (_name, sha) => {
    expect(() => build({ sha })).toThrow('40 caractères hexadécimaux')
  })

  it('refuse un fichier publié qui n’est plus celui du banc actuel', () => {
    expect(() => build({ published: `${FAKE_LAB}// ancien` })).toThrow(
      'reconstruire et republier (make lab-publish)',
    )
  })
})

describe('le chargeur exécuté', () => {
  interface FakeScript {
    tagName: string
    src?: string
    integrity?: string
    crossOrigin?: string
    onerror?: () => void
  }

  /** Un faux document : il garde les éléments créés et ceux qu'on lui ajoute. */
  function run(options: { head: boolean } = { head: true }) {
    const appended: { parent: string; element: FakeScript }[] = []
    const alert = vi.fn<(message: string) => void>()
    const document = {
      createElement: (tagName: string): FakeScript => ({ tagName }),
      head: options.head
        ? { appendChild: (element: FakeScript) => appended.push({ parent: 'head', element }) }
        : null,
      documentElement: {
        appendChild: (element: FakeScript) => appended.push({ parent: 'html', element }),
      },
    }
    const loader = build()
    runInNewContext(fromBookmarklet(loader.bookmarklet), { document, alert })
    return { appended, alert, loader }
  }

  it('ajoute un script avec l’adresse, l’empreinte et crossOrigin', () => {
    const { appended, loader } = run()

    expect(appended).toHaveLength(1)
    expect(appended[0]?.parent).toBe('head')
    expect(appended[0]?.element).toMatchObject({
      tagName: 'script',
      src: loader.url,
      integrity: loader.integrity,
      crossOrigin: 'anonymous',
    })
  })

  it('se rabat sur l’élément racine quand la page n’a pas de head', () => {
    expect(run({ head: false }).appended[0]?.parent).toBe('html')
  })

  it('dit pourquoi rien ne s’affiche quand le chargement échoue, sans rien alerter avant', () => {
    const { appended, alert } = run()
    expect(alert).not.toHaveBeenCalled()

    appended[0]?.element.onerror?.()

    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert).toHaveBeenCalledWith(
      "Banc d'essai : chargement impossible (réseau, empreinte ou adresse).",
    )
  })
})

describe('le banc publié', () => {
  let built: Awaited<ReturnType<typeof buildLab>>

  beforeAll(async () => {
    built = await buildLab()
  }, 60_000)

  it('est à jour : published/lab.js est ce que make lab produit maintenant', () => {
    const published = readFileSync(
      fileURLToPath(new URL('../../published/lab.js', import.meta.url)),
      'utf8',
    )

    expect(
      published === built.code,
      'published/lab.js est périmé : lancer make lab-publish, puis commiter le fichier',
    ).toBe(true)
  })

  it('donne un chargeur de moins de 1 500 caractères pour ce fichier, avec son empreinte', () => {
    const loader = buildLoader({ sha: SHA, published: built.code, current: built.code })

    expect(loader.bookmarklet.length).toBeLessThanOrEqual(LOADER_LIMIT)
    expect(loader.integrity).toBe(integrityOf(built.code))
    expect(publishedUrl(SHA)).toBe(loader.url)
  })
})
