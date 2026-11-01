// @vitest-environment node
// Le mode configuration (DRV-307) : lire le magasin de la page et le donner à Repas. Le magasin est inventé, l'adaptateur est le vrai
// (sur une adresse simulée) ou un double ; aucun réseau.
import { describe, expect, it } from 'vitest'

import { validateResult, type ResultMessage, type SetupResultMessage } from '../protocol'
import { Flow, setupHandler, type FlowDeps } from '../src/flow'
import { STORE_WATCH_MAX_MS, STORE_WATCH_POLL_MS } from '../src/flow/setup'
import { RetailerError } from '../src/retailers'
import { LeclercAdapter, type RetailerAdapter } from '../src/leclerc'
import { fakeAdapter, fakeUi, plan, RUN_ID, STORE } from './flow-helpers'
import { fakeSite } from './leclerc-helpers'

type Sent = ResultMessage | SetupResultMessage

const { lines: _lines, type: _type, store: _store, ...HEAD } = plan([])
/** Un `setup` de Repas qui ne connaît pas encore le magasin (DRV-320) : l'agent lit celui de la page. */
const SETUP = { ...HEAD, type: 'setup' as const }

/** Un orchestrateur dont `onSetup` est le gestionnaire de l'agent, et tout ce qu'il envoie à Repas. */
function setupFlow(
  scripts: Parameters<typeof fakeUi>[0],
  adapter: RetailerAdapter,
  extra: Partial<FlowDeps> = {},
) {
  const sent: Sent[] = []
  const screens = fakeUi(scripts)
  const send = (message: Sent) => void sent.push(message)
  const flow = new Flow({
    adapter,
    ui: screens.ui,
    send,
    storage: null,
    wakeLock: null,
    now: () => 1,
    agentVersion: '0.4.0',
    canReturn: true,
    onSetup: setupHandler({ adapter, ui: screens.ui, send, agentVersion: '0.4.0' }),
    ...extra,
  })
  return { flow, sent, screens }
}

/** Une page de magasin inventée (numéro `123456`, ville `Ville-Test`), vue par le vrai adaptateur. */
function page(
  pathname = '/magasin-123456-123456-Ville-Test/recherche.aspx',
  hostname = 'fd9-courses.leclercdrive.fr',
) {
  const site = fakeSite(() => ({ status: 500 }), { location: { hostname, pathname } })
  return { site, adapter: new LeclercAdapter(site.deps) }
}

