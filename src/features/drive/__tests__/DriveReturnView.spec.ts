import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { ResultLine } from '@drive-protocol'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { DRAFT_KEY } from '../bridge'
import type { DriveEvent } from '../bridge'
import { sentLinesOf } from '../bridge/draft'
import { buildPlanMessage } from '../buildPlanMessage'
import DriveReturnView from '../DriveReturnView.vue'
import { useDriveReturnStore } from '../returnStore'
import { plan, storeBaseUrl } from './fixtures'
import { result, RUN } from './results'

// Données SYNTHÉTIQUES : magasin d'essai, produits et listes inventés.
type Handlers = Parameters<typeof stubApi>[0]

// Un brouillon écrit par une version plus ancienne n'a pas les lignes du plan : l'écran relit le plan du back
const draft = { runId: RUN, listId: 'l1', startedAt: new Date().toISOString() }
// Le brouillon d'aujourd'hui garde les lignes du plan envoyé (ici le plan du back, sans rien remplacer ni passer)
const sentLines = sentLinesOf(buildPlanMessage(plan(), {}, RUN))
const sentDraft = { ...draft, lines: sentLines }
const noContent = () => new Response(null, { status: 204 })
const failure = (status: number, message: string) => () => json({ error: { message } }, { status })
const store = { id: '123456', label: null, baseUrl: storeBaseUrl }
const listDetail = { id: 'l1', version: 7 }

const okHandlers: Handlers = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/drive/plans/l1': () => json(plan()),
  'GET /api/v1/shopping-lists/l1': () => json(listDetail),
  'GET /api/v1/drive/settings': () => json({ enabled: true, retailer: 'leclerc', store }),
  'PUT /api/v1/drive/choices': noContent,
}

