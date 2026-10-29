// @vitest-environment node
// Le mode configuration (DRV-307) : lire le magasin de la page et le donner à Repas. Le magasin est inventé, l'adaptateur est le vrai
// (sur une adresse simulée) ou un double ; aucun réseau.
import { describe, expect, it } from 'vitest'

import { validateResult, type ResultMessage, type SetupResultMessage } from '../protocol'
import { Flow, setupHandler, type FlowDeps } from '../src/flow'
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

describe('le site mobile de Leclerc (ticket J)', () => {
  it('« Ce n’est pas la version ordinateur du site » : cause PAGE_MOBILE, aucun magasin lu ni enregistré, le retour dit la cause', async () => {
    // Given : une page de magasin, mais sur le site mobile
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
      { code: 'UNSUPPORTED_PAGE', canReturn: true, cause: 'PAGE_MOBILE' },
    ])
    expect(site.calls).toEqual([])
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toHaveProperty('store')
    expect(sent[0]).toMatchObject({
      type: 'result',
      outcome: 'error',
      error: { code: 'UNSUPPORTED_PAGE', message: 'Page non prise en charge (PAGE_MOBILE)' },
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