describe('lire le magasin de la page', () => {
  it('demande confirmation puis rend l’identifiant, l’hôte et l’adresse de base exacts', async () => {
    // Given : une page de magasin
    const { adapter, site } = page()
    const { flow, sent, screens } = setupFlow({ store: () => 'save' }, adapter)

    // When
    await flow.start(SETUP)

    // Then
    expect(screens.propsOf('store')).toEqual([{ id: '123456', label: null }])
    expect(sent).toEqual([
      {
        v: 1,
        type: 'setup-result',
        runId: RUN_ID,
        agentVersion: '0.4.0',
        store: {
          id: '123456',
          host: 'fd9-courses.leclercdrive.fr',
          baseUrl: 'https://fd9-courses.leclercdrive.fr/magasin-123456-123456',
          label: null,
        },
      },
    ])
    expect(validateResult(JSON.parse(JSON.stringify(sent[0])))).toEqual(sent[0])
    expect(screens.screens()).toEqual(['store'])
    expect(screens.closed.count).toBe(1)
    // Aucune requête : la page se lit dans son adresse.
    expect(site.calls).toEqual([])
  })

  it('ne rend que le magasin : aucune donnée de compte, aucune clé de plus', async () => {
    const { adapter } = page()
    const { flow, sent } = setupFlow({ store: () => 'save' }, adapter)

    await flow.start(SETUP)

    const message = sent[0] as SetupResultMessage
    expect(Object.keys(message).sort()).toEqual(['agentVersion', 'runId', 'store', 'type', 'v'])
    expect(Object.keys(message.store).sort()).toEqual(['baseUrl', 'host', 'id', 'label'])
  })

  it('garde le zéro de tête du numéro (« 001234 » n’est pas 1234)', async () => {
    const { adapter } = page('/magasin-000123-000456/accueil.aspx')
    const { flow, sent } = setupFlow({ store: () => 'save' }, adapter)

    await flow.start(SETUP)

    expect((sent[0] as SetupResultMessage).store).toMatchObject({
      id: '000123',
      baseUrl: 'https://fd9-courses.leclercdrive.fr/magasin-000123-000456',
    })
  })

  it('montre le libellé du magasin quand la page en donne un, et le rend', async () => {
    const adapter = fakeAdapter(
      {},
      {
        store: () => ({
          ...STORE,
          baseUrl: `https://${STORE.host}/magasin-${STORE.id}-${STORE.id}`,
          label: '  Magasin   de test ',
        }),
      },
    ).adapter
    const { flow, sent, screens } = setupFlow({ store: () => 'save' }, adapter)

    await flow.start(SETUP)

    expect(screens.propsOf('store')).toEqual([{ id: '000123', label: 'Magasin de test' }])
    expect((sent[0] as SetupResultMessage).store.label).toBe('Magasin de test')
  })

  it('retire du libellé du magasin les caractères invisibles et de contrôle', async () => {
    const adapter = fakeAdapter(
      {},
      {
        store: () => ({
          ...STORE,
          baseUrl: `https://${STORE.host}/magasin-000123-000123`,
          label: 'Magasin\u200B de\u202E test\uFEFF',
        }),
      },
    ).adapter
    const { flow, sent } = setupFlow({ store: () => 'save' }, adapter)

    await flow.start(SETUP)

    expect((sent[0] as SetupResultMessage).store.label).toBe('Magasin de test')
  })

  it.each([[''], ['   '], ['\u200B\uFEFF']])(
    'un libellé vide ou invisible (« %s ») devient « pas de libellé »',
    async (label) => {
      const adapter = fakeAdapter(
        {},
        {
          store: () => ({
            ...STORE,
            baseUrl: `https://${STORE.host}/magasin-000123-000123`,
            label,
          }),
        },
      ).adapter
      const { flow, sent } = setupFlow({ store: () => 'save' }, adapter)

      await flow.start(SETUP)

      expect((sent[0] as SetupResultMessage).store.label).toBeNull()
    },
  )

  it('borne un libellé trop long à 255 caractères, pour rester conforme au protocole', async () => {
    const adapter = fakeAdapter(
      {},
      {
        store: () => ({
          ...STORE,
          baseUrl: `https://${STORE.host}/magasin-000123-000123`,
          label: 'é'.repeat(300),
        }),
      },
    ).adapter
    const { flow, sent } = setupFlow({ store: () => 'save' }, adapter)

    await flow.start(SETUP)

    expect([...((sent[0] as SetupResultMessage).store.label ?? '')]).toHaveLength(255)
    validateResult(JSON.parse(JSON.stringify(sent[0])))
  })
})