async function open(event: DriveEvent | null, handlers: Handlers = {}) {
  const fetchMock = stubApi({ ...okHandlers, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  if (event !== null) useDriveReturnStore().receive(event)
  await context.router.push('/drive/retour')
  const wrapper = mount(DriveReturnView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

  return { wrapper, context, fetchMock }
}

const outcomeOf = (
  lines: ResultLine[],
  outcome: 'completed' | 'partial' | 'aborted' | 'error' = 'completed',
) => ({ kind: 'result', result: result({ lines, outcome }), draft }) as DriveEvent

const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === label,
  ) as HTMLButtonElement | undefined

const press = async (label: string) => {
  const target = button(label)
  if (target === undefined) throw new Error(`Bouton absent : ${label}`)
  target.click()
  await flushPromises()
}

const confirmInDialog = async (label: string) => {
  ;[...document.body.querySelectorAll('[role="dialog"] button')]
    .find((item) => item.textContent.trim() === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}

const saved = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  vi.waitFor(() => expect(wrapper.text()).toContain('Vos choix sont enregistrés'))

beforeEach(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  localStorage.clear()
  useDriveReturnStore().clear()
  window.dispatchEvent(new Event('online'))
})

describe('retour du drive : un passage réussi', () => {
  it('enregistre 4 intentions en un appel, efface le brouillon, puis affiche les compteurs et le détail', async () => {
    const { wrapper, fetchMock } = await open({ kind: 'result', result: result(), draft })
    await saved(wrapper)

    const puts = calls(fetchMock).filter((call) => call === 'PUT /api/v1/drive/choices')
    expect(puts).toHaveLength(1)
    const body = (await bodyOf(
      fetchMock,
      calls(fetchMock).indexOf('PUT /api/v1/drive/choices'),
    )) as {
      retailer: string
      storeId: string
      choices: { ingredientSlug: string; action: string; placement: string | null }[]
    }
    expect(body).toMatchObject({ retailer: 'leclerc', storeId: '123456' })
    expect(
      body.choices.map((choice) => [choice.ingredientSlug, choice.action, choice.placement]),
    ).toEqual([
      ['poivre', 'ADD_PRODUCT', 'PRIMARY'],
      ['curry', 'ADD_PRODUCT', 'FALLBACK'],
      ['moutarde', 'REJECT_PRODUCT', null],
      ['sel', 'HAVE_AT_HOME', null],
    ])
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()

    expect(wrapper.text()).toContain('Le panier est rempli')
    expect(wrapper.findAll('dl > div').map((cell) => cell.text())).toEqual([
      'Ajoutés au panier8',
      'Choisis sur Leclerc3',
      'Déjà à la maison1',
      'Passés0',
      'Indisponibles0',
      'Échecs0',
      'Prix lus0',
    ])
    expect(wrapper.text()).toContain('Détail (12)')
    expect(wrapper.text()).toContain('Le panier Leclerc n’est pas vidé par Repas.')
  })

  it('nomme les ingrédients et les produits d’après le plan, et signale le produit de secours utilisé', async () => {
    const { wrapper } = await open({ kind: 'result', result: result(), draft })
    await saved(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('h3')[0]?.text()).toBe('Farine'))

    const farine = wrapper.findAll('main ul > li')[0]!
    expect(farine.text().replace(/\s+/g, ' ')).toContain('Farine de blé T45 1 kg · × 2')
    expect(farine.text()).toContain(
      'Produit de secours utilisé : le préféré n’était pas disponible.',
    )

    const lines = wrapper.findAll('main ul > li').map((item) => item.text().replace(/\s+/g, ' '))
    expect(lines.find((line) => line.startsWith('Poivre'))).toContain(
      'Choisi sur Leclerc, mémorisé comme produit préféré.',
    )
    expect(lines.find((line) => line.startsWith('Curry'))).toContain(
      'mémorisé comme produit de secours',
    )
    const moutarde = lines.find((line) => line.startsWith('Moutarde'))
    expect(moutarde).toContain('Choisi sur Leclerc pour cette fois seulement.')
    expect(moutarde).toContain('Ne sera plus proposé : Moutarde forte 200 g')
    expect(lines.find((line) => line.startsWith('Sel'))).toContain('Vous en avez déjà : mémorisé.')
  })

  it('écrit le slug quand le plan ne se lit pas, et lit les prix', async () => {
    const lines: ResultLine[] = [
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '222333',
        quantity: 1,
        usedRank: 1,
        price: { cents: 189 },
      },
    ]
    const { wrapper, fetchMock } = await open(
      { kind: 'result', result: result({ lines }), draft: sentDraft },
      { 'GET /api/v1/drive/plans/l1': failure(500, 'boom') },
    )
    await saved(wrapper)

    expect(wrapper.find('h3').text()).toBe('farine')
    expect(wrapper.find('main ul > li').text().replace(/\s+/g, ' ')).toContain(
      'Produit n° 222333 · × 1 · 1,89 €',
    )
    const index = calls(fetchMock).indexOf('PUT /api/v1/drive/choices')
    expect(
      ((await bodyOf(fetchMock, index)) as { choices: { action: string }[] }).choices,
    ).toMatchObject([{ action: 'REFRESH_PRICE' }])
    expect(wrapper.findAll('dl > div')[6]?.text()).toBe('Prix lus1')
  })

  it('n’appelle pas le back quand il n’y a rien à enregistrer, et efface le brouillon', async () => {
    const { wrapper, fetchMock } = await open(
      outcomeOf([
        { ingredientSlug: 'sel', outcome: 'SKIPPED' },
        { ingredientSlug: 'riz', outcome: 'UNAVAILABLE', unavailableIds: ['1'] },
      ]),
    )
    await saved(wrapper)

    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(wrapper.text()).toContain('Aucun produit disponible : rien n’a été mis au panier.')
    expect(wrapper.text()).toContain('Passé cette fois.')
  })

  it('ouvre le panier dans le navigateur', async () => {
    const { wrapper } = await open({ kind: 'result', result: result(), draft })
    await vi.waitFor(() => expect(wrapper.find('a[target="_blank"]').exists()).toBe(true))

    expect(wrapper.find('a[target="_blank"]').attributes()).toMatchObject({
      href: storeBaseUrl,
      rel: 'noopener noreferrer',
    })
  })
})

