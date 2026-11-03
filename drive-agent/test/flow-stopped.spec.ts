// DRV-769 : un envoi ARRÊTÉ rapporte à Repas ce qu'il a déjà fait. Sans cela Repas n'apprend aucun choix, ne coche aucun article « au panier » (DRV-745) et le passage
// suivant remet les mêmes articles au panier. Chaque chemin d'arrêt de l'orchestrateur est tracé ici : ceux qui gardaient déjà le travail (erreur de l'adaptateur,
// arrêt de la personne, blocage) et ceux qui le perdaient (incident imprévu en plein passage, incident à la fin, erreur avant tout travail alors qu'un état de reprise existe).
// Données synthétiques seulement.
import { describe, expect, it } from 'vitest'

import { validateProgress, type ResultLine } from '../protocol'
import { RetailerError } from '../src/retailers'
import { emptyState, RunStore, type PhaseB } from '../src/flow'
import {
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  fresh,
  known,
  makeFlow,
  plan,
  product,
  RUN_ID,
} from './flow-helpers'

/** Une phase B qui choisit un produit pour les `count` premières lignes en attente, puis lève `then` (ou rend la main). */
function choosing(count: number, then?: Error | 'cancelled'): PhaseB {
  return (context) => {
    for (const { line } of context.pending.slice(0, count)) {
      context.record({
        ingredientSlug: line.ingredientSlug,
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: `99000${line.ingredientSlug.length}`, label: `Produit ${line.name}` },
      })
    }
    if (then instanceof Error) return Promise.reject(then)
    return Promise.resolve(then ?? 'done')
  }
}

const outcomes = (lines: readonly ResultLine[]) =>
  lines.map((line) => `${line.ingredientSlug}:${line.outcome}`)

