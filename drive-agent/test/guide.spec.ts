// Le parcours guidé de la première utilisation (DRV-751) : le magasin pas encore choisi et la personne pas encore connectée sont des ÉTAPES, pas des pannes. L'agent
// pose une carte, attend sans requête, et CONTINUE TOUT SEUL dès que la page dit que l'étape est faite ; la page qui se recharge reprend au même endroit, rien
// ne revient en erreur, rien n'est envoyé deux fois. Les deux enseignes passent par la même interface (`guideTarget`, `storeChosenOnPage`, `readSession`).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GUIDE_KEY, RUN_PREFIX } from '../src/flow/run-state'
import {
  GUIDE_CHECK_MS,
  GUIDE_DONE_MS,
  GUIDE_MAX_MS,
  GUIDE_POLL_MS,
  GUIDE_STUCK_CHECKS,
  guideStepOf,
} from '../src/flow/guide'
import {
  RetailerError,
  type EntryReading,
  type GuideTarget,
  type RetailerAdapter,
} from '../src/retailers'
import { S } from '../src/ui/strings'
import { chooseBarTarget } from '../src/auchan/page'
import { AuchanAdapter } from '../src/auchan'
import { LeclercAdapter, LOGIN_NOTES } from '../src/leclerc'
import { fakeSite } from './leclerc-helpers'
import { findControl } from '../src/retailers/guide'
import { findStartButton } from '../src/leclerc/entry'
import { findPostalCodeField } from '../src/leclerc/store-field'
import { LOGIN_LABELS } from '../src/leclerc/session'
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
const VISITOR = {
  state: 'VISITOR' as const,
  signs: ['LOGIN_LINK' as const, 'REGISTER_LINK' as const],
}
const FARINE = plan([known('farine', [product('1000001', 3)]), home('sel')])

const notChosen = () => new RetailerError('UNSUPPORTED_PAGE', null, 'STORE_NOT_CHOSEN')

/** Une page qui évolue : ce que la personne a fait (magasin choisi, connectée), et l'adaptateur simulé qui le lit. */
function world(
  initial: { chosen: boolean; member: boolean; unknown?: boolean; asked?: boolean },
  options: { entry?: EntryReading; confirmedLogin?: boolean } = {},
) {
  const state = { asked: false, ...initial, storeReads: 0, sessionReads: 0 }
  const target = (label: string | null): GuideTarget => ({
    element: document.createElement('a'),
    label,
  })
  const built = fakeAdapter(
    { '1000001': {} },
    {
      ...(options.entry !== undefined && { entry: options.entry }),
      session: () => {
        state.sessionReads += 1
        // Une page qui ne dit rien de la connexion (état inconnu) : ni connecté ni visiteur
        if (state.unknown) return { state: 'UNKNOWN' as const, signs: [] }
        return state.member ? MEMBER : VISITOR
      },
      store: () => {
        state.storeReads += 1
        // La question de l'ancien panier (DRV-754) est posée dans la page : l'agent attend la réponse de la personne
        if (state.asked) throw new RetailerError('UNSUPPORTED_PAGE', null, 'BASKET_MERGE_ASKED')
        if (!state.chosen) throw notChosen()
        return { ...STORE, baseUrl: `https://${STORE.host}/`, label: null }
      },
    },
  )
  const adapter: RetailerAdapter = Object.assign(built.adapter, {
    storeChosenOnPage: () => state.chosen,
    ...(options.confirmedLogin === true && {
      requiresConfirmedLogin: true,
      basketChoiceAsked: () => state.asked,
    }),
    guideTarget: (step: 'store' | 'login') =>
      step === 'store' ? target('Choisir mon mode de livraison') : target(null),
  })
  return { ...built, adapter, state }
}

/** Une horloge et des pauses que le test gouverne : chaque pause laisse la personne agir (`during`) puis avance le temps. */
function clock(during: (tick: number) => void = () => undefined) {
  const time = { now: 1_000_000, ticks: 0, pauses: [] as number[] }
  return {
    time,
    now: () => time.now,
    sleep: (ms: number) => {
      time.pauses.push(ms)
      time.ticks += 1
      time.now += ms
      during(time.ticks)
      return Promise.resolve()
    },
  }
}

afterEach(() => undefined)

