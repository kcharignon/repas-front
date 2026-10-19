// Le durcissement face au vrai site (audit des hypothèses, 2026-10-18) : la cause fine d'une erreur dans le résultat (ticket A), une page
// « aucun résultat » qui n'arrête pas le passage (ticket C), le visiteur non connecté arrêté AVANT toute écriture (ticket G). Le flux est
// l'orchestrateur réel ; l'adaptateur est tantôt simulé (`fakeAdapter`), tantôt le vrai sur des pages inventées (`fakeSite`).
import { describe, expect, it } from 'vitest'

import { guidedChoice, RUN_PREFIX } from '../src/flow'
import { LeclercAdapter, LeclercError, type SessionReading } from '../src/leclerc'
import {
  expectConform,
  fakeAdapter,
  fakeStorage,
  fakeUi,
  fresh,
  home,
  known,
  makeFlow,
  plan,
  product,
  RUN_ID,
} from './flow-helpers'
import { fakeSite, fixture } from './leclerc-helpers'

const VISITOR: SessionReading = { state: 'VISITOR', signs: ['LOGIN_LINK', 'REGISTER_LINK'] }
const MEMBER: SessionReading = { state: 'MEMBER', signs: ['LOGOUT_LINK'] }

describe('la cause de l’erreur dans le résultat (ticket A)', () => {
  /** Un passage dont la première recherche lève `error`. */
  async function failWith(error: unknown) {
    const { adapter } = fakeAdapter(
      { '1000001': {} },
      {
        before: (call) => {
          if (call === 'search 1000001') throw error
        },
      },
    )
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })
    await flow.start(plan([known('farine', [product('1000001')])]))
    return { sent, screens }
  }

  it('CONTRACT_CHANGED dit quelle vérification a échoué, dans le message du résultat', async () => {
    const { sent } = await failWith(new LeclercError('CONTRACT_CHANGED', 200, 'SEARCH_NO_STATE'))

    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'error',
      error: { code: 'CONTRACT_CHANGED', message: 'Le site a changé (SEARCH_NO_STATE)' },
      lines: [{ ingredientSlug: 'farine', outcome: 'FAILED', error: 'CONTRACT_CHANGED' }],
    })
  })

  it('un incident imprévu s’appelle EXCEPTION, jamais son message', async () => {
    const { sent } = await failWith(new TypeError('le site renvoie un secret : cookie=abc'))

    expect(expectConform(sent[0]).error).toEqual({
      code: 'CONTRACT_CHANGED',
      message: 'Le site a changé (EXCEPTION)',
    })
    expect(JSON.stringify(sent[0])).not.toMatch(/secret|cookie/)
  })

  it('une erreur sans cause garde le titre seul', async () => {
    const { sent } = await failWith(new LeclercError('BLOCKED', 429))

    expect(expectConform(sent[0]).error).toEqual({
      code: 'BLOCKED',
      message: 'Leclerc a ralenti les requêtes',
    })
  })

  it('une page qui n’est pas celle d’un magasin dit pourquoi', async () => {
    const { adapter } = fakeAdapter(
      {},
      {
        store: () => {
          throw new LeclercError('UNSUPPORTED_PAGE', null, 'PAGE_PATH')
        },
      },
    )
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(plan([known('farine', [product('1000001')])]))

    expect(expectConform(sent[0]).error).toEqual({
      code: 'UNSUPPORTED_PAGE',
      message: 'Page non prise en charge (PAGE_PATH)',
    })
  })

  it('en phase B aussi (la recherche du choix guidé)', async () => {
    const { adapter } = fakeAdapter(
      {},
      {
        before: (call) => {
          if (call.startsWith('find'))
            throw new LeclercError('CONTRACT_CHANGED', 200, 'SEARCH_NO_STATE')
        },
      },
    )
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter, phaseB: guidedChoice })

    await flow.start(plan([fresh('poivre')]))

    expect(expectConform(sent[0]).error).toEqual({
      code: 'CONTRACT_CHANGED',
      message: 'Le site a changé (SEARCH_NO_STATE)',
    })
  })

  it('l’écran de fin porte l’issue et le code, sans la cause (l’interface n’affiche que le conseil)', async () => {
    const { screens } = await failWith(new LeclercError('CONTRACT_CHANGED', 200, 'SEARCH_NO_STATE'))

    expect(screens.propsOf('end')).toHaveLength(1)
    expect(screens.propsOf('end')[0]).toMatchObject({ outcome: 'error', error: 'CONTRACT_CHANGED' })
  })
})