describe('le magasin du message', () => {
  const PAGE = { id: '123456', host: 'fd9-courses.leclercdrive.fr' }

  it('sans magasin dans le message : on lit celui de la page', async () => {
    const { adapter } = page()
    const { flow, sent } = setupFlow({ store: () => 'save' }, adapter)

    await flow.start(SETUP)

    expect(SETUP).not.toHaveProperty('store')
    expect(sent[0]).toMatchObject({ type: 'setup-result', store: { id: PAGE.id, host: PAGE.host } })
  })

  it('avec le magasin de la page : même chemin qu’un message sans magasin', async () => {
    const { adapter } = page()
    const { flow, sent, screens } = setupFlow({ store: () => 'save' }, adapter)

    await flow.start({ ...SETUP, store: PAGE })

    expect(screens.screens()).toEqual(['store'])
    expect(sent[0]).toMatchObject({ type: 'setup-result', store: { id: PAGE.id } })
  })

  it.each([
    ['un autre identifiant', { id: '000999', host: PAGE.host }],
    ['un autre hôte', { id: PAGE.id, host: 'fd1-courses.leclercdrive.fr' }],
  ])('%s : STORE_MISMATCH, rien n’est lu ni enregistré', async (_name, store) => {
    const { adapter } = page()
    const { flow, sent, screens } = setupFlow({ error: () => 'return' }, adapter)

    await flow.start({ ...SETUP, store })

    expect(screens.screens()).toEqual(['error'])
    expect(screens.propsOf('error')).toEqual([{ code: 'STORE_MISMATCH', canReturn: true }])
    expect(sent).toEqual([
      expect.objectContaining({
        type: 'result',
        outcome: 'error',
        store: { id: store.id },
        error: expect.objectContaining({ code: 'STORE_MISMATCH' }),
      }),
    ])
    validateResult(JSON.parse(JSON.stringify(sent[0])))
    expect(screens.closed.count).toBe(1)
  })

  it('STORE_MISMATCH puis « Fermer » : rien n’est envoyé', async () => {
    const { adapter } = page()
    const { flow, sent } = setupFlow({ error: () => 'close' }, adapter)

    await flow.start({ ...SETUP, store: { id: '000999', host: PAGE.host } })

    expect(sent).toEqual([])
  })
})

describe('l’utilisateur refuse', () => {
  it('« Annuler » rend un résultat « aborted » sans ligne, sans rien enregistrer', async () => {
    const { adapter } = page()
    const { flow, sent, screens } = setupFlow({ store: () => 'cancel' }, adapter)

    await flow.start(SETUP)

    expect(sent).toEqual([
      {
        v: 1,
        type: 'result',
        runId: RUN_ID,
        agentVersion: '0.4.0',
        outcome: 'aborted',
        lines: [],
      },
    ])
    validateResult(JSON.parse(JSON.stringify(sent[0])))
    expect(screens.closed.count).toBe(1)
  })
})

describe('une page qui n’est pas celle d’un magasin', () => {
  it.each([
    ['hors du drive', '/magasin-123456-123456/accueil.aspx', 'www.exemple.invalid'],
    ['sans magasin dans l’adresse', '/accueil.aspx', 'fd9-courses.leclercdrive.fr'],
  ])(
    '%s : « page non prise en charge », et on peut retourner dans Repas',
    async (_name, path, host) => {
      const { adapter } = page(path, host)
      const { flow, sent, screens } = setupFlow({ error: () => 'return' }, adapter)

      await flow.start(SETUP)

      expect(screens.screens()).toEqual(['error'])
      expect(screens.propsOf('error')).toEqual([
        { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: expect.stringMatching(/^PAGE_/) },
      ])
      expect(sent).toHaveLength(1)
      expect(sent[0]).not.toHaveProperty('store')
      expect(sent[0]).toMatchObject({
        type: 'result',
        outcome: 'error',
        runId: RUN_ID,
        error: { code: 'UNSUPPORTED_PAGE' },
        lines: [],
      })
      validateResult(JSON.parse(JSON.stringify(sent[0])))
    },
  )

  it('« Fermer » n’envoie rien', async () => {
    const { adapter } = page('/accueil.aspx')
    const { flow, sent, screens } = setupFlow({ error: () => 'close' }, adapter)

    await flow.start(SETUP)

    expect(sent).toEqual([])
    expect(screens.closed.count).toBe(1)
  })

  it('une erreur imprévue de l’adaptateur n’est pas avalée : l’orchestrateur montre « le site a changé »', async () => {
    const adapter = fakeAdapter(
      {},
      {
        store: () => {
          throw new Error('bug')
        },
      },
    ).adapter
    const { flow, sent, screens } = setupFlow({ error: () => 'close' }, adapter)

    await flow.start(SETUP)

    expect(screens.propsOf('error')).toEqual([
      { code: 'CONTRACT_CHANGED', canReturn: false, cause: 'EXCEPTION' },
    ])
    expect(sent).toEqual([])
  })
})