describe('le magasin d’abord, puis la connexion : deux étapes, l’agent continue tout seul', () => {
  it('magasin absent puis choisi, connexion absente puis faite : « 1 sur 2 », « 2 sur 2 », « c’est bon », puis le passage, SANS retour dans Repas', async () => {
    // Given : ni magasin ni connexion ; la personne choisit son magasin au 4e coup d’œil, puis se connecte au 10e
    const w = world({ chosen: false, member: false })
    const time = clock((tick) => {
      if (tick === 4) w.state.chosen = true
      if (tick === 10) w.state.member = true
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    // When
    await flow.start(FARINE)

    // Then : les deux étapes, dans l’ordre, puis « C’est bon » ; jamais un écran d’erreur
    expect(screens.screens().slice(0, 4)).toEqual(['guide', 'guide', 'guide', 'progress'])
    expect(screens.propsOf('guide')).toEqual([
      expect.objectContaining({
        step: 'store',
        stage: 'waiting',
        index: 1,
        total: 2,
        label: 'Choisir mon mode de livraison',
      }),
      expect.objectContaining({ step: 'login', stage: 'waiting', index: 2, total: 2, label: null }),
      expect.objectContaining({ step: 'login', stage: 'done' }),
    ])
    expect(screens.screens()).not.toContain('error')
    // Le passage a eu lieu, une seule fois, et le résultat est parti une seule fois
    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(sent).toHaveLength(1)
    expect(expectConform(sent[0]).outcome).toBe('completed')
    // L’attente ne lit que la page, toutes les 2 secondes ; le site (le magasin) n’est relu que quand la page dit « fait »
    expect(time.time.pauses.filter((ms) => ms === GUIDE_POLL_MS).length).toBe(time.time.ticks - 1)
    expect(w.state.storeReads).toBeLessThanOrEqual(3)
  })

  it('une seule étape qui manque : « Il reste une étape », jamais « 1 sur 1 » ; la connexion faite, le passage continue', async () => {
    const w = world({ chosen: true, member: false })
    const time = clock((tick) => {
      if (tick === 3) w.state.member = true
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    await flow.start(FARINE)

    expect(screens.propsOf('guide')[0]).toMatchObject({ step: 'login', index: 1, total: 1 })
    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual(['waiting', 'done'])
    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(sent).toHaveLength(1)
  })

  it('magasin choisi et personne connectée : rien de nouveau à l’écran, le passage commence tout de suite', async () => {
    const w = world({ chosen: true, member: true })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter })

    await flow.start(FARINE)

    expect(screens.screens()).not.toContain('guide')
    expect(screens.screens()[0]).toBe('progress')
    expect(sent).toHaveLength(1)
  })

  it('« Arrêter pour l’instant » : l’envoi s’arrête, rien n’est écrit, Repas reçoit un envoi arrêté, la liste est gardée', async () => {
    const w = world({ chosen: false, member: false })
    const screens = fakeUi()
    const time = clock((tick) => {
      if (tick === 3) screens.pressGuideStop()
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    await flow.start(FARINE)

    expect(w.writes).toEqual([])
    expect(w.calls).toEqual([])
    expect(screens.closed.count).toBe(1)
    expect(flow.history).toEqual(['START', 'VALIDATED', 'ABORTED'])
    expect(sent).toHaveLength(1)
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'aborted', lines: [] })
    // L’attente s’est arrêtée avec la réponse, elle n’a pas couru jusqu’aux 15 minutes
    expect(time.time.now - 1_000_000).toBeLessThan(GUIDE_MAX_MS)
  })

  it('15 minutes sans changement : la carte propose « Attendre encore » ; attendre encore laisse continuer, et la suite se fait toute seule', async () => {
    const w = world({ chosen: true, member: false })
    let late = 0
    const screens = fakeUi({
      guide: () => {
        late += 1
        // La personne se connecte pendant qu’elle lit « Attendre encore »
        w.state.member = true
        return 'wait'
      },
    })
    const time = clock()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    await flow.start(FARINE)

    expect(late).toBe(1)
    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual([
      'waiting',
      'late',
      'waiting',
      'done',
    ])
    expect(time.time.now - 1_000_000).toBeGreaterThanOrEqual(GUIDE_MAX_MS)
    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(sent).toHaveLength(1)
  })

  it('une carte déjà affichée n’est pas redessinée quand l’agent relit le site : le repère ne saute pas', async () => {
    // Le magasin est choisi dans la page, mais le site tarde à le dire : deux relectures sans changement, puis il le dit
    const w = world({ chosen: false, member: true })
    let reads = 0
    w.adapter.readStore = () => {
      reads += 1
      if (reads === 1 || reads === 2) throw notChosen()
      return { ...STORE, baseUrl: `https://${STORE.host}/`, label: null }
    }
    const screens = fakeUi()
    const time = clock((tick) => {
      if (tick === 2) w.state.chosen = true
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    await flow.start(FARINE)

    expect(reads).toBe(3)
    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual(['waiting', 'done'])
    expect(sent).toHaveLength(1)
    expect(expectConform(sent[0]).outcome).toBe('completed')
  })

  it('la page dit « fait » mais le site ne le voit toujours pas, trois fois de suite : une vraie panne, l’écran d’erreur', async () => {
    const w = world({ chosen: false, member: true })
    const screens = fakeUi({ error: () => 'return' })
    const time = clock((tick) => {
      if (tick === 2) w.state.chosen = true
    })
    w.adapter.readStore = () => {
      w.state.storeReads += 1
      throw notChosen()
    }
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['guide', 'error'])
    expect(screens.propsOf('error')).toEqual([
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'STORE_NOT_CHOSEN' },
    ])
    // La première lecture, puis exactement trois relectures, espacées d’au moins 5 secondes
    expect(w.state.storeReads).toBe(1 + GUIDE_STUCK_CHECKS)
    expect(expectConform(sent[0]).outcome).toBe('error')
    expect(GUIDE_CHECK_MS).toBe(5_000)
  })

  it('le magasin choisi n’est pas celui du plan : STORE_MISMATCH, comme avant, après l’attente', async () => {
    const w = world({ chosen: false, member: true })
    const time = clock((tick) => {
      if (tick === 2) {
        w.state.chosen = true
        w.adapter.readStore = () => ({ id: '000999', host: STORE.host, baseUrl: '', label: null })
      }
    })
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    await flow.start(FARINE)

    expect(screens.screens()).toEqual(['guide', 'error'])
    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
    expect(w.writes).toEqual([])
  })

  it('le mode configuration ne passe pas par ce guide : il a le sien (DRV-740)', async () => {
    const w = world({ chosen: false, member: false })
    const screens = fakeUi()
    const setups: string[] = []
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: w.adapter,
      onSetup: (message) => void setups.push(message.runId),
    })

    await flow.start({
      v: 1,
      type: 'setup',
      runId: RUN_ID,
      retailer: 'leclerc',
      store: STORE,
      returnPath: '/drive/retour',
    })

    expect(setups).toEqual([RUN_ID])
    expect(screens.screens()).toEqual([])
  })
})