describe('une page « aucun résultat » n’arrête pas le passage (ticket C)', () => {
  /** Le vrai adaptateur sur un faux site qui répond `page` à toute recherche et `cart` à tout ajout. */
  const shop = (page: string) => {
    const site = fakeSite((call) =>
      call.init.method === 'POST' ? { body: fixture('panier-ajout.json') } : { body: page },
    )
    return { site, adapter: new LeclercAdapter(site.deps) }
  }

  it.each([
    'recherche-vide.html',
    'recherche-vide-sans-liste.html',
    'recherche-vide-encodee.html',
    'recherche-vide-panier-garni.html',
  ])('%s : la ligne est proposée à « Passer », puis la suivante est cherchée', async (name) => {
    // Given : deux ingrédients à choisir, le site ne trouve rien pour aucun
    const { site, adapter } = shop(fixture(name))
    const asked: string[] = []
    const screens = fakeUi({
      chooser: (props) => {
        asked.push(props.ingredient)
        return { kind: 'skip' }
      },
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter, phaseB: guidedChoice })

    // When
    await flow.start(plan([fresh('betternut'), fresh('bettrave')]))

    // Then : les deux lignes ont été cherchées (leur nom, puis leur pluriel : ticket D) et proposées, rien n'a été écrit, aucune erreur
    expect(asked).toEqual(['Betternut', 'Bettrave'])
    expect(site.calls.map((call) => call.init.method)).toEqual(['GET', 'GET', 'GET', 'GET'])
    expect(
      site.calls.map((call) => decodeURIComponent(call.url.split('TexteRecherche=')[1] ?? '')),
    ).toEqual(['betternut', 'betternuts', 'bettrave', 'bettraves'])
    expect(screens.propsOf('error')).toEqual([])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'completed',
      lines: [
        { ingredientSlug: 'betternut', outcome: 'SKIPPED' },
        { ingredientSlug: 'bettrave', outcome: 'SKIPPED' },
      ],
    })
    expect(sent[0]?.error).toBeUndefined()
  })

  it('la liste affichée est vide et dit qu’aucun produit n’est trouvé', async () => {
    const { adapter } = shop(fixture('recherche-vide-sans-liste.html'))
    const texts: string[] = []
    const screens = fakeUi({
      chooser: (props) => {
        const zone = document.createElement('div')
        document.body.append(zone)
        props.mount(zone, () => undefined)
        texts.push(zone.textContent ?? '')
        zone.remove()
        return { kind: 'skip' }
      },
    })
    const { flow } = makeFlow({ ui: screens.ui, adapter, phaseB: guidedChoice })

    await flow.start(plan([fresh('betternut')]))

    expect(texts[0]).toContain('Aucun produit trouvé')
    expect(texts[0]).toContain('Chercher')
  })

  it('un produit connu que la recherche ne retrouve pas passe en phase B au lieu d’arrêter le passage', async () => {
    // Given : la recherche du libellé complet ne trouve rien, celle du nom de l'ingrédient trouve des produits
    const site = fakeSite((call) => ({
      body: call.url.includes('farine')
        ? fixture('recherche-farine.html')
        : fixture('recherche-vide-sans-liste.html'),
    }))
    const screens = fakeUi({ chooser: () => ({ kind: 'skip' }) })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: new LeclercAdapter(site.deps),
      phaseB: guidedChoice,
    })

    // When
    await flow.start(
      plan([
        known('farine', [product('1000001', 1, 'Un libellé que le site ne retrouve pas')]),
        home('sel'),
      ]),
    )

    // Then : le libellé complet puis ses trois formes (ticket D), puis le nom de l'ingrédient, qui répond
    expect(site.calls.map((call) => call.init.method)).toEqual(['GET', 'GET', 'GET', 'GET', 'GET'])
    expect(screens.propsOf('chooser')).toHaveLength(1)
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'completed',
      lines: [
        { ingredientSlug: 'farine', outcome: 'SKIPPED' },
        { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
      ],
    })
  })

  it('une structure vraiment inconnue arrête le passage : CONTRACT_CHANGED avec sa cause, rien d’écrit, les lignes suivantes intactes', async () => {
    const { site, adapter } = shop(fixture('recherche-changee.html'))
    const screens = fakeUi({ chooser: () => ({ kind: 'skip' }) })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter, phaseB: guidedChoice })

    await flow.start(plan([fresh('betternut'), fresh('bettrave')]))

    expect(site.calls.map((call) => call.init.method)).toEqual(['GET'])
    expect(screens.propsOf('chooser')).toEqual([])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'error',
      error: { code: 'CONTRACT_CHANGED', message: 'Le site a changé (SEARCH_NO_STATE)' },
    })
  })

  it('une liste de produits aux champs renommés n’est pas confondue avec « aucun produit »', async () => {
    const { adapter } = shop(fixture('recherche-liste-illisible.html'))
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter, phaseB: guidedChoice })

    await flow.start(plan([fresh('betternut')]))

    expect(expectConform(sent[0]).error).toEqual({
      code: 'CONTRACT_CHANGED',
      message: 'Le site a changé (SEARCH_PRODUCTS_UNREADABLE)',
    })
  })
})