describe('un envoi arrêté rapporte ce qu’il a déjà fait (DRV-769)', () => {
  describe('les arrêts qui gardaient déjà le travail', () => {
    it('une erreur de l’adaptateur en phase A, après deux lignes : le résultat porte les deux', async () => {
      const { adapter } = fakeAdapter(
        { '1000001': {}, '1000002': {}, '1000003': {} },
        {
          before: (call) => {
            if (call === 'search 1000003') throw new RetailerError('CONTRACT_CHANGED')
          },
        },
      )
      const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

      await flow.start(
        plan([
          known('farine', [product('1000001')]),
          known('sucre', [product('1000002')]),
          known('lait', [product('1000003')]),
        ]),
      )

      const result = expectConform(sent[0])
      expect(result.outcome).toBe('error')
      expect(outcomes(result.lines)).toEqual(['farine:ADDED', 'sucre:ADDED', 'lait:FAILED'])
    })

    it('une erreur en phase B, après trois produits choisis : les trois choix sont rapportés, la quatrième ligne reste indisponible', async () => {
      const { flow, sent } = makeFlow({
        ui: fakeUi().ui,
        adapter: fakeAdapter().adapter,
        phaseB: choosing(3, new RetailerError('CONTRACT_CHANGED')),
      })

      await flow.start(plan([fresh('poivre'), fresh('curry'), fresh('sel'), fresh('huile')]))

      const result = expectConform(sent[0])
      expect(result).toMatchObject({ outcome: 'error', error: { code: 'CONTRACT_CHANGED' } })
      expect(outcomes(result.lines)).toEqual([
        'poivre:CHOSEN',
        'curry:CHOSEN',
        'sel:CHOSEN',
        'huile:UNAVAILABLE',
      ])
    })

    it('l’arrêt de la personne en phase B : les choix déjà faits sont rapportés (aborted)', async () => {
      const { flow, sent } = makeFlow({
        ui: fakeUi().ui,
        adapter: fakeAdapter().adapter,
        phaseB: choosing(2, 'cancelled'),
      })

      await flow.start(plan([fresh('poivre'), fresh('curry'), fresh('sel')]))

      const result = expectConform(sent[0])
      expect(result.outcome).toBe('aborted')
      expect(outcomes(result.lines)).toEqual(['poivre:CHOSEN', 'curry:CHOSEN', 'sel:UNAVAILABLE'])
    })

    it('le blocage de l’enseigne : les lignes déjà ajoutées sont rapportées (partial)', async () => {
      const { adapter } = fakeAdapter(
        { '1000001': {}, '1000002': {} },
        {
          before: (call) => {
            if (call === 'search 1000002') throw new RetailerError('BLOCKED')
          },
        },
      )
      const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

      await flow.start(
        plan([known('farine', [product('1000001')]), known('sucre', [product('1000002')])]),
      )

      const result = expectConform(sent[0])
      expect(result.outcome).toBe('partial')
      expect(outcomes(result.lines)).toEqual(['farine:ADDED', 'sucre:FAILED'])
    })
  })

  describe('les arrêts qui perdaient le travail', () => {
    it('un incident imprévu de l’agent en plein passage (hors de l’adaptateur) : le résultat rapporte les lignes déjà faites', async () => {
      const screens = fakeUi({ error: () => 'return' })
      const real = screens.ui.update
      screens.ui.update = (patch) => {
        if (patch.current === 'Lait') throw new TypeError('incident imprévu')
        real(patch)
      }
      const storage = fakeStorage()
      const { adapter } = fakeAdapter({ '1000001': {}, '1000002': {}, '1000003': {} })
      const { flow, sent } = makeFlow({ ui: screens.ui, adapter, storage })

      await flow.start(
        plan([
          known('farine', [product('1000001')]),
          known('sucre', [product('1000002')]),
          known('lait', [product('1000003')]),
        ]),
      )

      expect(sent).toHaveLength(1)
      const result = expectConform(sent[0])
      expect(result).toMatchObject({
        outcome: 'error',
        error: { code: 'CONTRACT_CHANGED', message: expect.stringContaining('EXCEPTION') },
      })
      expect(outcomes(result.lines)).toEqual(['farine:ADDED', 'sucre:ADDED'])
      // L'écran d'erreur propose de revenir à Repas, comme pour les autres erreurs
      expect(screens.propsOf('error')).toEqual([
        { code: 'CONTRACT_CHANGED', canReturn: true, cause: 'EXCEPTION' },
      ])
    })

    it('un incident imprévu à la FIN du passage (l’écran de fin ne se dessine pas) : le résultat rapporte tout ce qui a été fait', async () => {
      const screens = fakeUi({
        end: () => {
          throw new TypeError('écran impossible')
        },
        error: () => 'return',
      })
      const { adapter } = fakeAdapter({ '1000001': {} })
      const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

      await flow.start(plan([known('farine', [product('1000001')]), fresh('poivre')]))

      expect(sent).toHaveLength(1)
      const result = expectConform(sent[0])
      expect(result.outcome).toBe('error')
      expect(outcomes(result.lines)).toEqual(['farine:ADDED', 'poivre:UNAVAILABLE'])
    })

    it('une erreur AVANT tout travail alors qu’un état de reprise existe : le résultat rapporte les lignes de l’état', async () => {
      const storage = fakeStorage()
      const saved = emptyState(RUN_ID, 1)
      saved.done.farine = {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '1000001',
        quantity: 1,
        usedRank: 1,
      }
      new RunStore(storage).save(saved)
      const screens = fakeUi({ error: () => 'return' })
      // Un plan d'une autre enseigne que celle de la page : refusé avant toute lecture
      const { flow, sent } = makeFlow({ ui: screens.ui, storage, retailer: 'auchan' })

      await flow.start(
        plan([known('farine', [product('1000001')]), known('sucre', [product('1000002')])]),
      )

      const result = expectConform(sent[0])
      expect(result).toMatchObject({ outcome: 'error', error: { code: 'STORE_MISMATCH' } })
      expect(outcomes(result.lines)).toEqual(['farine:ADDED'])
    })
  })

  describe('où en est le passage, pour l’application (progress)', () => {
    it('à chaque ligne faite, les lignes déjà faites partent vers l’application, dans l’ordre du plan ; un canal qui plante ne gêne pas le passage', async () => {
      const seen: string[][] = []
      let calls = 0
      const { adapter } = fakeAdapter({ '1000001': {}, '1000002': {} })
      const { flow, sent } = makeFlow({
        ui: fakeUi().ui,
        adapter,
        progress: (message) => {
          validateProgress(JSON.parse(JSON.stringify(message)))
          seen.push(outcomes(message.lines))
          calls += 1
          if (calls === 1) throw new TypeError('canal fermé')
        },
      })

      await flow.start(
        plan([known('farine', [product('1000001')]), known('sucre', [product('1000002')])]),
      )

      expect(seen).toEqual([['farine:ADDED'], ['farine:ADDED', 'sucre:ADDED']])
      expect(expectConform(sent[0]).outcome).toBe('completed')
    })

    it('sans canal (hors de l’application), rien n’est envoyé et le passage est le même', async () => {
      const { adapter } = fakeAdapter({ '1000001': {} })
      const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

      await flow.start(plan([known('farine', [product('1000001')])]))

      expect(expectConform(sent[0]).outcome).toBe('completed')
    })
  })

  describe('un arrêt qui n’a rien fait garde son comportement', () => {
    it('une erreur avant tout travail, sans état de reprise : aucune ligne', async () => {
      const screens = fakeUi({ error: () => 'return' })
      const { flow, sent } = makeFlow({
        ui: screens.ui,
        storage: fakeStorage(),
        retailer: 'auchan',
      })

      await flow.start(plan([known('farine', [product('1000001')])]))

      expect(expectConform(sent[0])).toMatchObject({ outcome: 'error', lines: [] })
    })

    it('un incident imprévu hors de tout passage (la page ne se laisse pas lire) : l’erreur reste rapportée sans ligne', async () => {
      const screens = fakeUi({ error: () => 'return' })
      const { adapter } = fakeAdapter()
      adapter.readStore = () => {
        throw new TypeError('lecture impossible')
      }
      const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

      await flow.start(plan([known('farine', [product('1000001')])]))

      expect(expectConform(sent[0]).lines).toEqual([])
      expect(screens.screens()).toEqual(['error'])
    })
  })
})
