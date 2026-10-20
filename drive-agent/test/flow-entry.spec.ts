// Entrer dans le magasin, revenir sans geste (DRV-625) : le plan arrive sur l'accueil de l'enseigne, l'agent suit « Commencer mes courses » lui-même,
// une seule fois par envoi ; au moindre doute il laisse l'utilisateur toucher le bouton. Un envoi terminé repart sans écran de fin.
import { describe, expect, it } from 'vitest'

import { LeclercError, type EntryReading } from '../src/leclerc'
import {
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  known,
  makeFlow,
  plan,
  product,
  RUN_ID,
} from './flow-helpers'

const notAStore = () => {
  throw new LeclercError('UNSUPPORTED_PAGE', null, 'PAGE_PATH')
}
const LINK = {
  kind: 'LINK',
  url: 'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/',
} as const
const lines = () => [known('farine', [product('1000001', 2)])]

function home(
  entry: EntryReading | (() => EntryReading),
  options: { storage?: boolean; onFollow?: () => void | Promise<void> } = {},
) {
  const adapter = fakeAdapter(
    {},
    { store: notAStore, entry, ...(options.onFollow && { onFollow: options.onFollow }) },
  )
  const screens = fakeUi()
  const storage = fakeStorage()
  const { flow, sent } = makeFlow({
    ui: screens.ui,
    adapter: adapter.adapter,
    storage: options.storage === false ? null : storage,
  })
  return { flow, sent, screens, storage, adapter }
}

