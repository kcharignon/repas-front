// Accepter le magasin que la personne a choisi (DRV-755). À l'étape guidée du choix du magasin, un magasin ouvert qui n'est pas celui du plan n'arrête plus l'envoi :
// une carte propose « Utiliser ce magasin », « Choisir un autre magasin » ou « Arrêter pour l'instant ». L'agent ne change JAMAIS le magasin seul : seul le toucher
// de « Utiliser ce magasin » envoie quelque chose, et c'est le magasin que la page montre à cet instant. Hors de cette étape (en plein passage, une enseigne qui
// ne le permet pas), `STORE_MISMATCH` reste vrai, comme avant. Données inventées : magasins `000123` (le plan) et `000456` (celui qu'on ouvre).
import { describe, expect, it } from 'vitest'

import { GUIDE_KEY, RUN_PREFIX } from '../src/flow/run-state'
import type { RetailerAdapter } from '../src/retailers'
import {
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  home,
  known,
  makeFlow,
  plan,
  product,
  RUN_ID,
  STORE,
} from './flow-helpers'

const MEMBER = { state: 'MEMBER' as const, signs: ['LOGOUT_LINK' as const] }
const FARINE = plan([known('farine', [product('1000001', 3)]), home('sel')])
const OPENED = { id: '000456', host: 'fd8-courses.leclercdrive.fr' }
const ANOTHER = { id: '005678', host: 'fd8-courses.leclercdrive.fr' }

const storeOf = (store: { id: string; host: string }) => ({
  ...store,
  baseUrl: `https://${store.host}/magasin-${store.id}-${store.id}`,
  label: null,
})

/** Une page qui évolue : le magasin qu'elle montre, d'où l'on vient, et l'adaptateur simulé qui le lit. */
function world(
  options: {
    fromHome?: boolean
    accepts?: boolean
    city?: string | null
    page?: { id: string; host: string }
  } = {},
) {
  const state = { page: options.page ?? OPENED, reads: 0 }
  const built = fakeAdapter(
    { '1000001': {} },
    {
      session: MEMBER,
      store: () => {
        state.reads += 1
        return storeOf(state.page)
      },
    },
  )
  const adapter: RetailerAdapter = Object.assign(built.adapter, {
    ...(options.accepts !== false && {
      acceptsChosenStore: true,
      cameFromStoreChoice: () => options.fromHome ?? true,
      storeCity: () => (options.city === undefined ? 'Ville-Test' : options.city),
    }),
  })
  return { ...built, adapter, state }
}

/** Une horloge et des pauses que le test gouverne : chaque pause laisse la personne agir (`during`) puis avance le temps. */
function clock(during: (tick: number) => void = () => undefined) {
  const time = { now: 1_000_000, ticks: 0 }
  return {
    now: () => {
      time.now += 1
      return time.now
    },
    sleep: (ms: number) => {
      time.ticks += 1
      time.now += ms
      during(time.ticks)
      return Promise.resolve()
    },
  }
}

