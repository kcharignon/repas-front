import { readFileSync, readdirSync, statSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SEASONS } from '../../season'
import { FREE_PIECES, PACKS, SLOTS, loadPiece, pieceNames } from '../art'

// ADR 0012 : la table « emplacement → pièce » de chaque saison et les fichiers d'illustration doivent rester d'accord.

const dir = (season: string) => `src/design/season/art/${season}`

describe('les illustrations de saison', () => {
  for (const season of SEASONS) {
    describe(`${season}`, () => {
      const files = readdirSync(dir(season)).filter((name) => name.endsWith('.svg'))
      const names = files.map((name) => name.slice(0, -'.svg'.length))

      it('remplit exactement les mêmes emplacements que les autres saisons', () => {
        expect(Object.keys(PACKS[season]).sort()).toEqual([...SLOTS].sort())
      })

      it('chaque pièce citée par la table existe en fichier', () => {
        const missing = Object.entries(PACKS[season])
          .filter(([, piece]) => !names.includes(piece))
          .map(([slot, piece]) => `${slot} → ${piece}`)

        expect(missing).toEqual([])
      })

      it('chaque fichier est cité par la table ou laissé libre exprès', () => {
        const used = new Set(Object.values(PACKS[season]))
        const orphans = names.filter(
          (name) => !used.has(name) && !FREE_PIECES[season].includes(name),
        )

        expect(orphans).toEqual([])
      })

      it('le chargeur connaît les mêmes fichiers que le dossier', () => {
        expect(pieceNames(season).sort()).toEqual([...names].sort())
      })

      it('un emplacement ne cite jamais la même pièce que deux emplacements d’un même écran', () => {
        const pack = PACKS[season]
        // Les paires d'emplacements qui se retrouvent sur le même écran (ADR 0012 § emplacements).
        const together = [
          ['title-list', 'empty-list'],
          ['title-recipes', 'empty-recipes'],
          ['title-recipes', 'empty-search'],
          ['title-aisles', 'empty-search'],
          ['title-account', 'offline'],
          ['title-list', 'offline'],
          ['title-recipes', 'offline'],
          ['title-aisles', 'offline'],
          ['title-list', 'error'],
          ['title-recipes', 'error'],
          ['title-aisles', 'error'],
          ['corner', 'scene'],
          ['corner', 'aside'],
          ['scene', 'aside'],
          ['aside', 'title-list'],
          ['aside', 'title-recipes'],
          ['aside', 'title-aisles'],
          ['aside', 'title-account'],
          ['aside', 'empty-list'],
          ['aside', 'empty-recipes'],
          ['aside', 'empty-search'],
          ['aside', 'offline'],
          ['aside', 'error'],
          ['aside', 'recipe-placeholder'],
        ] as const
        const same = together
          .filter(([a, b]) => pack[a] === pack[b])
          .map(([a, b]) => `${a} et ${b}`)

        expect(same).toEqual([])
      })

      it('pèse peu : une pièce sous 3 Ko, un héros sous 6 Ko, une scène sous 8 Ko', () => {
        const limits = (name: string) =>
          name === PACKS[season].scene ? 8000 : name === PACKS[season].hero ? 6000 : 3000
        const heavy = names.filter(
          (name) => statSync(`${dir(season)}/${name}.svg`).size >= limits(name),
        )

        expect(heavy).toEqual([])
      })

      it('respecte le style : aplats, aucun id, aucun texte, aucun script, aucune image', () => {
        const offenders = names.filter((name) => {
          const svg = readFileSync(`${dir(season)}/${name}.svg`, 'utf8')

          return (
            /\sid=|<text|<script|<style|<image|<foreignObject|Gradient/.test(svg) ||
            /\son[a-z]+=/i.test(svg)
          )
        })

        expect(offenders).toEqual([])
      })
    })
  }

  it('une pièce chargée est décorative : cachée des lecteurs d’écran, sans titre', async () => {
    const svg = await loadPiece('halloween', 'empty-list')

    expect(svg).toMatch(/^<svg aria-hidden="true" focusable="false" /)
    expect(svg).not.toContain('<title')
  })

  it('un emplacement inconnu ne charge rien', async () => {
    expect(await loadPiece('halloween', 'nimporte-quoi')).toBeNull()
  })
})