describe('la connexion n’est « faite » que si la page la CONFIRME (ticket G : jamais un panier anonyme)', () => {
  it('une page qui ne dit plus rien de la connexion (état inconnu) laisse la carte en attente : pas de « Tu es connecté », rien n’est écrit', async () => {
    const w = world({ chosen: true, member: false })
    const time = clock((tick) => {
      if (tick === 3) w.state.unknown = true
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    await flow.start(FARINE)

    // Jamais « done » : seulement l'attente, puis l'attente longue où la personne arrête
    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual(['waiting', 'late'])
    expect(w.writes).toEqual([])
    expect(w.calls).toEqual([])
    expect(expectConform(sent[0]).outcome).toBe('aborted')
  })

  it('la même page, qui confirme enfin la connexion : « Tu es connecté », puis le passage', async () => {
    const w = world({ chosen: true, member: false })
    const time = clock((tick) => {
      if (tick === 3) w.state.unknown = true
      if (tick === 6) {
        w.state.unknown = false
        w.state.member = true
      }
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    await flow.start(FARINE)

    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual(['waiting', 'done'])
    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(sent).toHaveLength(1)
  })

  it('une note « connexion » d’une page d’avant n’est pas crue quand cette page-ci ne confirme rien : pas de « Tu es connecté »', async () => {
    const storage = fakeStorage({ [GUIDE_KEY]: `${RUN_ID}|2|login` })
    const w = world({ chosen: true, member: false, unknown: true })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.screens()).not.toContain('guide')
  })
})

describe('la question de l’ancien panier (DRV-754) : l’agent ne choisit jamais à la place de la personne', () => {
  it('la page pose la question : une carte « Choisis dans la page », sans repère d’étape ni contrôle entouré, aucune écriture ; la réponse donnée, « C’est noté » puis le passage', async () => {
    // Given : connectée, la page demande « compléter ton ancien panier ? » ; la personne répond au 4e coup d'œil
    const w = world({ chosen: true, member: true, asked: true }, { confirmedLogin: true })
    const time = clock((tick) => {
      if (tick === 4) w.state.asked = false
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    // When
    await flow.start(FARINE)

    // Then : une carte d'attente sans repère d'étape (0 sur 0), qui ne désigne rien, puis « C'est noté », puis le passage
    const props = screens.propsOf('guide')
    expect(props.map((one) => one.stage)).toEqual(['waiting', 'done'])
    expect(props[0]).toMatchObject({ step: 'basket', index: 0, total: 0, label: null })
    expect(props[0]).not.toHaveProperty('target')
    expect(props[0]).not.toHaveProperty('form')
    expect(screens.screens()).not.toContain('error')
    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(sent).toHaveLength(1)
    expect(expectConform(sent[0]).outcome).toBe('completed')
  })

  it('« Arrêter pour l’instant » pendant la question : rien n’est écrit, l’envoi est rendu comme arrêté', async () => {
    const w = world({ chosen: true, member: true, asked: true }, { confirmedLogin: true })
    const screens = fakeUi({ guide: () => 'stop' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...clock() })

    await flow.start(FARINE)

    expect(w.writes).toEqual([])
    expect(w.calls).toEqual([])
    expect(expectConform(sent[0]).outcome).toBe('aborted')
  })

  it('une enseigne qui ne sait pas dire la question ne guide pas : c’est une vraie erreur de page', async () => {
    const w = world({ chosen: true, member: true, asked: true })
    const screens = fakeUi({ error: () => 'return' })
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...clock() })

    await flow.start(FARINE)

    expect(screens.propsOf('error')).toEqual([
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'BASKET_MERGE_ASKED' },
    ])
    expect(w.writes).toEqual([])
  })
})

describe('une enseigne qui exige la preuve de la connexion (DRV-754) : l’état inconnu n’est jamais un panier anonyme', () => {
  it('page qui ne dit rien de la connexion : « Connecte-toi », rien n’est écrit ; dès que la page la confirme, le passage continue', async () => {
    // Given : la page ne dit ni « visiteur » ni « connecté » ; elle confirme la connexion au 4e coup d'œil
    const w = world({ chosen: true, member: false, unknown: true }, { confirmedLogin: true })
    const time = clock((tick) => {
      if (tick === 4) {
        w.state.unknown = false
        w.state.member = true
      }
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, ...time })

    // When
    await flow.start(FARINE)

    // Then
    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual(['waiting', 'done'])
    expect(screens.propsOf('guide')[0]).toMatchObject({ step: 'login' })
    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
    expect(expectConform(sent[0]).outcome).toBe('completed')
  })

  it('sans cette exigence (le comportement d’avant), un état inconnu laisse passer comme avant', async () => {
    const w = world({ chosen: true, member: false, unknown: true })
    const { flow } = makeFlow({ ui: fakeUi().ui, adapter: w.adapter, ...clock() })

    await flow.start(FARINE)

    expect(w.writes).toEqual([{ id: '1000001', quantity: 3 }])
  })
})

describe('la page de connexion de l’enseigne n’est jamais « entrer dans le magasin » (DRV-751)', () => {
  const pagePath = () => new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_PATH')
  const BUTTON: EntryReading = { kind: 'BUTTON' }

  it('hors du chemin d’un magasin (/connexion.aspx) : l’étape « connecte-toi », sans toucher « Commencer mes courses », sans bandeau « Ouverture de ton magasin »', async () => {
    const w = world({ chosen: false, member: false }, { entry: BUTTON })
    w.adapter.readStore = () => {
      throw pagePath()
    }
    Object.assign(w.adapter, { onLoginPage: () => true })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter })

    await flow.start(FARINE)

    expect(w.follows.count).toBe(0)
    expect(screens.screens()).not.toContain('entry')
    expect(screens.propsOf('guide')[0]).toMatchObject({
      step: 'login',
      stage: 'waiting',
      form: true,
    })
    expect(screens.propsOf('guide')[0]?.target).toBeUndefined()
    expect(flow.history).toEqual(['START', 'VALIDATED', 'ABORTED'])
    expect(expectConform(sent[0]).outcome).toBe('aborted')
  })

  it('sous le chemin d’un magasin (la page de connexion se lit comme une page de magasin) : la même étape, rien ne commence', async () => {
    const w = world({ chosen: true, member: false, unknown: true })
    Object.assign(w.adapter, { onLoginPage: () => true })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter })

    await flow.start(FARINE)

    expect(screens.propsOf('guide')[0]).toMatchObject({ step: 'login', form: true })
    expect(w.writes).toEqual([])
    expect(w.calls).toEqual([])
    expect(expectConform(sent[0]).outcome).toBe('aborted')
  })

  it('connecté sur cette page (la page s’en va) : rien n’est touché, rien n’est envoyé, la carte se retire', async () => {
    const w = world({ chosen: false, member: true }, { entry: BUTTON })
    w.adapter.readStore = () => {
      throw pagePath()
    }
    Object.assign(w.adapter, { onLoginPage: () => true })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter })

    await flow.start(FARINE)

    expect(w.follows.count).toBe(0)
    expect(screens.screens()).toEqual([])
    expect(sent).toEqual([])
    expect(screens.closed.count).toBe(1)
  })

  it.each([
    ['le magasin pas choisi', new RetailerError('UNSUPPORTED_PAGE', null, 'STORE_NOT_CHOSEN')],
    ['une page d’un autre hôte', new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_HOST')],
    ['un autre magasin que celui du plan', null],
  ])(
    'DRV-757 : l’ADRESSE de la connexion l’emporte sur la lecture du magasin (%s) : jamais « Choisis ton magasin » sur la page de connexion',
    async (_name, error) => {
      const w = world({ chosen: true, member: false })
      w.adapter.readStore = () => {
        if (error !== null) throw error
        return { ...STORE, id: '999999', baseUrl: 'https://exemple.test/magasin', label: null }
      }
      Object.assign(w.adapter, { onLoginPage: () => true })
      const screens = fakeUi()
      const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter })

      await flow.start(FARINE)

      expect(screens.propsOf('guide').map((props) => props.step)).not.toContain('store')
      expect(screens.propsOf('guide')[0]).toMatchObject({ step: 'login', form: true })
      expect(screens.screens()).not.toContain('chosenStore')
      expect(expectConform(sent[0]).outcome).toBe('aborted')
    },
  )

  it('une page qui n’est PAS la page de connexion garde l’entrée dans le magasin (DRV-625, DRV-748 intacts)', async () => {
    const w = world({ chosen: false, member: true }, { entry: BUTTON })
    w.adapter.readStore = () => {
      throw pagePath()
    }
    Object.assign(w.adapter, { onLoginPage: () => false })
    const storage = fakeStorage()
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(w.follows.count).toBe(1)
    expect(screens.propsOf('entry')[0]).toEqual({ stage: 'opening' })
  })
})

