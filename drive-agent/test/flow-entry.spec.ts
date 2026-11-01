// @vitest-environment node
// Entrer dans le magasin, revenir sans geste (DRV-625) : le plan arrive sur l'accueil de l'enseigne, l'agent suit « Commencer mes courses » lui-même,
// une seule fois par envoi ; au moindre doute il laisse l'utilisateur toucher le bouton. Un envoi terminé repart sans écran de fin.
import { describe, expect, it } from 'vitest'

import { type EntryReading, type SessionReading } from '../src/leclerc'
import { RetailerError } from '../src/retailers'
import { ENTRY_KEY, ENTRY_LOGIN_KEY } from '../src/flow/run-state'
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
  throw new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_PATH')
}
const LINK = {
  kind: 'LINK',
  url: 'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/',
} as const
const lines = () => [known('farine', [product('1000001', 2)])]

function home(
  entry: EntryReading | (() => EntryReading),
  options: {
    storage?: boolean
    onFollow?: () => void | Promise<void>
    session?: () => SessionReading
    entersAfterLogin?: boolean
  } = {},
) {
  const adapter = fakeAdapter(
    {},
    {
      store: notAStore,
      // Comme Leclerc (DRV-753) : la page dit si un magasin est choisi ; ici jamais (le bouton n'apparaît pas), le guide du premier usage attend
      storeChosen: () => false,
      entry,
      ...(options.onFollow && { onFollow: options.onFollow }),
      ...(options.session && { session: options.session }),
      ...(options.entersAfterLogin !== undefined && { entersAfterLogin: options.entersAfterLogin }),
    },
  )
  // La carte de vérification (page d'un défi) : la personne arrête
  const screens = fakeUi({ challenge: () => 'stop' })
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

  it('avec un lien qui ne mène pas au magasin du plan : le bouton est dans la page, le bandeau dit de le toucher, rien n’est suivi', async () => {
    const { flow, screens, adapter, sent } = home({ kind: 'REFUSED' })

    await flow.start(plan(lines()))

    expect(screens.propsOf('entry')).toEqual([{ stage: 'manual' }])
    expect(adapter.follows.count).toBe(0)
    expect(screens.screens()).not.toContain('error')
    expect(sent).toEqual([])
    expect(adapter.calls).toEqual([])
  })

  // DRV-753 : « Touche « Commencer mes courses » » ne se dit que si la page montre ce bouton. Sans lui (l'accueil national, aucun magasin choisi), c'est une étape du
  // guide, pas ce message.
  it('sans bouton ni lien (aucun magasin choisi) : jamais « Touche « Commencer mes courses » », la carte du guide prend le relais et la personne peut arrêter', async () => {
    const { flow, screens, adapter, sent } = home({ kind: 'NONE' })

    await flow.start(plan(lines()))

    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }])
    expect(screens.propsOf('guide')[0]).toMatchObject({
      step: 'store',
      stage: 'waiting',
      byPostalCode: true,
    })
    expect(screens.propsOf('entry')).not.toContainEqual({ stage: 'manual' })
    expect(adapter.follows.count).toBe(0)
    expect(screens.screens()).not.toContain('error')
    expect(adapter.calls).toEqual([])
    expect(sent).toHaveLength(1)
    expect(expectConform(sent[0]).outcome).toBe('aborted')
  })

  it('sur la page d’un défi de l’anti-robot : le bouton n’est pas dans la page, la carte de vérification (jamais « Touche … ») ; « Arrêter pour l’instant » rend l’envoi arrêté', async () => {
    const { flow, screens, adapter, sent } = home({ kind: 'CHALLENGE' })

    await flow.start(plan(lines()))

    expect(screens.propsOf('entry')).toEqual([])
    expect(screens.screens()).toContain('challenge')
    expect(adapter.follows.count).toBe(0)
    expect(screens.screens()).not.toContain('error')
    expect(adapter.calls).toEqual([])
    expect(sent).toHaveLength(1)
    expect(expectConform(sent[0]).outcome).toBe('aborted')
  })

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

  it('une page qui ne montre jamais rien : l’attente est bornée, puis la carte du guide', async () => {
    let reads = 0
    const { flow, screens, adapter } = home(() => (reads++, { kind: 'NONE' }))

    await flow.start(plan(lines()))

    // 4 s d'attente à 500 ms : neuf lectures au plus, pas une de plus ; puis la carte du guide (le bouton n'existe pas dans la page : jamais « Touche … »)
    expect(reads).toBe(9)
    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }])
    expect(screens.screens()).toContain('guide')
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
        throw new RetailerError('BLOCKED')
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
          throw new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_HOST')
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