describe('la version mobile de Leclerc (DRV-754)', () => {
  it('une page de m-courses sans lien vers le serveur du magasin : cause PAGE_SERVER_HOST, aucun magasin lu ni enregistré, le retour dit la cause', async () => {
    // Given : une page de magasin de la version mobile, dont le pied de page n'est pas (encore) dessiné
    const { adapter, site } = page(
      '/magasin-123456-123456-Ville-Test/recherche.aspx',
      'm-courses.leclercdrive.fr',
    )
    const { flow, sent, screens } = setupFlow({ error: () => 'return' }, adapter)

    // When
    await flow.start(SETUP)

    // Then : l'écran d'erreur, pas de « Enregistrer ce magasin », aucune requête, et pas de magasin rendu à Repas
    expect(screens.screens()).toEqual(['error'])
    expect(screens.propsOf('error')).toEqual([
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'PAGE_SERVER_HOST' },
    ])
    expect(site.calls).toEqual([])
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toHaveProperty('store')
    expect(sent[0]).toMatchObject({
      type: 'result',
      outcome: 'error',
      error: { code: 'UNSUPPORTED_PAGE', message: 'Page non prise en charge (PAGE_SERVER_HOST)' },
    })
    validateResult(JSON.parse(JSON.stringify(sent[0])))
  })
})

describe('sans retour possible vers Repas', () => {
  it('refuse avant de lire quoi que ce soit', async () => {
    const reads: string[] = []
    const adapter = fakeAdapter(
      {},
      {
        store: () => {
          reads.push('lu')
          return { ...STORE, baseUrl: 'https://x', label: null }
        },
      },
    ).adapter
    const { flow, sent, screens } = setupFlow({ error: () => 'close' }, adapter, {
      canReturn: false,
    })

    await flow.start(SETUP)

    expect(screens.propsOf('error')).toEqual([{ code: 'UNSUPPORTED_PAGE', canReturn: false }])
    expect(reads).toEqual([])
    expect(sent).toEqual([])
  })
})