describe('un autre magasin à l’étape guidée du choix du magasin : la personne peut le garder', () => {
  it('arrivée de l’accueil national : la carte dit la ville, « Utiliser ce magasin » rend le magasin à Repas, sans rien écrire', async () => {
    // Given : le plan est fait pour 000123, la page est celle de 000456, atteinte depuis l'accueil national
    const w = world()
    const screens = fakeUi({ chosenStore: () => 'use' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    // When
    await flow.start(FARINE)

    // Then : une carte, jamais un écran d'erreur
    expect(screens.screens()).toEqual(['chosenStore'])
    expect(screens.propsOf('chosenStore')).toEqual([{ label: 'Ville-Test', tail: '456' }])
    // Le résultat est « arrêté » et porte le magasin que la page montre ; le magasin du plan reste celui du plan
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'aborted',
      store: { id: STORE.id },
      lines: [],
      chosenStore: { id: '000456', host: OPENED.host, label: 'Ville-Test' },
    })
    expect(sent[0]?.chosenStore?.baseUrl).toBe(
      'https://fd8-courses.leclercdrive.fr/magasin-000456-000456',
    )
    expect(sent[0]?.error).toBeUndefined()
    expect(sent).toHaveLength(1)
    expect(w.writes).toEqual([])
    expect(w.calls).toEqual([])
    expect(screens.closed.count).toBe(1)
  })

  it('une page sans nom de ville : la carte dit les derniers chiffres du numéro', async () => {
    const w = world({ city: null })
    const screens = fakeUi({ chosenStore: () => 'use' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    await flow.start(FARINE)

    expect(screens.propsOf('chosenStore')).toEqual([{ label: null, tail: '456' }])
    expect(expectConform(sent[0]).chosenStore?.label).toBeNull()
  })

  it('le guide d’une page d’avant l’a noté (même origine) : la carte aussi, sans le référent', async () => {
    const w = world({ fromHome: false })
    const storage = fakeStorage({ [GUIDE_KEY]: `${RUN_ID}|1|store` })
    const screens = fakeUi({ chosenStore: () => 'use' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['chosenStore'])
    expect(expectConform(sent[0]).chosenStore?.id).toBe('000456')
    // L'envoi est rendu : la note du guide n'a plus lieu d'être
    expect(storage.getItem(GUIDE_KEY)).toBeNull()
  })

  it('« Arrêter pour l’instant » : l’envoi s’arrête, la liste est gardée, aucun magasin n’est rendu', async () => {
    const w = world()
    const screens = fakeUi({ chosenStore: () => 'stop' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    await flow.start(FARINE)

    expect(expectConform(sent[0])).toMatchObject({ outcome: 'aborted', lines: [] })
    expect(sent[0]).not.toHaveProperty('chosenStore')
    expect(w.writes).toEqual([])
    expect(screens.closed.count).toBe(1)
  })

  it('tant que la personne ne touche rien, rien n’est envoyé : l’agent ne change jamais le magasin seul', async () => {
    const w = world()
    const screens = fakeUi({ chosenStore: () => new Promise(() => undefined) })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    void flow.start(FARINE)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screens.screens()).toEqual(['chosenStore'])
    expect(sent).toEqual([])
    expect(w.writes).toEqual([])
  })

  it('la page a changé de magasin entre l’affichage de la carte et le toucher : ce qui est rendu est la page d’AUJOURD’HUI, jamais la carte périmée', async () => {
    // Given : au toucher, la page montre un autre magasin ; la seconde carte est refusée
    const w = world()
    const answers: ('use' | 'stop')[] = ['use', 'stop']
    const screens = fakeUi({
      chosenStore: () => {
        const next = answers.shift() ?? 'stop'
        if (next === 'use') w.state.page = ANOTHER
        return next
      },
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    // When
    await flow.start(FARINE)

    // Then : la première carte parlait de 000456, la seconde de 005678 ; rien n'est rendu pour 000456
    expect(screens.propsOf('chosenStore').map((props) => props.tail)).toEqual(['456', '678'])
    expect(sent.map((message) => message.chosenStore)).toEqual([undefined])
    expect(sent[0]?.outcome).toBe('aborted')
  })

  it('ce qui part est la page d’AUJOURD’HUI (le libellé relu), pas la carte d’avant', async () => {
    const w = world()
    let city = 'Ville-Test'
    w.adapter.storeCity = () => city
    const screens = fakeUi({
      chosenStore: () => {
        // Le nom de la ville a changé entre l'affichage de la carte et le toucher (même numéro, même hôte)
        city = 'Autre-Nom'
        return 'use'
      },
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    await flow.start(FARINE)

    expect(expectConform(sent[0]).chosenStore?.label).toBe('Autre-Nom')
  })

  it('une relecture qui échoue un instant après le toucher : la carte revient, rien n’est envoyé ni arrêté ; la personne retouche', async () => {
    const w = world()
    const read = w.adapter.readStore
    let failures = 2
    const screens = fakeUi({ chosenStore: () => 'use' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })
    let cards = 0
    const show = screens.ui.show.bind(screens.ui)
    screens.ui.show = ((screen: Parameters<typeof show>[0], props: never) => {
      if (screen === 'chosenStore') {
        cards += 1
        // La première lecture (la carte) a réussi ; celle qui suit le premier toucher échoue
        if (cards === 1) {
          w.adapter.readStore = () => {
            if (failures-- > 0) throw new Error('page en cours de chargement')
            return read()
          }
        }
      }
      return show(screen, props)
    }) as typeof screens.ui.show

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['chosenStore', 'chosenStore', 'chosenStore'])
    expect(screens.screens()).not.toContain('error')
    expect(expectConform(sent[0]).chosenStore?.id).toBe('000456')
    expect(sent).toHaveLength(1)
  })

  it('« Choisir un autre magasin » : la carte du choix attend, et quand la page montre le magasin du plan, l’envoi continue tout seul', async () => {
    // Given : la personne refuse 000456, puis ouvre le magasin du plan au 3e coup d'œil
    const w = world()
    const time = clock((tick) => {
      if (tick === 3) w.state.page = { ...STORE }
    })
    const screens = fakeUi({ chosenStore: () => 'other' })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: w.adapter,
      storage: fakeStorage(),
      ...time,
    })

    // When
    await flow.start(FARINE)

    // Then : la carte du choix du magasin (sans repère d'étape) a attendu, puis le passage a eu lieu
    expect(screens.screens().slice(0, 2)).toEqual(['chosenStore', 'guide'])
    expect(screens.propsOf('guide')[0]).toMatchObject({ step: 'store', stage: 'waiting', index: 1 })
    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(sent.every((message) => message.chosenStore === undefined)).toBe(true)
  })

  it('« Choisir un autre magasin », puis un troisième magasin : la carte le propose à son tour', async () => {
    const w = world()
    const answers: ('other' | 'use')[] = ['other', 'use']
    const time = clock((tick) => {
      if (tick === 2) w.state.page = ANOTHER
    })
    const screens = fakeUi({ chosenStore: () => answers.shift() ?? 'stop' })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: w.adapter,
      storage: fakeStorage(),
      ...time,
    })

    await flow.start(FARINE)

    expect(screens.propsOf('chosenStore').map((props) => props.tail)).toEqual(['456', '678'])
    expect(expectConform(sent[0]).chosenStore?.id).toBe('005678')
  })

  it('« Choisir un autre magasin » puis « Arrêter pour l’instant » : l’envoi est rendu arrêté, sans magasin', async () => {
    const w = world()
    const screens = fakeUi({ chosenStore: () => 'other' })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: w.adapter,
      storage: fakeStorage(),
      // Chaque pause de l'attente touche « Arrêter pour l'instant » sur la carte affichée
      sleep: () => {
        screens.pressGuideStop()
        return Promise.resolve()
      },
    })

    await flow.start(FARINE)

    expect(expectConform(sent[0])).toMatchObject({ outcome: 'aborted', lines: [] })
    expect(sent[0]).not.toHaveProperty('chosenStore')
  })
})

describe('STORE_MISMATCH reste vrai hors de l’étape guidée du choix du magasin', () => {
  it('ni guide noté ni arrivée de l’accueil national : l’envoi s’arrête comme avant', async () => {
    const w = world({ fromHome: false })
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['error'])
    expect(screens.propsOf('error')).toEqual([{ code: 'STORE_MISMATCH', canReturn: true }])
    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
    expect(sent[0]).not.toHaveProperty('chosenStore')
  })

  it('un stockage de session illisible : on ne sait pas ce que ce passage a écrit, l’envoi s’arrête comme avant', async () => {
    const w = world()
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: null })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['error'])
    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
  })

  it('un stockage qui refuse la lecture : même chose', async () => {
    const w = world()
    const screens = fakeUi({ error: () => 'return' })
    const broken = {
      ...fakeStorage(),
      getItem: () => {
        throw new Error('interdit')
      },
    }
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: broken })

    await flow.start(FARINE)

    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
  })

  it('une requête déjà partie dans ce passage (même sans article traité) : l’envoi s’arrête comme avant', async () => {
    const storage = fakeStorage({
      [`${RUN_PREFIX}${RUN_ID}`]: JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_A',
        done: {},
        waiting: {},
        stats: { requests: 3, errors: 0, blocks: 0 },
      }),
    })
    const w = world()
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['error'])
    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
  })

  it('en plein passage (des articles déjà traités) : l’envoi s’arrête, même arrivé de l’accueil national', async () => {
    const storage = fakeStorage({
      [`${RUN_PREFIX}${RUN_ID}`]: JSON.stringify({
        v: 1,
        runId: RUN_ID,
        updatedAt: 1,
        phase: 'PHASE_A',
        done: { sel: { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' } },
        waiting: {},
      }),
    })
    const w = world()
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['error'])
    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
    expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toContain('"sel"')
  })

  it('une enseigne qui ne le permet pas (Auchan a son propre parcours) : l’envoi s’arrête, même guidé', async () => {
    const w = world({ accepts: false })
    const storage = fakeStorage({ [GUIDE_KEY]: `${RUN_ID}|1|store` })
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['error'])
    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
  })

  it('une page dont l’hôte n’est pas celui d’un magasin de l’enseigne : jamais offerte, l’envoi s’arrête', async () => {
    const w = world({ page: { id: '000456', host: 'evil.example.invalid' } })
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['error'])
    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
    expect(sent[0]).not.toHaveProperty('chosenStore')
  })

  it('une page qui a le magasin du plan : aucune carte, le passage a lieu', async () => {
    const w = world({ page: { ...STORE } })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    await flow.start(FARINE)

    expect(screens.screens()).not.toContain('chosenStore')
    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
  })
})
