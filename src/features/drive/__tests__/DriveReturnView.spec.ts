import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { ResultLine } from '@drive-protocol'

import { appContext, bodyOf, calls, json, me, rateLimited, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { DRAFT_KEY } from '../bridge'
import type { DriveEvent } from '../bridge'
import { sentLinesOf } from '../bridge/draft'
import { buildPlanMessage } from '../buildPlanMessage'
import DriveReturnView from '../DriveReturnView.vue'
import { useDriveReturnStore } from '../returnStore'
import { plan, storeBaseUrl } from './fixtures'
import { finalizeLink, DRIVE_HOME_URL } from '../leclerc'
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
const basketLink = storeBaseUrl
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

// L'enregistrement est fini quand le store le dit : la phrase « Tes choix sont enregistrés » ne s'écrit que s'il y a un choix à enregistrer (DRV-626)
const saved = (_wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  vi.waitFor(() => expect(useDriveReturnStore().status).toBe('saved'))

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

    expect(wrapper.find('h1').text()).toBe('Le panier est rempli')
    expect(wrapper.find('main [role="status"] p').text()).toBe(
      'Ton panier est prêt. Retrouve-le dans l’appli Drive Leclerc.',
    )
    // Seuls les compteurs qui existent : jamais un zéro, jamais « Échecs » ni « Prix lus »
    expect(wrapper.findAll('dl > div').map((cell) => cell.text())).toEqual([
      'Ajoutés au panier8',
      'Choisis sur Leclerc3',
      'J’en ai toujours1',
    ])
    expect(wrapper.find('details > summary').text()).toBe('Détails')
    expect(wrapper.findAll('details li')).toHaveLength(12)
    expect(wrapper.text()).not.toContain('vidé')
  })

  it('nomme les ingrédients et les produits d’après le plan, et signale le produit de secours utilisé', async () => {
    const { wrapper } = await open({ kind: 'result', result: result(), draft })
    await saved(wrapper)
    await vi.waitFor(() => expect(wrapper.find('main ul > li p')?.text()).toBe('Farine'))

    const farine = wrapper.findAll('main ul > li')[0]!
    expect(farine.text().replace(/\s+/g, ' ')).toContain('Farine de blé T45 1 kg · × 2')
    expect(farine.text()).toContain(
      'Produit de remplacement utilisé : le produit habituel n’était pas disponible.',
    )

    const lines = wrapper.findAll('main ul > li').map((item) => item.text().replace(/\s+/g, ' '))
    expect(lines.find((line) => line.startsWith('Poivre'))).toContain(
      'Choisi sur Leclerc, produit habituel : Repas s’en souvient.',
    )
    expect(lines.find((line) => line.startsWith('Curry'))).toContain(
      'produit de remplacement : Repas s’en souvient',
    )
    const moutarde = lines.find((line) => line.startsWith('Moutarde'))
    expect(moutarde).toContain('Choisi sur Leclerc pour cette fois seulement.')
    expect(moutarde).toContain('Ne sera plus proposé : Moutarde forte 200 g')
    expect(lines.find((line) => line.startsWith('Sel'))).toContain(
      'J’en ai toujours : Repas s’en souvient.',
    )
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

    expect(wrapper.find('main ul > li p').text()).toBe('farine')
    expect(wrapper.find('main ul > li').text().replace(/\s+/g, ' ')).toContain(
      'Produit n° 222333 · × 1 · 1,89 €',
    )
    const index = calls(fetchMock).indexOf('PUT /api/v1/drive/choices')
    expect(
      ((await bodyOf(fetchMock, index)) as { choices: { action: string }[] }).choices,
    ).toMatchObject([{ action: 'REFRESH_PRICE' }])
    // Le prix lu est mémorisé (REFRESH_PRICE), mais ne s'affiche plus comme compteur
    expect(wrapper.find('dl').text()).not.toContain('Prix lus')
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
    expect(wrapper.text()).toContain('Pas cette fois.')
  })

  // DRV-645 : le panier est prêt, un message ; aucun lien vers le site de Leclerc, ni dans un navigateur ni dans l'application
  it('dans un navigateur, dit que le panier est prêt, sans lien vers Leclerc', async () => {
    const { wrapper } = await open({ kind: 'result', result: result(), draft })
    await saved(wrapper)

    expect(wrapper.text()).toContain('Ton panier est prêt. Retrouve-le dans l’appli Drive Leclerc.')
    expect(wrapper.text()).not.toContain('Finaliser')
    expect(wrapper.find('a[target="_blank"]').exists()).toBe(false)
    expect(
      wrapper
        .find('main')
        .findAll('a')
        .some((a) => a.attributes('href')?.startsWith('http')),
    ).toBe(false)
    // « Terminer la liste » est l'action principale
    const principal = wrapper
      .find('main')
      .findAll('a, button')
      .filter((item) => item.classes().includes('bg-primary'))
    expect(principal.map((item) => item.text())).toEqual(['Terminer la liste'])
  })

  it('dans l’application, le même message, sans lien vers Leclerc', async () => {
    vi.stubGlobal('repasNative', {
      postMessage: vi.fn<(text: string) => void>(),
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    })
    const { wrapper } = await open({ kind: 'result', result: result(), draft })
    await saved(wrapper)

    expect(wrapper.text()).toContain('Ton panier est prêt. Retrouve-le dans l’appli Drive Leclerc.')
    expect(wrapper.text()).not.toContain('Finaliser')
    expect(wrapper.find(`a[href="${basketLink}"]`).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('navigateur')
    expect(wrapper.text()).not.toContain('onglet')
  })

  it('bâtit le lien du magasin à partir de l’hôte et des numéros du magasin enregistré, jamais d’une page de Leclerc (DRV-629)', () => {
    expect(finalizeLink(null)).toBeNull()
    expect(finalizeLink(null, true)).toBeNull()
    expect(finalizeLink(storeBaseUrl)).toBe(DRIVE_HOME_URL)
    expect(finalizeLink(storeBaseUrl, true)).toBe(basketLink)
    // Une ville, des paramètres ou un identifiant dans l'adresse enregistrée ne passent pas dans le lien : la ville vient de l'application
    expect(finalizeLink(`${storeBaseUrl}-Ville-Test/recherche.aspx?x=1#y`, true)).toBe(basketLink)
    expect(
      finalizeLink('https://nom:secret@courses-test.leclercdrive.fr/magasin-123456-123456', true),
    ).toBe(basketLink)
  })

  it.each([
    'http://courses-test.leclercdrive.fr/magasin-123456-123456',
    'https://courses-test.leclercdrive.fr/',
    'https://courses-test.leclercdrive.fr/autre/magasin-123456-123456',
    'pas une adresse',
  ])('%s : repli sur l’accueil du drive', (base) => {
    expect(finalizeLink(base, true)).toBe(DRIVE_HOME_URL)
  })

  it('le lien ne mène jamais à la page du panier de Leclerc (DRV-631)', () => {
    expect(basketLink).not.toContain('detail-panier')
    expect(finalizeLink(storeBaseUrl, true)).not.toContain('detail-panier')
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
      'Tes choix n’ont pas pu être enregistrés.',
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

  it('trop de demandes (429) : garde le résultat et le même lot, n’insiste pas, et réessaie à la demande', async () => {
    let attempts = 0
    const { wrapper, fetchMock } = await open(
      { kind: 'result', result: result(), draft },
      { 'PUT /api/v1/drive/choices': () => (++attempts < 3 ? rateLimited(1)() : noContent()) },
    )
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    const message = wrapper.find('[role="alert"]').text()
    expect(message).toContain('Ils sont gardés sur cette page.')
    expect(message).toContain(
      'Trop de demandes en peu de temps. Rien n’est perdu. Attends une minute, puis réessaie.',
    )
    expect(message).not.toContain('Tes choix n’ont pas pu être enregistrés')
    // Le résultat, le brouillon et le bouton sont là ; l'écran n'a pas réessayé tout seul
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
    expect(wrapper.text()).toContain('Le panier est rempli')
    expect(wrapper.findAll('main ul > li')).toHaveLength(12)
    expect(attempts).toBe(1)

    // Toujours refusé : même message, rien de perdu, et c'est encore à l'utilisateur de décider
    await press('Réessayer l’enregistrement')
    expect(attempts).toBe(2)
    expect(wrapper.find('[role="alert"]').text()).toContain('Rien n’est perdu')

    await press('Réessayer l’enregistrement')
    await saved(wrapper)

    const puts = calls(fetchMock)
      .map((call, index) => [call, index] as const)
      .filter(([call]) => call === 'PUT /api/v1/drive/choices')
    expect(puts).toHaveLength(3)
    const bodies = await Promise.all(puts.map(([, index]) => bodyOf(fetchMock, index)))
    expect(bodies[1]).toEqual(bodies[0])
    expect(bodies[2]).toEqual(bodies[0])
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('trop de demandes (429) en relisant le plan : rien n’est enregistré, le résultat reste, on réessaie à la demande', async () => {
    let limited = true
    const { wrapper, fetchMock } = await open(
      { kind: 'result', result: result(), draft },
      { 'GET /api/v1/drive/plans/l1': () => (limited ? rateLimited(1)() : json(plan())) },
    )
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text()).toContain('Rien n’est perdu')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
    expect(wrapper.findAll('main ul > li')).toHaveLength(12)

    limited = false
    await press('Réessayer l’enregistrement')
    await saved(wrapper)

    expect(calls(fetchMock)).toContain('PUT /api/v1/drive/choices')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('un résultat sans magasin n’enregistre rien : il ne faut pas mémoriser pour le mauvais magasin', async () => {
    const { store: _store, ...withoutStore } = result()
    const { wrapper, fetchMock } = await open({ kind: 'result', result: withoutStore, draft })
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text()).toContain(
      'Tes choix n’ont pas pu être enregistrés.',
    )
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
  })

  it.each([
    [409, 'DRIVE_STORE_MISMATCH', 'Ton magasin a changé'],
    [422, 'DRIVE_CHOICE_INVALID', 'Ce choix n’est pas valable'],
    [
      422,
      'DRIVE_LIMIT_REACHED',
      'Repas se souvient déjà de trop de produits, ou il y a eu trop d’écritures aujourd’hui',
    ],
    [409, 'DRIVE_NOT_CONFIGURED', 'Choisis d’abord ton magasin'],
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

  it('partial : dit ce qui s’est passé, ce qui est sauf, ce qui reste à faire, et propose de reprendre', async () => {
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

    expect(wrapper.find('h1').text()).toBe('Le panier est rempli en partie')
    expect(wrapper.find('main [role="status"] p').text()).toBe(
      'Leclerc a ralenti les demandes. Ce qui est déjà au panier y reste : il reste 2 articles à ajouter. Attends quelques minutes, puis reprends l’envoi.',
    )
    // « Échecs » n’est plus un compteur : l’échec se dit dans la phrase, et chaque article dans « Détails »
    expect(wrapper.findAll('dl > div').map((cell) => cell.text())).toEqual(['Ajoutés au panier1'])
    expect(wrapper.find('details').text()).toContain(
      'Pas ajouté au panier. La connexion a été coupée pendant l’envoi.',
    )
    // Un seul bouton principal, « Reprendre l’envoi » ; ce qui est déjà au panier se dit en une ligne, sans lien
    expect(wrapper.text()).toContain('Ton panier est prêt. Retrouve-le dans l’appli Drive Leclerc.')
    expect(wrapper.find('a[href="/drive/envoi/l1?ouvrir=1"]').text()).toBe('Reprendre l’envoi')
    expect(wrapper.find('a[href="/drive/envoi/l1?ouvrir=1"]').classes()).toContain('bg-primary')
    expect(wrapper.find('a[target="_blank"]').exists()).toBe(false)
    expect(wrapper.find('a[href*="lignes"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Réessayer les échecs')
  })

  it('partial sans rien au panier ni choisi : « Le panier n’est pas rempli », pas « en partie » (DRV-626)', async () => {
    const event = {
      kind: 'result',
      draft,
      result: result({
        outcome: 'partial',
        lines: [
          { ingredientSlug: 'farine', outcome: 'FAILED', error: 'BLOCKED' },
          { ingredientSlug: 'beurre', outcome: 'FAILED', error: 'BLOCKED' },
          { ingredientSlug: 'lait', outcome: 'UNAVAILABLE' },
        ],
        error: { code: 'BLOCKED', message: 'Trop de demandes' },
      }),
    } as DriveEvent
    const { wrapper } = await open(event)
    await saved(wrapper)

    expect(wrapper.find('h1').text()).toBe('Le panier n’est pas rempli')
    expect(wrapper.text()).not.toContain('Ton panier est prêt')
    // Le texte reste en trois phrases : ce qui s'est passé, ce qui est sauf, l'action
    expect(wrapper.find('main [role="status"] p').text()).toBe(
      'Leclerc a ralenti les demandes. Ce qui est déjà au panier y reste : il reste 3 articles à ajouter. Attends quelques minutes, puis reprends l’envoi.',
    )
    // Aucun compteur à zéro : seul ce qui existe
    expect(wrapper.findAll('dl > div').map((cell) => cell.text())).toEqual(['Indisponibles1'])
    expect(wrapper.find('a[href="/drive/envoi/l1?ouvrir=1"]').classes()).toContain('bg-primary')
  })

  it('un produit choisi sur Leclerc suffit à dire « en partie » : ce qui est choisi est dans le panier', async () => {
    const choisi: ResultLine = {
      ingredientSlug: 'poivre',
      outcome: 'CHOSEN',
      quantity: 1,
      placement: 'PRIMARY',
      product: { id: '555111', label: 'Poivre noir moulu 50 g' },
    }
    const { wrapper } = await open(
      outcomeOf(
        [choisi, { ingredientSlug: 'beurre', outcome: 'FAILED', error: 'NETWORK' }],
        'partial',
      ),
    )
    await saved(wrapper)

    expect(wrapper.find('h1').text()).toBe('Le panier est rempli en partie')
  })

  it('ne propose de reprendre qu’une fois les choix enregistrés', async () => {
    const { wrapper } = await open(outcomeOf(blocked, 'partial'), {
      'PUT /api/v1/drive/choices': () => new Promise<Response>(() => undefined),
    })
    await vi.waitFor(() => expect(useDriveReturnStore().status).toBe('saving'))

    expect(wrapper.find('a[href^="/drive/envoi/"]').exists()).toBe(false)
  })

  it('aborted : le titre dit ce qui s’est passé, le reste dit ce qui est sauf et l’action', async () => {
    const { wrapper } = await open(outcomeOf([], 'aborted'))
    await saved(wrapper)

    expect(wrapper.find('h1').text()).toBe('Tu as arrêté l’envoi')
    expect(wrapper.find('main [role="status"] p').text()).toBe(
      'Ce qui est déjà au panier y reste. Reprends l’envoi quand tu veux.',
    )
    expect(wrapper.find('a[href="/drive/envoi/l1?ouvrir=1"]').classes()).toContain('bg-primary')
    expect(wrapper.find('dl').exists()).toBe(false)
  })

  it('aborted avec le code d’une annulation : ce n’est pas une panne, le code n’est lu que dans « Détails »', async () => {
    const event = {
      kind: 'result',
      draft,
      result: result({
        outcome: 'aborted',
        lines: [],
        error: { code: 'CANCELLED', message: 'Envoi annulé' },
      }),
    } as DriveEvent
    const { wrapper } = await open(event)
    await saved(wrapper)

    expect(wrapper.find('main [role="status"] p').text()).not.toContain('annulé')
    expect(wrapper.find('details').text()).toContain('Code : CANCELLED')
  })

  it.each([
    [
      'NOT_LOGGED_IN',
      'Tu n’es pas connecté à Leclerc. Ce qui est déjà au panier y reste. Connecte-toi à Leclerc, puis reprends l’envoi.',
      'Reprendre l’envoi',
    ],
    [
      'STORE_MISMATCH',
      'Le magasin ouvert sur Leclerc n’est pas le tien. Ce qui est déjà au panier y reste. Ouvre ton magasin sur Leclerc, puis reprends l’envoi.',
      'Reprendre l’envoi',
    ],
    [
      'NETWORK',
      'La connexion a été coupée pendant l’envoi. Ce qui est déjà au panier y reste. Vérifie ta connexion, puis reprends l’envoi.',
      'Reprendre l’envoi',
    ],
    [
      'UNSUPPORTED_PAGE',
      'Repas ne peut pas travailler sur cette page de Leclerc. Ce qui est déjà au panier y reste. Ouvre la page de ton magasin, puis reprends l’envoi.',
      'Reprendre l’envoi',
    ],
    [
      'CONTRACT_CHANGED',
      'Leclerc a changé son site, l’envoi automatique est arrêté. Ce qui est déjà au panier y reste. Cherche tes produits à la main sur Leclerc.',
      'Chercher à la main sur Leclerc',
    ],
    [
      'INVALID_MESSAGE',
      'L’application n’a pas compris l’envoi. Ce qui est déjà au panier y reste. Mets l’application à jour, puis reprends l’envoi.',
      'Mettre à jour l’application',
    ],
  ] as const)(
    'error %s : trois phrases, un seul bouton principal, le code seulement dans « Détails »',
    async (code, sentences, primary) => {
      const event = {
        kind: 'result',
        draft,
        result: result({
          outcome: 'error',
          lines: [],
          error: { code, message: 'Le site a changé (SEARCH_NO_STATE)' },
        }),
      } as DriveEvent
      const { wrapper } = await open(event)
      await saved(wrapper)

      expect(wrapper.find('h1').text()).toBe('L’envoi s’est arrêté')
      expect(wrapper.find('main [role="status"] p').text()).toBe(sentences)
      const principal = wrapper
        .find('main')
        .findAll('a, button')
        .filter((item) => item.classes().includes('bg-primary'))
      expect(principal.map((item) => item.text().replace(/\s*\(.*\)$/, ''))).toEqual([primary])
      expect(wrapper.find('details').text()).toContain('Code : ' + code)
      expect(wrapper.find('details').text()).toContain('SEARCH_NO_STATE')
      // Rien n’est au panier : pas de « Ton panier est prêt » ; reprendre reste possible sans être la première action
      expect(wrapper.text()).not.toContain('Ton panier est prêt')
      expect(wrapper.find('a[href="/drive/envoi/l1?ouvrir=1"]').exists()).toBe(true)
      expect(wrapper.find('a[href*="lignes"]').exists()).toBe(false)
    },
  )
})

describe('retour du drive : la recherche qui a fait trouver le produit (DRV-650)', () => {
  const chosen = (slug: string, extra: Partial<Extract<ResultLine, { outcome: 'CHOSEN' }>> = {}) =>
    ({
      ingredientSlug: slug,
      outcome: 'CHOSEN',
      quantity: 1,
      placement: 'PRIMARY',
      product: { id: '555999', label: 'Produit de test' },
      ...extra,
    }) as ResultLine
  const sentOf = (lines: ResultLine[]) =>
    ({ kind: 'result', result: result({ lines }), draft: sentDraft }) as DriveEvent
  const putChoices = async (fetchMock: ReturnType<typeof stubApi>) => {
    const body = (await bodyOf(
      fetchMock,
      calls(fetchMock).indexOf('PUT /api/v1/drive/choices'),
    )) as {
      choices: { ingredientSlug: string; action: string; searchQuery?: unknown }[]
    }

    return { body, text: JSON.stringify(body) }
  }

  it('part avec l’ajout du produit (ADD_PRODUCT), nettoyée, et seulement pour cet ajout', async () => {
    const { wrapper, fetchMock } = await open(
      sentOf([
        chosen('poivre', { searchQuery: '  poivre\u200B   noir ' }),
        chosen('curry', { placement: 'FALLBACK', searchQuery: 'curry doux' }),
      ]),
    )
    await saved(wrapper)

    const { body } = await putChoices(fetchMock)
    expect(body.choices.map((c) => [c.ingredientSlug, c.action, c.searchQuery])).toEqual([
      ['poivre', 'ADD_PRODUCT', 'poivre noir'],
      ['curry', 'ADD_PRODUCT', undefined],
    ])
  })

  it('sans recherche dans le résultat, la clé n’est pas envoyée : jamais « null », qui effacerait la recherche mémorisée', async () => {
    const { wrapper, fetchMock } = await open(
      sentOf([chosen('poivre'), chosen('curry', { searchQuery: 'x' })]),
    )
    await saved(wrapper)

    const { text } = await putChoices(fetchMock)
    expect(text).toContain('ADD_PRODUCT')
    expect(text).not.toContain('searchQuery')
  })

  it('le texte de la personne ne figure dans aucune adresse', async () => {
    const { wrapper, fetchMock } = await open(
      sentOf([chosen('poivre', { searchQuery: 'poivre noir secret' })]),
    )
    await saved(wrapper)

    for (const [input] of fetchMock.mock.calls) {
      expect(decodeURIComponent((input as Request).url)).not.toContain('secret')
    }
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
    // Dit sans jargon, et seulement dans « Détails »
    expect(wrapper.find('details').text()).toContain(
      '3 articles ne figuraient pas dans ta liste : Repas les a laissés de côté.',
    )
    expect(wrapper.text()).not.toContain('inattendu')
    expect(wrapper.findAll('main ul > li').map((item) => item.find('p').text())).toEqual([
      'Farine',
      'Poivre',
    ])
    expect(wrapper.text()).not.toContain('pirate')
    expect(wrapper.findAll('dl > div')[0]?.text()).toBe('Ajoutés au panier1')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('dit « 1 article ne figurait pas dans ta liste » au singulier, et n’appelle pas le back quand plus rien ne reste', async () => {
    const { wrapper, fetchMock } = await open(sentOf([chosen('pirate')]))
    await saved(wrapper)

    expect(wrapper.find('details').text()).toContain(
      '1 article ne figurait pas dans ta liste : Repas l’a laissé de côté.',
    )
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(wrapper.findAll('main ul > li')).toHaveLength(0)
  })

  it('ne dit rien quand tout s’explique par le plan', async () => {
    const { wrapper } = await open({ kind: 'result', result: result(), draft: sentDraft })
    await saved(wrapper)

    expect(wrapper.text()).not.toContain('ne figurait')
    expect(wrapper.findAll('details li')).toHaveLength(12)
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
    expect(wrapper.text()).not.toContain('ne figurait')
  })

  it('refuse le même produit choisi pour la même ligne quand elle n’avait pas été remplacée', async () => {
    const { wrapper, fetchMock } = await open(sentOf([chosen('farine')]))
    await saved(wrapper)

    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(wrapper.text()).toContain('1 article ne figurait pas dans ta liste')
  })

  it('ne compte pas, parmi ce qui reste à ajouter, une ligne que le plan n’explique pas', async () => {
    const lines: ResultLine[] = [
      { ingredientSlug: 'beurre', outcome: 'FAILED', error: 'NETWORK' },
      { ingredientSlug: 'pirate', outcome: 'FAILED', error: 'NETWORK' },
    ]
    const { wrapper } = await open({
      kind: 'result',
      result: result({ lines, outcome: 'partial' }),
      draft: sentDraft,
    })
    await saved(wrapper)

    expect(wrapper.find('main [role="status"] p').text()).toContain('il reste 1 article à ajouter')
    expect(wrapper.text()).not.toContain('pirate')
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
      expect(wrapper.find('details').text()).toContain(
        '2 articles ne figuraient pas dans ta liste : Repas les a laissés de côté.',
      )
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
        'Tes choix n’ont pas pu être enregistrés.',
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

describe('retour du drive : « Tes choix sont enregistrés » ne se dit que s’il y a un choix enregistré (DRV-626)', () => {
  const saidSaved = 'Tes choix sont enregistrés pour les prochains envois.'
  const chosen: ResultLine = {
    ingredientSlug: 'poivre',
    outcome: 'CHOSEN',
    quantity: 1,
    placement: 'PRIMARY',
    product: { id: '555111', label: 'Poivre noir moulu 50 g' },
  }
  const priced: ResultLine = {
    ingredientSlug: 'farine',
    outcome: 'ADDED',
    productId: '123456',
    quantity: 1,
    usedRank: 1,
    price: { cents: 189 },
  }

  it('un produit choisi : la phrase est dite', async () => {
    const { wrapper, fetchMock } = await open(outcomeOf([chosen]))
    await saved(wrapper)

    expect(wrapper.text()).toContain(saidSaved)
    expect(calls(fetchMock)).toContain('PUT /api/v1/drive/choices')
  })

  it('un « j’en ai toujours » ou un produit à ne plus proposer est un choix aussi', async () => {
    const { wrapper } = await open(outcomeOf([{ ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' }]))
    await saved(wrapper)

    expect(wrapper.text()).toContain(saidSaved)
  })

  it('un envoi arrêté sans rien choisi (erreur du site, du réseau, de l’application) : la phrase est tue', async () => {
    const event = {
      kind: 'result',
      draft,
      result: result({
        outcome: 'error',
        lines: [],
        error: { code: 'NOT_LOGGED_IN', message: 'Non connecté' },
      }),
    } as DriveEvent
    const { wrapper } = await open(event)
    await saved(wrapper)

    expect(wrapper.text()).not.toContain('Tes choix')
    expect(wrapper.text()).not.toContain('Enregistrement de tes choix')
  })

  it('tout était déjà choisi : seuls les prix sont relus, aucun choix n’est enregistré, la phrase est tue', async () => {
    const { wrapper, fetchMock } = await open(outcomeOf([priced]))
    await saved(wrapper)

    // Le prix lu est bien enregistré (il sert à l'estimation) ; ce n'est pas un choix de l'utilisateur
    expect(calls(fetchMock)).toContain('PUT /api/v1/drive/choices')
    expect(wrapper.text()).not.toContain('Tes choix')
  })

  it('tout est passé ou indisponible : rien à enregistrer, la phrase est tue', async () => {
    const { wrapper, fetchMock } = await open(
      outcomeOf([
        { ingredientSlug: 'farine', outcome: 'SKIPPED' },
        { ingredientSlug: 'beurre', outcome: 'UNAVAILABLE' },
      ]),
    )
    await saved(wrapper)

    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(wrapper.text()).not.toContain('Tes choix')
  })

  it('un échec d’enregistrement reste dit, avec « Réessayer l’enregistrement »', async () => {
    const { wrapper } = await open(outcomeOf([chosen]), {
      'PUT /api/v1/drive/choices': failure(500, 'Erreur'),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('n’ont pas pu être enregistrés'))

    expect(wrapper.text()).toContain('Réessayer l’enregistrement')
    expect(wrapper.text()).not.toContain(saidSaved)
  })
})

describe('retour du drive : ce qui n’est pas le résultat du dernier envoi', () => {
  it('sans événement : rien à afficher', async () => {
    const { wrapper, fetchMock } = await open(null)

    expect(wrapper.find('h1').text()).toBe('Aucun récapitulatif à afficher')
    expect(
      calls(fetchMock).filter((call) => call.startsWith('PUT') || call.includes('/plans/')),
    ).toEqual([])
    // Pas une impasse : un seul bouton principal, « Ouvrir mes listes » (DRV-626)
    const toLists = wrapper.find('main a.bg-primary')
    expect(toLists.text()).toBe('Ouvrir mes listes')
    expect(toLists.attributes('href')).toBe('/listes')
    expect(wrapper.findAll('main a.bg-primary')).toHaveLength(1)
  })

  it('un résultat d’un autre envoi est ignoré : rien n’est enregistré, le brouillon reste', async () => {
    const { wrapper, fetchMock } = await open({
      kind: 'stale',
      result: result({ runId: '0b6d1a3e-7c1f-4a55-9a8e-2f4d9c3b7e10' }),
    })

    expect(wrapper.find('h1').text()).toBe('Ce récapitulatif ne correspond pas à ton dernier envoi')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
  })

  it('un refus de l’application : le brouillon de ce passage est effacé et on peut revenir à l’envoi', async () => {
    const { wrapper } = await open({ kind: 'refused', code: 'UNAVAILABLE', runId: RUN })

    expect(wrapper.find('h1').text()).toBe('L’envoi n’a pas démarré')
    expect(wrapper.find('[role="alert"]').text()).toContain('Rien n’a été mis au panier.')
    // Le code n’est lu que dans « Détails », replié
    expect(wrapper.find('details').text()).toContain('Code : UNAVAILABLE')
    expect(wrapper.find('p.text-lg').text()).not.toContain('UNAVAILABLE')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(wrapper.find('a[href="/drive/envoi/l1"]').text()).toBe('Revenir à l’envoi')
    expect(wrapper.find('a[href="/drive/envoi/l1"]').classes()).toContain('bg-primary')
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

    expect(wrapper.find('h1').text()).toBe('Le drive n’a pas répondu comme prévu')
    expect(wrapper.find('[role="alert"]').text()).toContain(
      'Rien n’a été perdu. Mets l’application à jour, puis réessaie.',
    )
    expect(wrapper.find('a[href="/drive/aide#mise-a-jour"]').text()).toBe(
      'Mettre à jour l’application',
    )
    expect(wrapper.find('details').text()).toContain('Détail : lines[0]')
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
      'La liste sera terminée.',
    )
    expect(document.body.querySelector('[role="dialog"]')?.textContent).not.toContain('vidé')
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