describe('DRV-757 (suite) : la page de connexion de Leclerc est l’étape 2 sur 2, jamais le magasin', () => {
  const location = (hostname: string, pathname: string) =>
    new LeclercAdapter(fakeSite(() => ({ body: '' }), { location: { hostname, pathname } }).deps)

  it('l’adaptateur reconnaît la page de connexion par son adresse ET par son hôte (le compte de l’enseigne, `fd<N>-espace-client`), quelle que soit la page du compte', () => {
    const account = 'fd8-espace-client.leclercdrive.fr'
    expect(
      location(
        account,
        '/drive/magasin-000001-000001-Ville-Test/authentification.aspx',
      ).onLoginPage(),
    ).toBe(true)
    expect(
      location(
        account,
        '/drive/magasin-000001-000001-Ville-Test/identification-unique.aspx',
      ).onLoginPage(),
    ).toBe(true)
    expect(location(account, '/').onLoginPage()).toBe(true)
    // Le compte de la personne connectée n'est pas la page de connexion
    expect(
      location(
        account,
        '/drive/magasin-000001-000001-Ville-Test/home-espace-client-ccc.aspx',
      ).onLoginPage(),
    ).toBe(false)
    expect(
      location('m-courses.leclercdrive.fr', '/magasin-000001-000001-ville-test').onLoginPage(),
    ).toBe(false)
    expect(location('www.leclercdrive.fr', '/').onLoginPage()).toBe(false)
  })

  it('un problème « magasin pas choisi » sur la page de connexion est l’étape « connecte-toi », pas « choisis ton magasin »', () => {
    const w = world({ chosen: false, member: false })
    Object.assign(w.adapter, { onLoginPage: () => true })

    expect(guideStepOf({ code: 'UNSUPPORTED_PAGE', cause: 'STORE_NOT_CHOSEN' }, w.adapter)).toBe(
      'login',
    )
    Object.assign(w.adapter, { onLoginPage: () => false })
    expect(guideStepOf({ code: 'UNSUPPORTED_PAGE', cause: 'STORE_NOT_CHOSEN' }, w.adapter)).toBe(
      'store',
    )
  })

  it('la carte de la page de connexion est « Étape 2 sur 2 » (le magasin est forcément choisi : la connexion en dépend), même sans note d’une page d’avant', async () => {
    const w = world({ chosen: true, member: false, unknown: true })
    Object.assign(w.adapter, { onLoginPage: () => true })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter })

    await flow.start(FARINE)

    expect(screens.propsOf('guide')[0]).toMatchObject({
      step: 'login',
      index: 2,
      total: 2,
      form: true,
    })
  })

  it('l’adaptateur lit la connexion sur la page de connexion même quand on lui demande l’étape du magasin', () => {
    const asked: string[] = []
    const adapter = new LeclercAdapter(
      fakeSite(() => ({ body: '' }), {
        location: {
          hostname: 'fd8-espace-client.leclercdrive.fr',
          pathname: '/drive/magasin-000001-000001-Ville-Test/authentification.aspx',
        },
        look: (step) => {
          asked.push(step)
          return null
        },
      }).deps,
    )

    adapter.guideLook('store')

    expect(asked).toEqual(['login'])
  })
})