describe('entrer dans le magasin', () => {
  it('suit « Commencer mes courses » : « Ouverture de ton magasin… », puis la page change', async () => {
    // Given : la page quitte le script au clic, la promesse ne se résout jamais
    const { flow, screens, adapter, sent, storage } = home(LINK, {
      onFollow: () => new Promise(() => undefined),
    })

    // When
    void flow.start(plan(lines()))
    await Promise.resolve()
    await Promise.resolve()

    // Then : le bandeau d'ouverture, un seul suivi, rien envoyé, aucune écriture, aucune requête
    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }])
    expect(adapter.follows.count).toBe(1)
    expect(sent).toEqual([])
    expect(adapter.calls).toEqual([])
    expect(adapter.writes).toEqual([])
    expect(flow.history).toEqual(['START', 'VALIDATED', 'ENTERING'])
    expect(storage.getItem('repas:entry')).toBe(RUN_ID)
  })

  it('clique le bouton « Commencer mes courses » (le vrai site, DRV-629) : même bandeau, une seule fois, sans écrire', async () => {
    // Given : un bouton sans adresse ; le clic fait quitter la page (la promesse ne se résout jamais)
    const { flow, screens, adapter, sent, storage } = home(
      { kind: 'BUTTON' },
      { onFollow: () => new Promise(() => undefined) },
    )

    // When
    void flow.start(plan(lines()))
    await Promise.resolve()
    await Promise.resolve()

    // Then
    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }])
    expect(adapter.follows.count).toBe(1)
    expect(sent).toEqual([])
    expect(adapter.calls).toEqual([])
    expect(adapter.writes).toEqual([])
    expect(storage.getItem('repas:entry')).toBe(RUN_ID)
  })

  it('un clic sans effet (la page reste là) : le bandeau dit de toucher le bouton, et le même envoi ne reclique pas', async () => {
    const { flow, screens, adapter, sent } = home({ kind: 'BUTTON' })

    await flow.start(plan(lines()))
    await flow.start(plan(lines()))

    expect(screens.propsOf('entry')).toEqual([
      { stage: 'opening' },
      { stage: 'manual' },
      { stage: 'manual' },
    ])
    expect(adapter.follows.count).toBe(1)
    expect(sent).toEqual([])
    expect(adapter.writes).toEqual([])
  })

  it('sans stockage de session, le bouton n’est pas cliqué (aucune boucle possible)', async () => {
    const { flow, screens, adapter } = home({ kind: 'BUTTON' }, { storage: false })

    await flow.start(plan(lines()))

    expect(screens.propsOf('entry')).toEqual([{ stage: 'manual' }])
    expect(adapter.follows.count).toBe(0)
  })

  it('si la page reste là après le suivi, le bandeau dit de toucher le bouton, sans suivre une seconde fois', async () => {
    const { flow, screens, adapter, sent } = home(LINK)

    await flow.start(plan(lines()))
    await flow.start(plan(lines()))

    expect(screens.propsOf('entry')).toEqual([
      { stage: 'opening' },
      { stage: 'manual' },
      // Le même envoi revient sur l'accueil (le site nous y ramène) : pas de boucle
      { stage: 'manual' },
    ])
    expect(adapter.follows.count).toBe(1)
    expect(sent).toEqual([])
    expect(adapter.writes).toEqual([])
  })

  it.each([
    ['sans lien', { kind: 'NONE' }],
    ['avec un lien qui ne mène pas au magasin du plan', { kind: 'REFUSED' }],
    ['sur la page d’un défi de l’anti-robot', { kind: 'CHALLENGE' }],
  ] as const)(
    '%s : le bandeau dit de toucher le bouton, rien n’est suivi',
    async (_name, entry) => {
      const { flow, screens, adapter, sent } = home(entry)

      await flow.start(plan(lines()))

      // Sans rien à suivre : on a attendu que la fenêtre s'affiche (bandeau « Ouverture… ») avant de rendre la main à l'utilisateur
      expect(screens.propsOf('entry')).toEqual(
        entry.kind === 'NONE' ? [{ stage: 'opening' }, { stage: 'manual' }] : [{ stage: 'manual' }],
      )
      expect(adapter.follows.count).toBe(0)
      expect(screens.screens()).not.toContain('error')
      expect(sent).toEqual([])
      expect(adapter.calls).toEqual([])
    },
  )

  it('la fenêtre se dessine après l’arrivée du plan : l’agent relit la page, puis clique le bouton une fois qu’il est là', async () => {
    // Given : rien aux deux premières lectures, le bouton à la troisième
    let reads = 0
    const { flow, screens, adapter } = home(
      () => (++reads < 3 ? { kind: 'NONE' } : { kind: 'BUTTON' }),
      { onFollow: () => new Promise(() => undefined) },
    )

    // When
    void flow.start(plan(lines()))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Then : un seul bandeau d'ouverture, un seul clic
    expect(reads).toBe(3)
    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }])
    expect(adapter.follows.count).toBe(1)
  })

  it('une page qui ne montre jamais rien : l’attente est bornée, puis le geste manuel', async () => {
    let reads = 0
    const { flow, screens, adapter } = home(() => (reads++, { kind: 'NONE' }))

    await flow.start(plan(lines()))

    // 4 s d'attente à 500 ms : neuf lectures au plus, pas une de plus
    expect(reads).toBe(9)
    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }, { stage: 'manual' }])
    expect(adapter.follows.count).toBe(0)
  })

  it('sans stockage de session, rien n’est suivi (aucune boucle possible)', async () => {
    const { flow, screens, adapter } = home(LINK, { storage: false })

    await flow.start(plan(lines()))

    expect(screens.propsOf('entry')).toEqual([{ stage: 'manual' }])
    expect(adapter.follows.count).toBe(0)
  })

  it('un autre envoi peut entrer à son tour', async () => {
    const { flow, adapter } = home(LINK)

    await flow.start(plan(lines(), RUN_ID))
    await flow.start(plan(lines(), '11111111-2222-4333-8444-555555555555'))

    expect(adapter.follows.count).toBe(2)
  })

  it('un suivi qui échoue laisse le geste manuel', async () => {
    const { flow, screens } = home(LINK, {
      onFollow: () => {
        throw new LeclercError('BLOCKED')
      },
    })

    await flow.start(plan(lines()))

    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }, { stage: 'manual' }])
  })

  it('sur une page qui n’est pas de l’enseigne, l’erreur habituelle reste', async () => {
    const adapter = fakeAdapter(
      {},
      {
        store: () => {
          throw new LeclercError('UNSUPPORTED_PAGE', null, 'PAGE_HOST')
        },
      },
    )
    const screens = fakeUi({ error: () => 'close' })
    const { flow } = makeFlow({ ui: screens.ui, adapter: adapter.adapter, storage: fakeStorage() })

    await flow.start(plan(lines()))

    expect(screens.screens()).toEqual(['error'])
    expect(adapter.follows.count).toBe(0)
  })
})

