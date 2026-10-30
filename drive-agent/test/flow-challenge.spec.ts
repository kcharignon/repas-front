// @vitest-environment node
// Ticket K de l'audit du 2026-10-18 (H13 et H15) : devant la page de défi de l'anti-robot, le passage se SUSPEND (au lieu de se terminer) et
// dit quoi faire ; l'état du passage est gardé (sessionStorage), « Reprendre » refait la ligne en cours, « Arrêter » rend la main comme avant.
// Une requête qui dépasse son délai d'attente est une erreur réseau, dite comme telle (« Leclerc met trop de temps à répondre »), distincte du
// blocage. L'interface, l'adaptateur et le stockage sont simulés : aucun réseau.
import { describe, expect, it, vi } from 'vitest'

import { RetailerError } from '../src/retailers'
import { RUN_PREFIX } from '../src/flow'
import {
  RUN_ID,
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  known,
  makeFlow,
  plan,
  product,
} from './flow-helpers'

const SHELF = { '1000001': {}, '1000003': {}, '1000009': {} }
const lines = () => [
  known('farine', [product('1000001', 3)]),
  known('sucre', [product('1000003', 1)]),
  known('sel', [product('1000009', 2)]),
]
const challenge = () => new RetailerError('BLOCKED', 200, 'CHALLENGE')

/** Un faux site dont la requête `call` tombe sur le défi les `times` premières fois. */
function challengedOn(call: string, times = 1) {
  let left = times
  return fakeAdapter(SHELF, {
    before: (name) => {
      if (name === call && left > 0) {
        left -= 1
        throw challenge()
      }
    },
  })
}

describe('un défi de l’anti-robot pendant le passage (phase A)', () => {
  it('suspend le passage et demande la vérification ; « Reprendre » refait la ligne en cours et le passage s’achève comme si de rien n’était', async () => {
    // Given : la recherche du sucre tombe sur le défi, une seule fois
    const site = challengedOn('search 1000003')
    const screens = fakeUi({ challenge: () => 'resume' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: site.adapter })

    // When
    await flow.start(plan(lines()))

    // Then : la ligne est refaite, rien n'a échoué, un seul résultat part, à la fin
    expect(screens.screens()).toEqual(['progress', 'challenge', 'progress'])
    expect(site.calls).toEqual([
      'search 1000001',
      'cart 1000001 3',
      'search 1000003',
      'search 1000003',
      'cart 1000003 1',
      'search 1000009',
      'cart 1000009 2',
    ])
    expect(sent).toHaveLength(1)
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'completed' })
    expect(sent[0]?.lines.map((line) => line.outcome)).toEqual(['ADDED', 'ADDED', 'ADDED'])
  })

  it('une écriture du panier qui tombe sur le défi est refaite après « Reprendre », sans rien doubler', async () => {
    const site = challengedOn('cart 1000003 1')
    const screens = fakeUi({ challenge: () => 'resume' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: site.adapter })

    await flow.start(plan(lines()))

    expect(site.writes).toEqual([
      { id: '1000001', quantity: 3 },
      { id: '1000003', quantity: 1 },
      { id: '1000009', quantity: 2 },
    ])
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'completed' })
  })

  it('un défi qui revient après « Reprendre » redemande la vérification, autant de fois qu’il le faut', async () => {
    const site = challengedOn('search 1000003', 2)
    const asked: number[] = []
    const screens = fakeUi({
      challenge: () => {
        asked.push(asked.length + 1)
        return 'resume'
      },
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: site.adapter })

    await flow.start(plan(lines()))

    expect(asked).toEqual([1, 2])
    expect(screens.screens().filter((screen) => screen === 'challenge')).toHaveLength(2)
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'completed' })
  })

  it('« Arrêter » rend la main comme un blocage d’avant : « partial », la ligne et les suivantes en échec (BLOCKED), la cause dite au résultat, plus aucune requête', async () => {
    const site = challengedOn('search 1000003')
    const screens = fakeUi({ challenge: () => 'stop' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: site.adapter })

    await flow.start(plan(lines()))

    expect(screens.screens()).toEqual(['progress', 'challenge', 'end'])
    expect(site.calls).toEqual(['search 1000001', 'cart 1000001 3', 'search 1000003'])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'partial',
      error: { code: 'BLOCKED', message: 'Leclerc a ralenti les demandes (CHALLENGE)' },
    })
    expect(
      sent[0]?.lines.map((line) => [line.outcome, 'error' in line ? line.error : null]),
    ).toEqual([
      ['ADDED', null],
      ['FAILED', 'BLOCKED'],
      ['FAILED', 'BLOCKED'],
    ])
    expect(screens.propsOf('end')[0]).toMatchObject({ outcome: 'partial', error: 'BLOCKED' })
  })

  it('un blocage ordinaire (403, 429 : sans défi) ne suspend rien : le passage s’arrête comme avant', async () => {
    const site = fakeAdapter(SHELF, {
      before: (name) => {
        if (name === 'search 1000003') throw new RetailerError('BLOCKED', 429)
      },
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: site.adapter })

    await flow.start(plan(lines()))

    expect(screens.screens()).not.toContain('challenge')
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'partial',
      error: { code: 'BLOCKED', message: 'Leclerc a ralenti les demandes' },
    })
  })

  it('garde l’état du passage pendant l’attente : si la page est rechargée, le passage se reprend là où il en était', async () => {
    // Given : un premier passage qui attend devant le défi (la page va se recharger : il ne répondra jamais)
    const storage = fakeStorage()
    const first = challengedOn('search 1000003')
    const waiting = fakeUi({ challenge: () => new Promise<'resume' | 'stop'>(() => undefined) })
    const firstRun = makeFlow({ ui: waiting.ui, adapter: first.adapter, storage })
    void firstRun.flow.start(plan(lines()))
    await vi.waitFor(() => expect(waiting.screens()).toContain('challenge'))

    // Then : la farine est gardée, rien n'est parti vers Repas
    expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toContain('"farine"')
    expect(firstRun.sent).toEqual([])

    // When : la page rechargée renvoie le même plan
    const second = fakeAdapter(SHELF)
    const screens = fakeUi({ resume: () => 'resume' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: second.adapter, storage })
    await flow.start(plan(lines()))

    // Then : « Reprendre où tu t'étais arrêté ? » propose la ligne faite, et seules les deux autres sont refaites
    expect(screens.propsOf('resume')).toEqual([{ done: 1, total: 3 }])
    expect(second.writes).toEqual([
      { id: '1000003', quantity: 1 },
      { id: '1000009', quantity: 2 },
    ])
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'completed' })
  })

  it('l’état est gardé aussi quand l’utilisateur répond « Reprendre » : il ne disparaît qu’à la fin du passage', async () => {
    const storage = fakeStorage()
    const site = challengedOn('search 1000003')
    let during: string | null = null
    const screens = fakeUi({
      challenge: () => {
        during = storage.getItem(`${RUN_PREFIX}${RUN_ID}`)
        return 'resume'
      },
    })
    const { flow } = makeFlow({ ui: screens.ui, adapter: site.adapter, storage })

    await flow.start(plan(lines()))

    expect(during).toContain('"farine"')
    expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toBeNull()
  })
})