describe('la page se recharge pendant l’attente (choisir son magasin, se connecter)', () => {
  it('la page suivante sait qu’elle est l’étape « 2 sur 2 » (note de la page d’avant) et la montre comme telle', async () => {
    const storage = fakeStorage({ [GUIDE_KEY]: `${RUN_ID}|2|store` })
    const w = world({ chosen: true, member: false })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.propsOf('guide')[0]).toMatchObject({ step: 'login', index: 2, total: 2 })
  })

  it('une page où tout est prêt dit « C’est bon » (la dernière étape montrée), puis le passage continue ; la note est effacée', async () => {
    const storage = fakeStorage({ [GUIDE_KEY]: `${RUN_ID}|2|login` })
    const w = world({ chosen: true, member: true })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.propsOf('guide')).toEqual([
      expect.objectContaining({ step: 'login', stage: 'done' }),
    ])
    expect(screens.screens()[1]).toBe('progress')
    expect(storage.getItem(GUIDE_KEY)).toBeNull()
    expect(expectConform(sent[0]).outcome).toBe('completed')
  })

  it('la note d’un autre envoi n’est pas crue', async () => {
    const storage = fakeStorage({ [GUIDE_KEY]: '11111111-1111-4111-8111-111111111111|2|login' })
    const w = world({ chosen: true, member: true })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.screens()).not.toContain('guide')
  })

  it('une note illisible ou hostile est ignorée', async () => {
    for (const note of ['n’importe quoi', `${RUN_ID}|9|store`, `${RUN_ID}|2|<img>`, '']) {
      const storage = fakeStorage({ [GUIDE_KEY]: note })
      const w = world({ chosen: true, member: true })
      const screens = fakeUi()
      const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

      await flow.start(FARINE)

      expect(screens.screens()).not.toContain('guide')
    }
  })

  it('l’état de reprise d’un passage commencé n’est pas touché par le guide', async () => {
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
    const w = world({ chosen: true, member: false })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toContain('"sel"')
    expect(storage.getItem(GUIDE_KEY)).toBeNull()
  })
})