describe('retour du drive : l’enregistrement échoue', () => {
  it('garde le résultat et le brouillon, dit pourquoi, et réessaie à la demande', async () => {
    let up = false
    const { wrapper, fetchMock } = await open(
      { kind: 'result', result: result(), draft },
      { 'PUT /api/v1/drive/choices': () => (up ? noContent() : failure(500, 'boom')()) },
    )
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text()).toContain(
      'Vos choix n’ont pas pu être enregistrés.',
    )
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
    expect(wrapper.text()).toContain('Le panier est rempli')
    expect(wrapper.findAll('main ul > li')).toHaveLength(12)

    up = true
    await press('Réessayer l’enregistrement')
    await saved(wrapper)

    expect(calls(fetchMock).filter((call) => call === 'PUT /api/v1/drive/choices')).toHaveLength(2)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it.each([
    [409, 'DRIVE_STORE_MISMATCH', 'Votre magasin a changé'],
    [422, 'DRIVE_CHOICE_INVALID', 'Cette préférence est refusée'],
    [422, 'DRIVE_LIMIT_REACHED', 'Trop de produits mémorisés, ou trop d’écritures aujourd’hui'],
    [409, 'DRIVE_NOT_CONFIGURED', 'Choisissez d’abord votre magasin'],
  ])('explique le refus %i %s', async (status, code, message) => {
    const { wrapper } = await open(
      { kind: 'result', result: result(), draft },
      { 'PUT /api/v1/drive/choices': failure(status, code) },
    )
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text().replace(/'/g, '’')).toContain(message)
  })
})

describe('retour du drive : chaque issue du passage', () => {
  const blocked: ResultLine[] = [
    { ingredientSlug: 'farine', outcome: 'ADDED', productId: '123456', quantity: 1, usedRank: 1 },
    { ingredientSlug: 'beurre', outcome: 'FAILED', error: 'BLOCKED' },
    { ingredientSlug: 'lait', outcome: 'FAILED', error: 'NETWORK' },
  ]

  it('partial : explique, garde ce qui est fait, propose de réessayer les échecs et de reprendre', async () => {
    const event = {
      kind: 'result',
      draft,
      result: result({
        outcome: 'partial',
        lines: blocked,
        error: { code: 'BLOCKED', message: 'Trop de demandes' },
      }),
    } as DriveEvent
    const { wrapper } = await open(event)
    await saved(wrapper)

    expect(wrapper.text()).toContain('Le passage s’est arrêté avant la fin')
    expect(wrapper.text()).toContain('Leclerc a bloqué les demandes')
    expect(wrapper.text()).toContain('Échec : La connexion a été coupée pendant le passage.')
    expect(wrapper.findAll('dl > div').map((cell) => cell.text())).toContain('Échecs2')
    expect(wrapper.find('a[href="/drive/envoi/l1?lignes=beurre,lait"]').text()).toBe(
      'Réessayer les échecs',
    )
    expect(wrapper.find('a[href="/drive/envoi/l1"]').text()).toBe('Reprendre l’envoi')
    expect(wrapper.text()).not.toContain('Le panier est rempli')
  })

  it('ne propose de réessayer qu’une fois les choix enregistrés', async () => {
    const { wrapper } = await open(outcomeOf(blocked, 'partial'), {
      'PUT /api/v1/drive/choices': () => new Promise<Response>(() => undefined),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Enregistrement de vos choix…'))

    expect(wrapper.find('a[href^="/drive/envoi/"]').exists()).toBe(false)
  })

  it.each([
    ['aborted', 'Passage arrêté', undefined],
    ['error', 'Le passage a échoué', 'NOT_LOGGED_IN'],
    ['error', 'Le passage a échoué', 'STORE_MISMATCH'],
    ['error', 'Le passage a échoué', 'CONTRACT_CHANGED'],
    ['error', 'Le passage a échoué', 'UNSUPPORTED_PAGE'],
    ['aborted', 'Passage arrêté', 'CANCELLED'],
  ] as const)('%s %s %s', async (outcome, title, code) => {
    const event = {
      kind: 'result',
      draft,
      result: result({
        outcome,
        lines: [],
        ...(code === undefined ? {} : { error: { code, message: 'x' } }),
      }),
    } as DriveEvent
    const { wrapper } = await open(event)
    await saved(wrapper)

    expect(wrapper.find('h2').text()).toBe(title)
    expect(wrapper.find('a[href="/drive/envoi/l1"]').exists()).toBe(true)
    expect(wrapper.find('a[href*="lignes"]').exists()).toBe(false)
    expect(wrapper.find('section[role="status"] p.font-semibold').exists()).toBe(code !== undefined)
  })
})

describe('retour du drive : le résultat est recoupé avec le plan envoyé (DRV-614)', () => {
  const chosen = (slug: string): ResultLine => ({
    ingredientSlug: slug,
    outcome: 'CHOSEN',
    quantity: 1,
    placement: 'PRIMARY',
    product: { id: '555999', label: 'Produit de test' },
  })
  const added = (slug: string, productId: string): ResultLine => ({
    ingredientSlug: slug,
    outcome: 'ADDED',
    productId,
    quantity: 1,
    usedRank: 1,
  })
  const putBody = async (fetchMock: ReturnType<typeof stubApi>) =>
    (await bodyOf(fetchMock, calls(fetchMock).indexOf('PUT /api/v1/drive/choices'))) as {
      choices: {
        ingredientSlug: string
        action: string
        product: { retailerProductId: string } | null
      }[]
    }
  const sentOf = (lines: ResultLine[], from = sentDraft) =>
    ({ kind: 'result', result: result({ lines }), draft: from }) as DriveEvent

  it('n’enregistre ni n’affiche une ligne que le plan n’explique pas, et la compte', async () => {
    const lines = [
      added('farine', '123456'),
      chosen('pirate'),
      added('beurre', '777000'),
      chosen('lait'),
      chosen('poivre'),
    ]
    const { wrapper, fetchMock } = await open(sentOf(lines))
    await saved(wrapper)

    const body = await putBody(fetchMock)
    expect(body.choices.map((choice) => [choice.ingredientSlug, choice.action])).toEqual([
      ['poivre', 'ADD_PRODUCT'],
    ])
    expect(wrapper.text()).toContain('3 lignes inattendues ignorées')
    expect(wrapper.text()).toContain('Détail (2)')
    expect(wrapper.findAll('main ul > li').map((item) => item.find('h3').text())).toEqual([
      'Farine',
      'Poivre',
    ])
    expect(wrapper.text()).not.toContain('pirate')
    expect(wrapper.findAll('dl > div')[0]?.text()).toBe('Ajoutés au panier1')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('dit « 1 ligne inattendue ignorée » au singulier, et n’appelle pas le back quand plus rien ne reste', async () => {
    const { wrapper, fetchMock } = await open(sentOf([chosen('pirate')]))
    await saved(wrapper)

    expect(wrapper.text()).toContain('1 ligne inattendue ignorée')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(wrapper.text()).not.toContain('Détail')
    expect(wrapper.findAll('main ul > li')).toHaveLength(0)
  })

  it('ne dit rien quand tout s’explique par le plan', async () => {
    const { wrapper } = await open({ kind: 'result', result: result(), draft: sentDraft })
    await saved(wrapper)

    expect(wrapper.text()).not.toContain('inattendue')
    expect(wrapper.text()).toContain('Détail (12)')
  })

  it('accepte un produit choisi pour une ligne connue que l’utilisateur a remplacée (envoyée « à choisir »)', async () => {
    const replaced = {
      ...sentDraft,
      lines: sentLines.map((line) =>
        line.ingredientSlug === 'farine' ? { ...line, status: 'NEW' as const, products: [] } : line,
      ),
    }
    const { wrapper, fetchMock } = await open(sentOf([chosen('farine')], replaced))
    await saved(wrapper)

    expect((await putBody(fetchMock)).choices.map((choice) => choice.action)).toEqual([
      'ADD_PRODUCT',
    ])
    expect(wrapper.text()).not.toContain('inattendue')
  })

  it('refuse le même produit choisi pour la même ligne quand elle n’avait pas été remplacée', async () => {
    const { wrapper, fetchMock } = await open(sentOf([chosen('farine')]))
    await saved(wrapper)

    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(wrapper.text()).toContain('1 ligne inattendue ignorée')
  })

  it('« Réessayer les échecs » ne propose pas une ligne ignorée', async () => {
    const lines: ResultLine[] = [
      { ingredientSlug: 'beurre', outcome: 'FAILED', error: 'NETWORK' },
      { ingredientSlug: 'pirate', outcome: 'FAILED', error: 'NETWORK' },
    ]
    const { wrapper } = await open(sentOf(lines))
    await saved(wrapper)

    expect(wrapper.find('a[href="/drive/envoi/l1?lignes=beurre"]').exists()).toBe(true)
    expect(wrapper.find('a[href*="pirate"]').exists()).toBe(false)
  })

  describe('brouillon sans les lignes du plan (version plus ancienne) : le plan est relu du back', () => {
    it('recoupe le résultat avec le plan relu, avant de rien enregistrer', async () => {
      const { wrapper, fetchMock } = await open(
        outcomeOf([
          { ...added('farine', '123456'), price: { cents: 189 } } as ResultLine,
          chosen('pirate'),
          added('beurre', '777000'),
        ]),
      )
      await saved(wrapper)

      const body = await putBody(fetchMock)
      expect(body.choices.map((choice) => [choice.ingredientSlug, choice.action])).toEqual([
        ['farine', 'REFRESH_PRICE'],
      ])
      expect(wrapper.text()).toContain('2 lignes inattendues ignorées')
      expect(calls(fetchMock).filter((call) => call.includes('/plans/'))).toHaveLength(1)
    })

    it('sans plan retrouvé, n’enregistre rien, garde le résultat et le brouillon, puis réessaie', async () => {
      let up = false
      const { wrapper, fetchMock } = await open(
        outcomeOf([added('farine', '123456'), chosen('poivre')]),
        {
          'GET /api/v1/drive/plans/l1': () => (up ? json(plan()) : failure(500, 'boom')()),
        },
      )
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

      expect(wrapper.find('[role="alert"]').text()).toContain(
        'Vos choix n’ont pas pu être enregistrés.',
      )
      expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
      expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
      expect(wrapper.findAll('main ul > li')).toHaveLength(2)

      up = true
      await press('Réessayer l’enregistrement')
      await saved(wrapper)

      expect(calls(fetchMock).filter((call) => call === 'PUT /api/v1/drive/choices')).toHaveLength(
        1,
      )
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    })
  })
})

describe('retour du drive : ce qui n’est pas le résultat du dernier envoi', () => {
  it('sans événement : rien à afficher', async () => {
    const { wrapper, fetchMock } = await open(null)

    expect(wrapper.text()).toContain('Aucun résultat à afficher')
    expect(
      calls(fetchMock).filter((call) => call.startsWith('PUT') || call.includes('/plans/')),
    ).toEqual([])
    expect(wrapper.find('a[href="/listes"]').exists()).toBe(true)
  })

  it('un résultat d’un autre envoi est ignoré : rien n’est enregistré, le brouillon reste', async () => {
    const { wrapper, fetchMock } = await open({
      kind: 'stale',
      result: result({ runId: '0b6d1a3e-7c1f-4a55-9a8e-2f4d9c3b7e10' }),
    })

    expect(wrapper.text()).toContain('Ce résultat ne correspond pas à votre dernier envoi')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
  })

  it('un refus de l’application : le brouillon de ce passage est effacé et on peut revenir à l’envoi', async () => {
    const { wrapper } = await open({ kind: 'refused', code: 'UNAVAILABLE', runId: RUN })

    expect(wrapper.find('[role="alert"]').text()).toContain('Le drive n’a pas démarré')
    expect(wrapper.text()).toContain('Code : UNAVAILABLE')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(wrapper.find('a[href="/drive/envoi/l1"]').text()).toBe('Revenir à l’envoi')
  })

  it('un refus d’un autre passage laisse le brouillon', async () => {
    const { wrapper } = await open({
      kind: 'refused',
      code: 'UNAVAILABLE',
      runId: '0b6d1a3e-7c1f-4a55-9a8e-2f4d9c3b7e10',
    })

    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
    expect(wrapper.find('a[href^="/drive/envoi"]').exists()).toBe(false)
  })

  it('une réponse mal formée est signalée sans rien enregistrer', async () => {
    const { wrapper, fetchMock } = await open({ kind: 'invalid', detail: 'lines[0]' })

    expect(wrapper.find('[role="alert"]').text()).toContain('Réponse incomprise')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
  })

  it('la lecture du magasin se traite dans les réglages', async () => {
    const { wrapper, fetchMock } = await open({
      kind: 'result',
      draft,
      result: {
        v: 1,
        type: 'setup-result',
        runId: RUN,
        agentVersion: '1.0.0',
        store: {
          id: '123456',
          host: 'courses-test.leclercdrive.fr',
          baseUrl: storeBaseUrl,
          label: null,
        },
      },
    })

    expect(wrapper.text()).toContain('Lecture du magasin')
    expect(wrapper.find('a[href="/drive/reglages"]').exists()).toBe(true)
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
  })
})

describe('retour du drive : terminer ou rouvrir la liste', () => {
  it('« Terminer la liste » demande confirmation, termine la liste, puis ouvre la liste', async () => {
    const { wrapper, context, fetchMock } = await open(
      { kind: 'result', result: result(), draft },
      { 'POST /api/v1/shopping-lists/l1/complete': noContent },
    )
    await saved(wrapper)

    await press('Terminer la liste')
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      'Le panier Leclerc ne sera pas vidé.',
    )
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/complete')
    await confirmInDialog('Terminer la liste')

    await vi.waitFor(() =>
      expect(context.router.currentRoute.value.name).toBe('shopping-list-detail'),
    )
    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists/l1/complete')
    expect(useDriveReturnStore().event).toBeNull()
  })

  it('« Rouvrir la liste » demande confirmation et rouvre avec la version lue', async () => {
    const { wrapper, context, fetchMock } = await open(
      { kind: 'result', result: result(), draft },
      { 'POST /api/v1/shopping-lists/l1/reopen': noContent },
    )
    await saved(wrapper)
    await vi.waitFor(() => expect(button('Rouvrir la liste')?.disabled).toBe(false))

    await press('Rouvrir la liste')
    await confirmInDialog('Rouvrir la liste')

    await vi.waitFor(() =>
      expect(context.router.currentRoute.value.name).toBe('shopping-list-detail'),
    )
    const request = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((candidate) => candidate.url.endsWith('/reopen'))
    expect(request?.headers.get('If-Match')).toBe('"7"')
  })

  it('« Rouvrir la liste » reste possible quand la fonction est coupée : le reste du drive répond 404 DRIVE_DISABLED', async () => {
    const { wrapper, context, fetchMock } = await open(
      { kind: 'result', result: result(), draft: sentDraft },
      {
        'GET /api/v1/drive/settings': () => json({ enabled: false, retailer: 'leclerc' }),
        'GET /api/v1/drive/plans/l1': failure(404, 'DRIVE_DISABLED'),
        'PUT /api/v1/drive/choices': failure(404, 'DRIVE_DISABLED'),
        'POST /api/v1/shopping-lists/l1/reopen': noContent,
      },
    )
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.find('[role="alert"]').text()).toContain('n’est pas disponible pour le moment')
    await vi.waitFor(() => expect(button('Rouvrir la liste')?.disabled).toBe(false))

    await press('Rouvrir la liste')
    await confirmInDialog('Rouvrir la liste')

    await vi.waitFor(() =>
      expect(context.router.currentRoute.value.name).toBe('shopping-list-detail'),
    )
    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists/l1/reopen')
  })

  it('désactive ces actions sans réseau, et le dit', async () => {
    const { wrapper } = await open({ kind: 'result', result: result(), draft })
    await saved(wrapper)

    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    expect(button('Terminer la liste')?.disabled).toBe(true)
    expect(button('Rouvrir la liste')?.disabled).toBe(true)
    expect(wrapper.text()).toContain('Hors connexion')
  })
})