describe('la fenêtre d’accueil sur la page du magasin du plan', () => {
  const onStorePage = (
    entry: EntryReading,
    options: { onFollow?: () => void | Promise<void> } = {},
  ) => {
    // La page est celle du magasin du plan (le magasin lu est le bon) : le passage peut démarrer
    const adapter = fakeAdapter(
      { '1000001': {} },
      { entry, ...(options.onFollow && { onFollow: options.onFollow }) },
    )
    const screens = fakeUi()
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: adapter.adapter,
      storage: fakeStorage(),
    })
    return { flow, sent, screens, adapter }
  }

  it('l’agent appuie sur « Commencer mes courses » une fois, puis le passage continue si la page reste là', async () => {
    const { flow, screens, adapter, sent } = onStorePage({ kind: 'BUTTON' })

    await flow.start(plan(lines()))
    await flow.start(plan(lines(), RUN_ID))

    expect(adapter.follows.count).toBe(1)
    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }])
    expect(screens.screens()).toContain('progress')
    // Les deux passages vont à leur terme (le second ne reclique pas : une fois par envoi)
    expect(sent.map((result) => result.outcome)).toEqual(['completed', 'completed'])
  })

  it('si la page change au clic, le passage ne démarre pas ici : le plan revient sur la nouvelle page', async () => {
    const { flow, screens, adapter, sent } = onStorePage(
      { kind: 'BUTTON' },
      { onFollow: () => new Promise(() => undefined) },
    )

    void flow.start(plan(lines()))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(adapter.follows.count).toBe(1)
    expect(screens.screens()).toEqual(['entry'])
    expect(sent).toEqual([])
    expect(adapter.writes).toEqual([])
  })

  it.each([
    ['un lien', { kind: 'LINK', url: LINK.url }],
    ['aucun bouton', { kind: 'NONE' }],
    ['un défi de l’anti-robot', { kind: 'CHALLENGE' }],
  ] as const)('%s : rien n’est touché, le passage démarre', async (_name, entry) => {
    const { flow, screens, adapter, sent } = onStorePage(entry)

    await flow.start(plan(lines()))

    expect(adapter.follows.count).toBe(0)
    expect(screens.screens()).not.toContain('entry')
    expect(expectConform(sent[0]).outcome).toBe('completed')
  })
})

describe('revenir sans geste', () => {
  const run = async (shelf: Parameters<typeof fakeAdapter>[0], l = lines()) => {
    const adapter = fakeAdapter(shelf)
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: adapter.adapter })
    await flow.start(plan(l))
    return { screens, sent, adapter }
  }

  it('un envoi terminé poste son résultat tout de suite : pas d’écran de fin', async () => {
    const { screens, sent } = await run({ '1000001': {} })

    expect(screens.screens()).toEqual(['progress'])
    expect(expectConform(sent[0]).outcome).toBe('completed')
    expect(screens.closed.count).toBe(1)
  })

  it('un envoi partiel garde l’écran de fin (il y a quelque chose à lire)', async () => {
    const { screens, sent } = await run({})

    expect(screens.screens()).toEqual(['progress', 'end'])
    expect(expectConform(sent[0]).outcome).toBe('partial')
  })

  it('un envoi arrêté par l’utilisateur garde l’écran de fin', async () => {
    const adapter = fakeAdapter({ '1000001': {} }, { before: () => screensStop() })
    const screens = fakeUi()
    const screensStop = () => screens.pressStop()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: adapter.adapter })

    await flow.start(plan(lines()))

    expect(screens.screens()).toContain('end')
    expect(sent[0]?.outcome).toBe('aborted')
  })

  it('un envoi terminé mais avec une quantité recalculée ou un panier plus garni garde l’écran de fin', async () => {
    const { screens, sent } = await run({ '1000001': { inCart: 5 } })

    expect(sent[0]?.outcome).toBe('completed')
    expect(screens.propsOf('end')[0]).toMatchObject({
      kept: [{ name: 'Farine', wanted: 2, inCart: 5 }],
    })
  })
})
