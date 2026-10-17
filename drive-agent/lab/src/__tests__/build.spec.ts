// @vitest-environment node
// Le favori construit, tel qu'il sera collé dans le navigateur : un seul fichier, petit, sans rien d'interdit, qui démarre.
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, it } from 'vitest'

import { fromBookmarklet } from '../../bookmarklet'
import { buildLab, type LabBuild } from '../../build'
import { BOOKMARKLET_LIMIT, LAB_NOTICE } from '../config'

let built: LabBuild

beforeAll(async () => {
  built = await buildLab()
}, 60_000)

describe('le favori construit', () => {
  it('porte la mention d’outil jetable en tête', () => {
    expect(built.code.startsWith(`/*! ${LAB_NOTICE} */\n`)).toBe(true)
    expect(fromBookmarklet(built.bookmarklet).startsWith(`/*! ${LAB_NOTICE} */`)).toBe(true)
  })

  it('tient sous la limite de taille et ne contient ni retour à la ligne, ni dièse, ni guillemet double', () => {
    expect(Buffer.byteLength(built.bookmarklet)).toBeLessThan(BOOKMARKLET_LIMIT)
    expect(built.bookmarklet).toMatch(/^javascript:[^\r\n\t#"<>\\]+$/)
  })

  it('est un seul fichier sans import ni chargement de code distant', () => {
    expect(built.code).not.toMatch(/(?:^|[;{}])\s*(?:import|export)\s*[{*\w'"]/)
    expect(built.code).not.toMatch(/\brequire\s*\(|importScripts|import\(/)
    expect(built.code).not.toMatch(/\.src\s*=\s*["'`]https?:/)
  })

  it('ne contient ni eval, ni new Function, ni innerHTML', () => {
    expect(built.code).not.toMatch(/\beval\s*\(/)
    expect(built.code).not.toMatch(/new\s+Function/)
    expect(built.code).not.toMatch(/\bFunction\s*\(/)
    expect(built.code).not.toContain('innerHTML')
    expect(built.code).not.toContain('insertAdjacentHTML')
    expect(built.code).not.toContain('document.write')
  })

  it('ne mentionne qu’une seule adresse extérieure : Repas, pour les essais 7 et 8', () => {
    const hosts = new Set(
      (built.code.match(/https?:\/\/[A-Za-z0-9.-]+/g) ?? []).map((url) => new URL(url).host),
    )

    expect([...hosts]).toEqual(['kantin.eu'])
  })

  it('ne lit les cookies qu’à un seul endroit (la sonde, pour un booléen)', () => {
    expect(built.code.match(/\.cookie\b/g)).toHaveLength(1)
  })

  it('ne stocke rien : ni localStorage, ni sessionStorage, ni IndexedDB', () => {
    expect(built.code).not.toMatch(/localStorage|sessionStorage|indexedDB/)
  })

  it('démarre une fois collé : le menu des 12 essais et du 3b s’affiche, et un second lancement rouvre le même banc', () => {
    // Given : une page de magasin inventée
    const dom = new JSDOM('<!doctype html><html><body><p>Page</p></body></html>', {
      url: 'https://fd9-courses.example/magasin-999111-999111/accueil.aspx',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    })
    const launch = () => {
      const script = dom.window.document.createElement('script')
      script.textContent = fromBookmarklet(built.bookmarklet)
      dom.window.document.body.appendChild(script)
    }

    // When
    launch()
    launch()

    // Then
    const hosts = dom.window.document.querySelectorAll('#repas-lab-host')
    expect(hosts).toHaveLength(1)
    const root = hosts[0]?.shadowRoot
    expect(root?.querySelectorAll('.menu button')).toHaveLength(13)
    expect(root?.textContent).toContain(LAB_NOTICE)
    dom.window.close()
  })
})