describe('le magasin se choisit sur la page (DRV-740)', () => {
  const MAX = STORE_WATCH_MAX_MS
  const notChosen = () => new RetailerError('UNSUPPORTED_PAGE', null, 'STORE_NOT_CHOSEN')
  const STORE_READ = {
    id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
    host: 'www.auchan.fr',
    baseUrl: 'https://www.auchan.fr/',
    label: 'Drive Ville-Test',
  }
  const AUCHAN_SETUP = { ...SETUP, retailer: 'leclerc' as const }

  /**
   * Un adaptateur dont le magasin se choisit sur la page : `chosen` est ce que la barre dit, `readStore` ne trouve un magasin que si la barre le dit ; une horloge
   * simulée avance de la pause demandée (aucune attente réelle) et chaque tour peut agir (`onTick`).
   */
  function chooser(onTick: (tick: number, world: { chosen: boolean }) => void = () => undefined) {
    const world = { chosen: false, reads: 0, polls: 0, ticks: 0, clock: 1_000 }
    const base = fakeAdapter({}, { store: () => STORE_READ }).adapter
    const adapter: RetailerAdapter = {
      ...base,
      readStore: () => {
        world.reads += 1
        if (!world.chosen) throw notChosen()
        return STORE_READ
      },
      storeChosenOnPage: () => {
        world.polls += 1
        return world.chosen
      },
    }
    const sleep = (ms: number) => {
      world.ticks += 1
      world.clock += ms
      onTick(world.ticks, world)
      return Promise.resolve()
    }
    return { adapter, world, sleep, now: () => world.clock }
  }

  function configure(
    scripts: Parameters<typeof fakeUi>[0],
    built: ReturnType<typeof chooser>,
    retailer?: string,
  ) {
    const sent: Sent[] = []
    const screens = fakeUi(scripts)
    const send = (message: Sent) => void sent.push(message)
    const deps = {
      adapter: built.adapter,
      ui: screens.ui,
      send,
      agentVersion: '0.4.0',
      sleep: built.sleep,
      now: built.now,
      ...(retailer !== undefined && { retailer }),
    }
    const flow = new Flow({
      adapter: built.adapter,
      ui: screens.ui,
      send,
      storage: null,
      wakeLock: null,
      now: built.now,
      agentVersion: '0.4.0',
      canReturn: true,
      onSetup: setupHandler(deps),
    })
    return { flow, sent, screens }
  }

  it('aucun magasin choisi : pas d’écran d’erreur, un bandeau ; dès que la page dit qu’il l’est, UNE lecture puis « Utiliser ce magasin ? »', async () => {
    // Given : la barre dit « choisir » ; la personne choisit au 5e coup d’œil
    const built = chooser((tick, world) => {
      if (tick === 5) world.chosen = true
    })
    const { flow, sent, screens } = configure({ store: () => 'save' }, built)

    // When
    await flow.start(SETUP)

    // Then : jamais d’écran d’erreur, le bandeau d’abord puis le magasin
    expect(screens.screens()).toEqual(['guide', 'store'])
    expect(screens.propsOf('guide')).toEqual([
      expect.objectContaining({ step: 'store', stage: 'waiting', index: 1, total: 0, setup: true }),
    ])
    expect(screens.propsOf('store')).toEqual([{ id: STORE_READ.id, label: 'Drive Ville-Test' }])
    expect(sent).toEqual([
      expect.objectContaining({
        type: 'setup-result',
        store: expect.objectContaining({ id: STORE_READ.id }),
      }),
    ])
    // Aucune lecture du magasin (donc aucune requête) pendant l’attente : la première, puis une seule quand la page l’a dit
    expect(built.world.reads).toBe(2)
    expect(built.world.ticks).toBe(5)
    expect(screens.closed.count).toBe(1)
  })

  it('l’attente ne fait que lire la page toutes les 2 secondes', async () => {
    const built = chooser((tick, world) => {
      if (tick === 3) world.chosen = true
    })
    const pauses: number[] = []
    const sleep = (ms: number) => {
      pauses.push(ms)
      return built.sleep(ms)
    }
    const { flow } = configure({ store: () => 'save' }, { ...built, sleep })

    await flow.start(SETUP)

    expect(pauses).toEqual([STORE_WATCH_POLL_MS, STORE_WATCH_POLL_MS, STORE_WATCH_POLL_MS])
    expect(STORE_WATCH_POLL_MS).toBe(2_000)
  })

  it('« Arrêter pour l’instant » pendant l’attente : un résultat en erreur « magasin non choisi », la lecture s’arrête, rien n’est enregistré', async () => {
    const built = chooser((tick) => {
      if (tick === 3) screens.pressGuideStop()
    })
    const { flow, sent, screens } = configure({}, built)

    await flow.start(SETUP)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'result',
      outcome: 'error',
      error: { code: 'UNSUPPORTED_PAGE' },
    })
    expect(JSON.stringify(sent[0])).toContain('STORE_NOT_CHOSEN')
    expect(sent.some((message) => message.type === 'setup-result')).toBe(false)
    expect(screens.screens()).toEqual(['guide'])
    expect(screens.closed.count).toBe(1)
    expect(built.world.reads).toBe(1)
    // L’attente s’est arrêtée avec la réponse (elle n’a pas couru jusqu’aux 15 minutes)
    expect(built.world.clock - 1_000).toBeLessThan(MAX)
  })

  it('15 minutes sans choix : la carte propose « Attendre encore » ; « Arrêter pour l’instant » rend le résultat en erreur', async () => {
    const built = chooser()
    const { flow, sent, screens } = configure({ guide: () => 'stop' }, built)

    await flow.start(SETUP)

    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual(['waiting', 'late'])
    expect(built.world.clock - 1_000).toBeGreaterThanOrEqual(MAX)
    expect(built.world.clock - 1_000).toBeLessThan(MAX + STORE_WATCH_POLL_MS)
    expect(built.world.reads).toBe(1)
    expect(sent).toHaveLength(1)
    expect(JSON.stringify(sent[0])).toContain('STORE_NOT_CHOSEN')
    expect(screens.screens()).not.toContain('error')
  })

  it('« Attendre encore » : on regarde de nouveau la page ; si le magasin est alors choisi, il est proposé', async () => {
    // Given : 15 minutes passent, la personne touche « Attendre encore » et la page dit alors qu’il est choisi
    let late = 0
    const built = chooser()
    const { flow, sent, screens } = configure(
      {
        guide: () => {
          late += 1
          built.world.chosen = true
          return 'wait'
        },
        store: () => 'save',
      },
      built,
    )

    await flow.start(SETUP)

    expect(late).toBe(1)
    expect(screens.screens()).toEqual(['guide', 'guide', 'store'])
    expect(built.world.reads).toBe(2)
    expect(sent[0]).toMatchObject({ type: 'setup-result' })
  })

  it('« Attendre encore » sans choix : une nouvelle attente, sans requête de plus', async () => {
    let answers = 0
    const built = chooser()
    const { flow, screens } = configure(
      {
        guide: () => {
          answers += 1
          return answers === 1 ? 'wait' : 'stop'
        },
      },
      built,
    )

    await flow.start(SETUP)

    expect(screens.propsOf('guide').map((props) => props.stage)).toEqual([
      'waiting',
      'late',
      'waiting',
      'late',
    ])
    expect(built.world.reads).toBe(2)
  })

  it('la page dit déjà qu’un magasin est choisi mais le site n’en voit pas : une vraie panne, l’écran d’erreur', async () => {
    const built = chooser()
    built.adapter.readStore = () => {
      throw notChosen()
    }
    built.world.chosen = true
    const { flow, sent, screens } = configure({ error: () => 'return' }, built)

    await flow.start(SETUP)

    expect(screens.screens()).toEqual(['error'])
    expect(screens.propsOf('error')).toEqual([
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'STORE_NOT_CHOSEN' },
    ])
    expect(sent).toHaveLength(1)
  })

  it('un vrai échec (réseau, blocage, site changé) reste un écran d’erreur, sans attente', async () => {
    const built = chooser()
    built.adapter.readStore = () => {
      throw new RetailerError('NETWORK', 503, 'HTTP_503')
    }
    const { flow, screens } = configure({ error: () => 'close' }, built)

    await flow.start(SETUP)

    expect(screens.screens()).toEqual(['error'])
    expect(screens.propsOf('error')).toEqual([
      { code: 'NETWORK', canReturn: true, cause: 'HTTP_503' },
    ])
    expect(built.world.ticks).toBe(0)
  })

  it('une enseigne dont le magasin se lit dans l’adresse (Leclerc) n’attend pas : l’écran d’erreur tout de suite, comme avant', async () => {
    // Given : un adaptateur qui n’a pas `storeChosenOnPage` et qui dit « aucun magasin choisi »
    let ticks = 0
    const adapter = fakeAdapter(
      {},
      {
        store: () => {
          throw notChosen()
        },
      },
    ).adapter
    expect(adapter.storeChosenOnPage).toBeUndefined()
    const sent: Sent[] = []
    const screens = fakeUi({ error: () => 'return' })
    const send = (message: Sent) => void sent.push(message)
    const flow = new Flow({
      adapter,
      ui: screens.ui,
      send,
      storage: null,
      wakeLock: null,
      now: () => 1,
      agentVersion: '0.4.0',
      canReturn: true,
      onSetup: setupHandler({
        adapter,
        ui: screens.ui,
        send,
        agentVersion: '0.4.0',
        sleep: () => {
          ticks += 1
          return Promise.resolve()
        },
      }),
    })

    // When
    await flow.start(AUCHAN_SETUP)

    // Then
    expect(screens.screens()).toEqual(['error'])
    expect(screens.propsOf('error')).toEqual([
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'STORE_NOT_CHOSEN' },
    ])
    expect(sent).toHaveLength(1)
    expect(ticks).toBe(0)
  })
})