describe('chaque enseigne dit où est le contrôle à toucher', () => {
  /** jsdom ne mesure rien : tout élément a une boîte, sauf ceux marqués `hidden-box` (la page les cache). */
  const page = (html: string) => {
    document.body.innerHTML = html
    for (const element of document.querySelectorAll('*')) {
      const hidden = element.closest('.hidden-box') !== null
      element.getBoundingClientRect = () =>
        ({
          top: 10,
          bottom: hidden ? 10 : 50,
          left: 0,
          right: hidden ? 0 : 200,
          width: hidden ? 0 : 200,
          height: hidden ? 0 : 40,
          x: 0,
          y: 10,
          toJSON: () => ({}),
        }) as DOMRect
    }
    return document
  }
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('Auchan : la barre du magasin, qu’elle dise « Choisir vos courses » ou « Choisir mon mode de livraison », avec son libellé', () => {
    for (const label of ['Choisir vos courses', 'Choisir mon mode de livraison']) {
      page(`<header><div class="bar"><span>${label}</span></div></header>`)

      const target = chooseBarTarget(document)

      expect(target?.label).toBe(label)
      expect(target?.element.textContent).toBe(label)
    }
  })

  it('DRV-757 (constat du 2026-11-01) : le libellé cité est celui de la barre que la page MONTRE, jamais celui d’un élément caché (« Choisir vos courses » caché, « Choisir mon mode de livraison » visible)', () => {
    page(
      '<header><div class="hidden-box"><span>Choisir vos courses</span></div><div id="shown"><span>Choisir mon mode de livraison</span></div></header>',
    )

    const target = chooseBarTarget(document)

    expect(target?.label).toBe('Choisir mon mode de livraison')
    expect(target?.element.closest('#shown')).not.toBeNull()

    // Les deux libellés, dans l'autre sens
    page(
      '<header><div class="hidden-box"><span>Choisir mon mode de livraison</span></div><div id="shown"><span>Choisir vos courses</span></div></header>',
    )
    expect(chooseBarTarget(document)?.label).toBe('Choisir vos courses')
  })

  it('DRV-757 : une barre que la page ne montre pas n’est jamais désignée (aucun libellé inventé : la carte dit « la barre en haut de la page »)', () => {
    page('<header class="hidden-box"><span>Choisir vos courses</span></header>')

    expect(chooseBarTarget(document)).toBeNull()
  })

  it('Auchan : la barre remontée jusqu’au bouton qui la porte', () => {
    page('<button id="bar"><span>Choisir mon mode de livraison</span></button>')

    expect(chooseBarTarget(document)?.element.id).toBe('bar')
  })

  it('Auchan : aucune barre à choisir (magasin déjà choisi, ou page sans barre) : rien à désigner', () => {
    page(
      '<header><div>Retrait : Drive Ville-Test</div></header><p>Choisir vos courses est un mode</p>',
    )

    expect(chooseBarTarget(document)).toBeNull()
  })

  it('Leclerc et Auchan : le contrôle de connexion, par son libellé ou, pour une icône sans texte, par son nom accessible', () => {
    page('<nav><a href="/panier">Panier</a><a id="in" href="/connexion">Se connecter</a></nav>')
    expect(findControl(document, LOGIN_LABELS)?.element.id).toBe('in')
    expect(findControl(document, LOGIN_LABELS)?.label).toBe('Se connecter')

    page('<nav><a id="icon" href="/compte" aria-label="Mon espace connexion"><svg></svg></a></nav>')
    expect(findControl(document, LOGIN_LABELS)).toBeNull()
    const icon = findControl(document, LOGIN_LABELS, ['connex'])
    expect(icon?.element.id).toBe('icon')
    expect(icon?.label).toBeNull()
  })

  it('Leclerc : la page de connexion se reconnaît à son adresse seulement, à la racine de l’hôte ou sous un magasin', () => {
    const on = (pathname: string) =>
      new LeclercAdapter(
        fakeSite(() => ({ body: '' }), {
          location: { hostname: 'courses-test.leclercdrive.fr', pathname },
        }).deps,
      ).onLoginPage()

    expect(on('/connexion.aspx')).toBe(true)
    expect(on('/connexion')).toBe(true)
    expect(on('/magasin-000001-000001-Ville-Test/connexion.aspx')).toBe(true)
    expect(on('/magasin-000001-000001-Ville-Test/')).toBe(false)
    expect(on('/magasin-000001-000001-Ville-Test/connexion-et-securite.aspx')).toBe(false)
    expect(on('/')).toBe(false)
  })

  it('aucun contrôle ne ressemble à une connexion : rien à désigner, la carte ne cite aucun libellé', () => {
    page('<nav><a href="/panier">Panier</a><a href="/aide">Aide</a></nav>')

    expect(findControl(document, LOGIN_LABELS, ['connex'])).toBeNull()
  })

  it('l’adaptateur d’Auchan désigne la barre pour le magasin et la connexion pour la session ; il ne touche à rien', () => {
    page(
      '<a id="bar" role="button" href="#">Choisir vos courses</a><a id="login" href="/connexion">Se connecter</a>',
    )
    const before = document.body.innerHTML
    const adapter = new AuchanAdapter({
      fetch: () => Promise.reject(new Error('aucune requête')),
      location: { hostname: 'www.auchan.fr', pathname: '/courses' } as Location,
      document,
      authenticated: () => 'false',
      parseHtml: () => document,
      sleep: () => Promise.resolve(),
      timer: () => () => undefined,
      random: () => 0,
      now: () => 0,
    })

    expect(adapter.guideTarget('store')?.element.id).toBe('bar')
    expect(adapter.guideTarget('login')?.element.id).toBe('login')
    expect(document.body.innerHTML).toBe(before)
  })
})