// DRV-748 : le premier toucher a lieu sur l'accueil d'un visiteur (le site répond par sa page de connexion, que la personne remplit elle-même) ; une fois
// connectée, l'accueil montre de nouveau le bouton : l'agent le suit une seconde fois, la dernière, sans que la personne ait à le toucher.
describe('entrer une seconde fois après la connexion (DRV-748)', () => {
  const VISITOR: SessionReading = { state: 'VISITOR', signs: ['LOGIN_LINK', 'REGISTER_LINK'] }
  const MEMBER: SessionReading = { state: 'MEMBER', signs: ['LOGOUT_LINK'] }
  const UNKNOWN: SessionReading = { state: 'UNKNOWN', signs: [] }

  /** Un accueil dont la session change entre deux passages du plan (la personne se connecte entre les deux). */
  function login(
    entry: EntryReading | (() => EntryReading),
    options: { entersAfterLogin?: boolean; onFollow?: () => void | Promise<void> } = {},
  ) {
    let session: SessionReading = VISITOR
    const made = home(entry, { session: () => session, ...options })
    return { ...made, signIn: (to: SessionReading = MEMBER) => void (session = to) }
  }

  it('le premier toucher avant la connexion, le second après : une fois connecté, le bouton revient et l’agent le suit sans geste', async () => {
    const { flow, screens, adapter, sent, storage, signIn } = login({ kind: 'BUTTON' })

    // Le visiteur : premier toucher (le site répond par sa page de connexion), puis le bandeau dit de toucher le bouton
    await flow.start(plan(lines()))
    expect(adapter.follows.count).toBe(1)
    expect(storage.getItem(ENTRY_LOGIN_KEY)).toBe(`${RUN_ID}:before`)

    // La personne se connecte : l'accueil revient avec le bouton, l'agent le suit une seconde fois
    signIn()
    await flow.start(plan(lines()))

    expect(adapter.follows.count).toBe(2)
    expect(screens.propsOf('entry')).toEqual([
      { stage: 'opening' },
      { stage: 'manual' },
      { stage: 'opening' },
      { stage: 'manual' },
    ])
    expect(storage.getItem(ENTRY_KEY)).toBe(RUN_ID)
    expect(storage.getItem(ENTRY_LOGIN_KEY)).toBe(`${RUN_ID}:after`)
    // Aucune requête, aucune écriture avant l'entrée
    expect(sent).toEqual([])
    expect(adapter.calls).toEqual([])
    expect(adapter.writes).toEqual([])
  })

  it('jamais trois touchers : le troisième passage du même envoi ne touche rien, le geste manuel reste', async () => {
    const { flow, screens, adapter, signIn } = login({ kind: 'BUTTON' })
    await flow.start(plan(lines()))
    signIn()
    await flow.start(plan(lines()))

    await flow.start(plan(lines()))
    await flow.start(plan(lines()))

    expect(adapter.follows.count).toBe(2)
    expect(screens.propsOf('entry').slice(-2)).toEqual([{ stage: 'manual' }, { stage: 'manual' }])
  })

  it('un lien vérifié vers le magasin du plan est suivi de la même façon', async () => {
    const { flow, adapter, signIn } = login(LINK)
    await flow.start(plan(lines()))
    signIn()

    await flow.start(plan(lines()))

    expect(adapter.follows.count).toBe(2)
  })

  it.each([
    ['un état inconnu', UNKNOWN],
    ['un visiteur', VISITOR],
  ])(
    '%s : la seconde entrée n’a pas lieu, le bandeau dit de toucher le bouton',
    async (_name, session) => {
      const { flow, screens, adapter, signIn } = login({ kind: 'BUTTON' })
      await flow.start(plan(lines()))
      signIn(session)

      await flow.start(plan(lines()))

      expect(adapter.follows.count).toBe(1)
      expect(screens.propsOf('entry')).toEqual([
        { stage: 'opening' },
        { stage: 'manual' },
        { stage: 'manual' },
      ])
    },
  )

  it('un premier toucher fait session ouverte n’en permet aucun autre : un clic sans effet ne se refait pas', async () => {
    const { flow, adapter, storage, signIn } = login({ kind: 'BUTTON' })
    signIn()

    await flow.start(plan(lines()))
    await flow.start(plan(lines()))

    expect(adapter.follows.count).toBe(1)
    expect(storage.getItem(ENTRY_LOGIN_KEY)).toBeNull()
  })

  it.each([
    ['sans bouton (la carte du guide)', { kind: 'NONE' }],
    ['avec un lien qui ne mène pas au magasin du plan', { kind: 'REFUSED' }],
    ['sur la page d’un défi de l’anti-robot (la carte de vérification)', { kind: 'CHALLENGE' }],
  ] as const)('%s : rien n’est touché la seconde fois', async (_name, second) => {
    // Given : le premier toucher a eu lieu, puis la page ne montre plus rien de suivable
    let current: EntryReading = { kind: 'BUTTON' }
    const { flow, screens, adapter, sent, signIn } = login(() => current)
    await flow.start(plan(lines()))
    signIn()
    current = second

    // When
    await flow.start(plan(lines()))

    // Then
    expect(adapter.follows.count).toBe(1)
    expect(screens.screens()).not.toContain('error')
    // Sans bouton ou sur un défi : la personne arrête la carte (le texte de la page n'est jamais « Touche … »), rien n'est écrit ; avec un lien refusé, l'envoi attend
    expect(sent.map((result) => result.outcome)).toEqual(
      second.kind === 'REFUSED' ? [] : ['aborted'],
    )
    expect(adapter.calls).toEqual([])
    expect(adapter.writes).toEqual([])
  })

  it('une enseigne qui ne le permet pas (pas de seconde entrée) garde une seule entrée par envoi', async () => {
    const { flow, adapter, signIn } = login({ kind: 'BUTTON' }, { entersAfterLogin: false })
    await flow.start(plan(lines()))
    signIn()

    await flow.start(plan(lines()))

    expect(adapter.follows.count).toBe(1)
  })

  it('un suivi qui échoue la seconde fois laisse le geste manuel, sans en tenter un troisième', async () => {
    let follows = 0
    const { flow, screens, adapter, signIn } = login(
      { kind: 'BUTTON' },
      {
        onFollow: () => {
          if (++follows === 2) throw new RetailerError('BLOCKED')
        },
      },
    )
    await flow.start(plan(lines()))
    signIn()

    await flow.start(plan(lines()))
    await flow.start(plan(lines()))

    expect(adapter.follows.count).toBe(2)
    expect(screens.propsOf('entry').at(-1)).toEqual({ stage: 'manual' })
  })

  it('un autre envoi repart de zéro : son premier toucher, puis sa seconde entrée après la connexion', async () => {
    const { flow, adapter, signIn } = login({ kind: 'BUTTON' })
    const OTHER = '11111111-2222-4333-8444-555555555555'
    await flow.start(plan(lines(), RUN_ID))
    signIn()
    await flow.start(plan(lines(), RUN_ID))

    await flow.start(plan(lines(), OTHER))

    // Le premier envoi a eu ses deux touchers ; l'autre, connecté d'emblée, a le sien
    expect(adapter.follows.count).toBe(3)
  })

  describe('sur la page du magasin du plan, la fenêtre d’accueil de la personne connectée', () => {
    const onStore = (
      notes: Record<string, string>,
      options: { session?: SessionReading; entry?: EntryReading } = {},
    ) => {
      const adapter = fakeAdapter(
        { '1000001': {} },
        {
          entry: options.entry ?? { kind: 'BUTTON' },
          session: options.session ?? MEMBER,
        },
      )
      const screens = fakeUi()
      const storage = fakeStorage(notes)
      const { flow, sent } = makeFlow({ ui: screens.ui, adapter: adapter.adapter, storage })
      return { flow, sent, screens, adapter, storage }
    }
    const BEFORE = { [ENTRY_KEY]: RUN_ID, [ENTRY_LOGIN_KEY]: `${RUN_ID}:before` }

    it('le premier toucher a eu lieu avant la connexion : le bouton est touché une seconde fois', async () => {
      const { flow, adapter, screens, storage } = onStore(BEFORE)

      await flow.start(plan(lines()))
      await flow.start(plan(lines()))

      expect(adapter.follows.count).toBe(1)
      expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }])
      expect(storage.getItem(ENTRY_LOGIN_KEY)).toBe(`${RUN_ID}:after`)
    })

    it('le premier toucher a eu lieu session ouverte : rien de plus, le passage démarre', async () => {
      const { flow, adapter, sent } = onStore({ [ENTRY_KEY]: RUN_ID })

      await flow.start(plan(lines()))

      expect(adapter.follows.count).toBe(0)
      expect(expectConform(sent[0]).outcome).toBe('completed')
    })

    it('la seconde entrée est déjà dépensée : rien de plus', async () => {
      const { flow, adapter } = onStore({
        [ENTRY_KEY]: RUN_ID,
        [ENTRY_LOGIN_KEY]: `${RUN_ID}:after`,
      })

      await flow.start(plan(lines()))

      expect(adapter.follows.count).toBe(0)
    })

    it('un autre magasin que celui du plan : rien n’est touché, `STORE_MISMATCH` comme avant', async () => {
      const screens = fakeUi({ error: () => 'close' })
      const adapter = fakeAdapter(
        {},
        {
          entry: { kind: 'BUTTON' },
          session: MEMBER,
          store: () => ({
            id: '000002',
            host: 'fd0-courses.leclercdrive.fr',
            baseUrl: 'https://fd0-courses.leclercdrive.fr/magasin-000002-000002',
            label: null,
          }),
        },
      )
      const { flow, sent } = makeFlow({
        ui: screens.ui,
        adapter: adapter.adapter,
        storage: fakeStorage(BEFORE),
      })

      await flow.start(plan(lines()))

      expect(adapter.follows.count).toBe(0)
      expect(screens.screens()).toEqual(['error'])
      expect(sent).toEqual([])
    })
  })
})