describe('une requête trop lente (délai d’attente dépassé)', () => {
  const slow = () => new RetailerError('NETWORK', null, 'REQUEST_TIMEOUT')

  it('ne fait échouer que la ligne (NETWORK) : les suivantes sont tentées, la fin dit que Leclerc met trop de temps à répondre', async () => {
    // Given : la recherche du sucre dépasse le délai (déjà retentée une fois par la cadence)
    const site = fakeAdapter(SHELF, {
      before: (name) => {
        if (name === 'search 1000003') throw slow()
      },
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: site.adapter })

    // When
    await flow.start(plan(lines()))

    // Then
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'partial' })
    expect(
      sent[0]?.lines.map((line) => [line.outcome, 'error' in line ? line.error : null]),
    ).toEqual([
      ['ADDED', null],
      ['FAILED', 'NETWORK'],
      ['ADDED', null],
    ])
    expect(screens.screens()).not.toContain('challenge')
    expect(screens.propsOf('end')[0]).toMatchObject({ outcome: 'partial', failed: 1, slow: true })
    expect(screens.updates.map((update) => update.entry)).toContain(
      'Sucre : Leclerc met trop de temps à répondre',
    )
  })

  it('une erreur réseau ordinaire n’est pas présentée comme une lenteur', async () => {
    const site = fakeAdapter(SHELF, {
      before: (name) => {
        if (name === 'search 1000003') throw new RetailerError('NETWORK')
      },
    })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: site.adapter })

    await flow.start(plan(lines()))

    expect(screens.propsOf('end')[0]).not.toHaveProperty('slow')
    expect(screens.updates.map((update) => update.entry)).toContain('Sucre : échec')
  })

  it('un passage sans lenteur n’a pas la mention', async () => {
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: fakeAdapter(SHELF).adapter })

    await flow.start(plan(lines()))

    expect(screens.screens()).not.toContain('end')
  })
})