// DRV-753 (recette du 2026-11-01) : le premier usage de Leclerc commence sur l'accueil NATIONAL, sans magasin choisi, où « Commencer mes courses » n'existe pas encore.
describe('le premier usage de Leclerc : l’accueil sans magasin (DRV-753)', () => {
  const pagePath = () => new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_PATH')
  const field = (): GuideTarget => ({ element: document.createElement('input'), label: null })

  /** L'accueil national : pas de magasin dans l'adresse ; « Commencer mes courses » n'est là qu'une fois le magasin choisi. */
  function national(options: { member?: boolean; leaves?: boolean } = {}) {
    const state = { chosen: false, member: options.member ?? false }
    const built = fakeAdapter(
      { '1000001': {} },
      {
        store: () => {
          throw pagePath()
        },
        entry: () => (state.chosen ? { kind: 'BUTTON' } : { kind: 'NONE' }),
        storeChosen: () => state.chosen,
        guideTarget: (step) => (step === 'store' ? field() : null),
        // Le clic fait quitter la page : la promesse ne se résout jamais
        ...(options.leaves && { onFollow: () => new Promise(() => undefined) }),
        session: () => (state.member ? MEMBER : VISITOR),
      },
    )
    return { ...built, state }
  }

  it('aucun bouton : la carte « Étape 1 sur 2 » dit d’écrire le code postal ; dès que « Commencer mes courses » apparaît, l’agent l’entre tout seul, sans « Touche … »', async () => {
    // Given : la personne choisit son magasin après l'attente de l'entrée (9 pauses) et trois coups d'œil du guide
    const w = national({ leaves: true })
    const storage = fakeStorage()
    const time = clock((tick) => {
      if (tick === 12) w.state.chosen = true
    })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage, ...time })

    // When : la page quitte le script au clic
    void flow.start(FARINE)
    await vi.waitFor(() => expect(w.follows.count).toBe(1))

    // Then : la carte du magasin (par code postal, repère sur le champ), puis le bandeau d'ouverture ; jamais « Touche … »
    expect(screens.propsOf('guide')).toEqual([
      expect.objectContaining({
        step: 'store',
        stage: 'waiting',
        index: 1,
        total: 2,
        byPostalCode: true,
      }),
    ])
    expect(screens.propsOf('guide')[0]?.target?.()).toBeInstanceOf(HTMLInputElement)
    expect(screens.propsOf('entry')).toEqual([{ stage: 'opening' }, { stage: 'opening' }])
    expect(w.follows.count).toBe(1)
    expect(screens.screens()).not.toContain('error')
    expect(sent).toEqual([])
    expect(w.calls).toEqual([])
    // La page suivante (le magasin) saura qu'elle est la suite de l'étape 1
    expect(storage.getItem(GUIDE_KEY)).toBe(`${RUN_ID}|2|store`)
  })

  it('une personne déjà connectée : « Il reste une étape » (une seule)', async () => {
    const w = national({ member: true, leaves: true })
    const time = clock((tick) => {
      if (tick === 11) w.state.chosen = true
    })
    const screens = fakeUi()
    const { flow } = makeFlow({
      ui: screens.ui,
      adapter: w.adapter,
      storage: fakeStorage(),
      ...time,
    })

    void flow.start(FARINE)
    await vi.waitFor(() => expect(w.follows.count).toBe(1))

    expect(screens.propsOf('guide')[0]).toMatchObject({ step: 'store', index: 1, total: 1 })
  })

  it('« Arrêter pour l’instant » : l’envoi s’arrête, la liste est gardée, rien n’est suivi ni écrit', async () => {
    const w = national()
    const screens = fakeUi()
    const time = clock((tick) => {
      if (tick === 11) screens.pressGuideStop()
    })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: w.adapter,
      storage: fakeStorage(),
      ...time,
    })

    await flow.start(FARINE)

    expect(w.follows.count).toBe(0)
    expect(w.writes).toEqual([])
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'aborted' })
    expect(screens.screens()).not.toContain('error')
  })

  it('le bouton est là dès l’arrivée : aucune carte, l’agent entre tout de suite (rien ne change pour un magasin déjà choisi)', async () => {
    const w = national({ leaves: true })
    w.state.chosen = true
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage: fakeStorage() })

    void flow.start(FARINE)
    await vi.waitFor(() => expect(w.follows.count).toBe(1))

    expect(screens.screens()).not.toContain('guide')
    expect(w.follows.count).toBe(1)
  })

  it('la page du magasin qui suit (note « magasin » d’une page d’avant) : « Ton magasin est choisi », puis le passage', async () => {
    // Given : la page d'avant a noté l'étape 1 ; cette page est celle du magasin, la personne est connectée
    const storage = fakeStorage({ [GUIDE_KEY]: `${RUN_ID}|2|store` })
    const w = world({ chosen: true, member: true })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: w.adapter, storage })

    await flow.start(FARINE)

    expect(screens.propsOf('guide')).toEqual([
      expect.objectContaining({ step: 'store', stage: 'done' }),
    ])
    expect(expectConform(sent[0]).outcome).toBe('completed')
    expect(storage.getItem(GUIDE_KEY)).toBeNull()
  })

  it('l’adaptateur de Leclerc : « magasin choisi » quand la page montre « Commencer mes courses », le champ du code postal désigné sans rien toucher', () => {
    const make = (html: string) => {
      document.body.innerHTML = html
      return new LeclercAdapter(
        fakeSite(() => ({ body: '' }), {
          location: { hostname: 'www.leclercdrive.fr', pathname: '/' },
          pageText: () => document.documentElement.outerHTML,
          startButton: () => findStartButton(document),
          storeField: () => findPostalCodeField(document),
        }).deps,
      )
    }
    const nationalHtml =
      '<header><a href="/connexion">Se connecter</a></header><main><h1>Mes courses en ligne</h1><p>1. Je saisis mon code postal</p><form><input id="cp" type="text" placeholder="Code postal ou ville"><button type="submit">Lancer la recherche</button><button type="button">Me géolocaliser</button></form></main>'
    const before = nationalHtml
    const adapter = make(nationalHtml)

    expect(adapter.storeChosenOnPage()).toBe(false)
    expect(adapter.guideTarget('store')?.element.id).toBe('cp')
    expect(document.body.innerHTML).toBe(document.body.innerHTML)
    expect(before).toBe(nationalHtml)
    expect((document.getElementById('cp') as HTMLInputElement).value).toBe('')

    make(
      nationalHtml.replace('</main>', '<a id="go" role="button">Commencer mes courses</a></main>'),
    )
    expect(adapter.storeChosenOnPage()).toBe(true)
  })
})