describe('le visiteur non connecté est arrêté avant toute écriture (ticket G)', () => {
  const FARINE = plan([known('farine', [product('1000001', 3)]), home('sel')])

  it('refuse de commencer : ni récapitulatif, ni recherche, ni panier, et le dit clairement', async () => {
    // Given : la page ouverte est celle d'un visiteur
    const { adapter, calls, writes } = fakeAdapter({ '1000001': {} }, { session: VISITOR })
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(FARINE)

    // Then : « Connecte-toi à Leclerc, puis relance l'envoi », rien n'a été demandé au site
    expect(calls).toEqual([])
    expect(writes).toEqual([])
    expect(screens.screens()).toEqual(['error'])
    expect(screens.propsOf('error')).toEqual([
      { code: 'NOT_LOGGED_IN', canReturn: true, cause: 'SESSION_VISITOR' },
    ])
    expect(flow.history).toEqual(['START', 'VALIDATED', 'ERROR'])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'error',
      error: { code: 'NOT_LOGGED_IN', message: 'Vous n’êtes pas connecté (SESSION_VISITOR)' },
      lines: [],
    })
  })

  it('un client connecté, ou un état inconnu, passe comme avant', async () => {
    for (const session of [MEMBER, { state: 'UNKNOWN', signs: [] } satisfies SessionReading]) {
      const { adapter, writes } = fakeAdapter({ '1000001': {} }, { session })
      const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

      await flow.start(FARINE)

      expect(writes).toEqual([{ id: '1000001', quantity: 3 }])
      expect(expectConform(sent[0]).outcome).toBe('completed')
    }
  })

  it('un autre magasin est signalé avant la connexion (le conseil le plus utile d’abord)', async () => {
    const { adapter } = fakeAdapter(
      { '1000001': {} },
      {
        session: VISITOR,
        store: () => ({
          id: '000999',
          host: 'fd0-courses.leclercdrive.fr',
          baseUrl: '',
          label: null,
        }),
      },
    )
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(FARINE)

    expect(expectConform(sent[0]).error?.code).toBe('STORE_MISMATCH')
  })

  it('garde l’état de reprise : après la connexion, le passage se reprend là où il s’était arrêté', async () => {
    // Given : un passage commencé dont `sel` est fait, puis la session perdue
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
    const { adapter } = fakeAdapter({ '1000001': {} }, { session: VISITOR })
    const screens = fakeUi({ error: () => 'close' })
    const { flow } = makeFlow({ ui: screens.ui, adapter, storage })

    // When
    await flow.start(FARINE)

    // Then
    expect(screens.screens()).toEqual(['error'])
    expect(storage.getItem(`${RUN_PREFIX}${RUN_ID}`)).toContain('"sel"')
  })

  it('le mode configuration (lecture du magasin) ne demande pas de connexion', async () => {
    const { adapter } = fakeAdapter({}, { session: VISITOR })
    const setups: string[] = []
    const { flow } = makeFlow({
      ui: fakeUi().ui,
      adapter,
      onSetup: (message) => void setups.push(message.runId),
    })

    await flow.start({
      v: 1,
      type: 'setup',
      runId: RUN_ID,
      retailer: 'leclerc',
      store: { id: '000123', host: 'fd0-courses.leclercdrive.fr' },
      returnPath: '/drive/retour',
    })

    expect(setups).toEqual([RUN_ID])
  })

  it('en cours de passage : la recherche qui revient en visiteur arrête tout, avec ce qui a déjà été fait', async () => {
    const { adapter, writes } = fakeAdapter(
      { '1000001': {}, '1000003': {} },
      {
        before: (call) => {
          if (call === 'search 1000003')
            throw new LeclercError('NOT_LOGGED_IN', 200, 'SESSION_VISITOR')
        },
      },
    )
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter })

    await flow.start(
      plan([known('farine', [product('1000001')]), known('sucre', [product('1000003')])]),
    )

    expect(writes).toEqual([{ id: '1000001', quantity: 1 }])
    expect(expectConform(sent[0])).toMatchObject({
      outcome: 'error',
      error: { code: 'NOT_LOGGED_IN', message: 'Vous n’êtes pas connecté (SESSION_VISITOR)' },
      lines: [{ ingredientSlug: 'farine', outcome: 'ADDED' }],
    })
  })

  it('de bout en bout sur des pages inventées : la page d’un visiteur n’écrit rien au panier', async () => {
    // Given : le vrai adaptateur ; la page ouverte est celle d'un visiteur
    const visitorPage = fixture('recherche-farine.html').replace(
      '<nav><a href="/accueil">Accueil</a> <a href="/panier">Panier</a></nav>',
      '<nav><a href="/connexion">Se connecter</a> <a href="/inscription">Créer un compte</a></nav>',
    )
    const site = fakeSite(
      (call) =>
        call.init.method === 'POST'
          ? { body: fixture('panier-ajout.json') }
          : { body: visitorPage },
      { pageText: () => visitorPage },
    )
    const screens = fakeUi({ error: () => 'return' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: new LeclercAdapter(site.deps) })

    // When
    await flow.start(FARINE)

    // Then : aucune requête, ni recherche ni écriture
    expect(site.calls).toEqual([])
    expect(expectConform(sent[0]).error?.code).toBe('NOT_LOGGED_IN')
  })
})