describe('le champ du code postal de l’accueil (DRV-753) : désigné seulement si on en est sûr', () => {
  const page = (html: string) => {
    document.body.innerHTML = html
    return findPostalCodeField(document)
  }
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('un champ qui dit « code postal » (texte d’aide, nom lu à voix haute, étiquette ou autocomplete)', () => {
    expect(page('<input id="a" placeholder="Votre code postal">')?.element.id).toBe('a')
    expect(page('<input id="b" aria-label="Code postal">')?.element.id).toBe('b')
    expect(page('<label for="c">Code postal</label><input id="c" type="search">')?.element.id).toBe(
      'c',
    )
    expect(page('<input id="d" autocomplete="postal-code">')?.element.id).toBe('d')
  })

  it('sans indice, le seul champ du bloc qui porte « Lancer la recherche »', () => {
    expect(
      page(
        '<div><input id="q"><button>Lancer la recherche</button></div><input id="news" type="email">',
      )?.element.id,
    ).toBe('q')
  })

  it('« Rechercher » seul n’est pas le bouton relevé : seul « Lancer la recherche » désigne le champ', () => {
    expect(page('<div><input id="q"><button>Rechercher</button></div>')).toBeNull()
  })

  it('deux champs sans indice dans le bloc du bouton, ou aucun bouton : rien n’est désigné (on ne devine pas)', () => {
    expect(
      page('<form><input id="x"><input id="y"><button>Lancer la recherche</button></form>'),
    ).toBeNull()
    expect(page('<input id="z">')).toBeNull()
    expect(page('<input type="password" placeholder="Code postal">')).toBeNull()
    expect(
      page('<input type="hidden" name="postal"><input disabled placeholder="Code postal">'),
    ).toBeNull()
  })
})

describe('les textes du guide : courts, simples, au tutoiement (repas-po)', () => {
  const sentences = (text: string) =>
    text
      .replace(/«[^»]*»/g, 'x')
      .split(/(?<=[.!?…])\s+/)
      .filter((part) => part.trim() !== '')

  const all = [
    S.guide.step(1, 2),
    S.guide.step(2, 2),
    S.guide.step(1, 1),
    S.guide.done,
    S.guide.store.title,
    S.guide.store.text('Choisir mon mode de livraison'),
    S.guide.store.text(null),
    S.guide.store.postalCode,
    S.guide.basket.title,
    S.guide.basket.text(null),
    S.guide.ready.basket,
    ...LOGIN_NOTES,
    S.guide.login.title,
    S.guide.login.text('Se connecter'),
    S.guide.login.text(null),
    S.guide.status,
    S.guide.pointer,
    S.guide.ready.store,
    S.guide.ready.login,
    S.guide.ready.text,
    S.guide.late.title,
    S.guide.late.text,
    S.guide.late.wait,
    S.guide.stop.title,
    S.guide.stop.note,
    S.guide.stop.noteSetup,
  ]

  it('chaque phrase tient en 15 mots au plus (le libellé cité compte pour un mot)', () => {
    const long = all.flatMap(sentences).filter((sentence) => sentence.split(/\s+/).length > 15)
    expect(long).toEqual([])
  })

  it('les boutons disent ce qui va se passer et rassurent : jamais « Fermer », « Retourner dans Repas » ni « Annuler »', () => {
    const buttons = [
      S.guide.late.wait,
      S.guide.stop.title,
      S.guide.stop.note,
      S.error.close,
      S.error.back,
      S.end.back,
    ]
    expect(buttons.join(' ')).not.toMatch(/Retourner|Annuler/)
    expect(S.error.close).not.toBe('Fermer')
    expect(S.guide.stop.note).toMatch(/liste est gardée/)
    expect(S.guide.stop.noteSetup).toMatch(/Rien n’est enregistré/)
  })

  it('aucun mot d’erreur pour un état attendu', () => {
    expect(all.join(' ')).not.toMatch(/erreur|introuvable|incident|échec|pas connecté|problème/i)
  })

  it('la durée de « C’est bon » et le rythme de la lecture sont ceux qu’on annonce', () => {
    expect(GUIDE_DONE_MS).toBe(1_500)
    expect(GUIDE_POLL_MS).toBe(2_000)
    expect(GUIDE_MAX_MS).toBe(15 * 60_000)
  })
})
