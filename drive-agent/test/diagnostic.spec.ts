// Le mode diagnostic (DRV-308) : l'auto-test en lecture seule et son rapport copiable. Les pages sont les fixtures inventées, le site un
// faux `fetch`, l'horloge fausse ; aucun réseau.
import { describe, expect, it, vi } from 'vitest'

import {
  CHECK_IDS,
  dateOf,
  hostFamily,
  reportOf,
  rowsOf,
  runChecks,
  showDiagnostic,
  storeTail,
  type CheckResult,
  type ChecksDeps,
  type DiagnosticDeps,
} from '../src/diagnostic'
import { LeclercAdapter, type RetailerAdapter } from '../src/leclerc'
import type { DiagnosticProps, DiagnosticRow, DiagnosticView } from '../src/ui'
import { fakeAdapter, fakeStorage, fakeUi, fakeWakeLock } from './flow-helpers'
import { fakeSite, fixture, PAGE, type Scripted } from './leclerc-helpers'

const NOW = Date.UTC(2026, 9, 18, 14, 3, 27)
const GOOD: Scripted = { body: fixture('recherche-farine.html') }

/** Le vrai adaptateur sur un faux site ; `reply` donne la réponse à chaque requête. */
function site(
  reply: Scripted | ((url: string) => Scripted) = GOOD,
  location?: { hostname: string; pathname: string },
) {
  const fake = fakeSite(
    (call) => (typeof reply === 'function' ? reply(call.url) : reply),
    location ? { location } : {},
  )
  return { fake, adapter: new LeclercAdapter(fake.deps) }
}

const deps = (adapter: RetailerAdapter, extra: Partial<ChecksDeps> = {}): ChecksDeps => ({
  adapter,
  agentVersion: '0.5.0',
  storage: fakeStorage(),
  wakeLock: fakeWakeLock().wakeLock,
  originReplaced: true,
  ...extra,
})

const run = async (checks: ChecksDeps) => {
  const seen: CheckResult[] = []
  const { results, page, stats } = await runChecks(checks, (result) => seen.push(result))
  return {
    results,
    page,
    stats,
    seen,
    by: Object.fromEntries(results.map((result) => [result.id, result])),
  }
}

describe('en fonctionnement normal', () => {
  it('tous les contrôles réussissent, sauf le cadre natif (non utilisé) ; rien n’est écrit au panier', async () => {
    // Given
    const { adapter, fake } = site()

    // When
    const { results, by } = await run(deps(adapter))

    // Then
    expect(results.map((result) => result.id)).toEqual([...CHECK_IDS])
    expect(results.map((result) => [result.id, result.status])).toEqual([
      ['agent', 'OK'],
      ['page', 'OK'],
      ['origin', 'OK'],
      ['session', 'OK'],
      ['wakeLock', 'OK'],
      ['search', 'OK'],
      ['content', 'OK'],
      ['frame', 'NOT_TESTED'],
    ])
    expect(by.agent?.detail).toBe('version 0.5.0')
    expect(by.page?.detail).toBe('hôte fd0, magasin …123')
    expect(by.search?.detail).toBe(
      '« sel » : 5 produits lus, 5 avec tous les champs attendus (identifiant, libellé, prix, stock)',
    )
    // Cinq recherches (le mot courant, le mot absurde des sondes, puis trois produits frais, DRV-646), aucun appel au panier.
    expect(fake.calls).toHaveLength(5)
    expect(fake.calls[0]?.url).toContain('/recherche.aspx?TexteRecherche=sel')
    expect(fake.calls[1]?.url).toContain('/recherche.aspx?TexteRecherche=zzqxkw')
    expect(fake.calls.slice(2).map((call) => call.url.split('=').pop())).toEqual([
      'tomate',
      'pomme',
      'courgette',
    ])
    expect(fake.calls.every((call) => call.init.method === 'GET')).toBe(true)
  })

  it('rend chaque résultat dès qu’il est connu, dans l’ordre', async () => {
    const { adapter } = site()

    const { seen, results } = await run(deps(adapter))

    expect(seen).toEqual(results)
  })

  it('le pont de l’application n’a pas d’origine à vérifier : « non testé »', async () => {
    const { by } = await run(deps(site().adapter, { originReplaced: null }))

    expect(by.origin).toMatchObject({ status: 'NOT_TESTED' })
  })
})

describe('quand le site ne répond pas comme prévu', () => {
  it('une page de recherche refaite : « recherche » est KO CONTRACT_CHANGED, le contenu n’est pas testé', async () => {
    const { by } = await run(deps(site({ body: fixture('recherche-changee.html') }).adapter))

    expect(by.search).toMatchObject({ status: 'KO', code: 'CONTRACT_CHANGED' })
    expect(by.content).toMatchObject({ status: 'NOT_TESTED' })
    expect(by.page).toMatchObject({ status: 'OK' })
  })

  it('aucun produit pour le mot d’essai : KO CONTRACT_CHANGED', async () => {
    const { by } = await run(deps(site({ body: fixture('recherche-vide.html') }).adapter))

    expect(by.search).toMatchObject({
      status: 'KO',
      code: 'CONTRACT_CHANGED',
      detail: '« sel » : aucun produit lu',
    })
    expect(by.content).toMatchObject({ status: 'NOT_TESTED' })
  })

  it('des réponses 403 : « recherche » est KO BLOCKED, sans autre requête que la recherche (reprise comprise)', async () => {
    const { adapter, fake } = site({ status: 403 })

    const { by } = await run(deps(adapter))

    expect(by.search).toMatchObject({ status: 'KO', code: 'BLOCKED' })
    expect(by.content).toMatchObject({ status: 'NOT_TESTED' })
    expect(fake.calls.length).toBeLessThanOrEqual(2)
    expect(fake.calls.every((call) => call.url.includes('recherche.aspx'))).toBe(true)
  })

  it.each([
    ['401', { status: 401 }, 'NOT_LOGGED_IN'],
    ['une erreur du serveur', { status: 500 }, 'NETWORK'],
    ['une réponse inattendue', { status: 404 }, 'CONTRACT_CHANGED'],
  ] as const)('%s : KO %s', async (_name, reply, code) => {
    const { by } = await run(deps(site(reply).adapter))

    expect(by.search).toMatchObject({ status: 'KO', code })
  })

  it('une erreur réseau : KO NETWORK', async () => {
    const { by } = await run(deps(site(new Error('réseau coupé')).adapter))

    expect(by.search).toMatchObject({ status: 'KO', code: 'NETWORK' })
  })

  it('une erreur imprévue de l’adaptateur : KO CONTRACT_CHANGED, sans citer son message', async () => {
    const adapter = fakeAdapter(
      {},
      {
        before: () => {
          throw new Error('secret interne')
        },
      },
    ).adapter

    const { by } = await run(deps(adapter))

    expect(by.search).toMatchObject({ status: 'KO', code: 'CONTRACT_CHANGED' })
    expect(JSON.stringify(by)).not.toContain('secret interne')
  })

  it('des produits sans prix ni stock : champs attendus absents, KO CONTRACT_CHANGED', async () => {
    const adapter = {
      ...fakeAdapter().adapter,
      searchProducts: () =>
        Promise.resolve([
          { id: '1', label: 'A', label2: null, price: null, stock: null },
          { id: '2', label: '', label2: null, price: 1, stock: 1 },
          { id: 'x', label: 'C', label2: null, price: 1, stock: 1 },
        ] as never),
    }

    const { by } = await run(deps(adapter))

    expect(by.search).toMatchObject({ status: 'KO', code: 'CONTRACT_CHANGED' })
    expect(by.search?.detail).toContain('seulement 0 avec tous les champs attendus')
  })

  it('un contenu net illisible pour la plupart des produits : KO CONTRACT_CHANGED', async () => {
    const adapter = {
      ...fakeAdapter().adapter,
      searchProducts: () =>
        Promise.resolve(
          ['1', '2', '3'].map((id) => ({
            id,
            label: 'Produit de test',
            label2: null,
            price: 100,
            stock: 3,
            content: id === '1' ? { value: 500, unit: 'g' } : null,
          })) as never,
        ),
    }

    const { by } = await run(deps(adapter))

    expect(by.search).toMatchObject({ status: 'OK' })
    expect(by.content).toMatchObject({
      status: 'KO',
      code: 'CONTRACT_CHANGED',
      detail: 'seulement 1 produits sur 3',
    })
  })
})

describe('les compteurs de requêtes du diagnostic (ticket L)', () => {
  it('runChecks rend les compteurs de l’adaptateur : des nombres, une recherche du mot courant et celle du mot absurde', async () => {
    const { adapter } = site(GOOD)

    const { stats } = await run(deps(adapter))

    expect(stats.requests).toBeGreaterThanOrEqual(2)
    expect(Object.values(stats).every((value) => typeof value === 'number')).toBe(true)
  })

  it('le rapport les dit sur une ligne de nombres : requêtes, erreurs, blocages, délais dépassés, réponses lentes, pause la plus longue', () => {
    const report = reportOf('0.5.0', NOW, null, [], null, {
      requests: 12,
      errors: 1,
      blocks: 2,
      timeouts: 1,
      slow: 3,
      peakPauseMs: 1600,
    })

    expect(report).toContain(
      'Requêtes du diagnostic : 12 (erreurs 1, blocages 2, délais dépassés 1, réponses lentes 3), pause la plus longue 1600 ms',
    )
  })

  it('sans compteurs, le rapport reste celui d’avant', () => {
    expect(reportOf('0.5.0', NOW, null, [])).not.toContain('Requêtes du diagnostic')
  })
})

describe('l’environnement de la page', () => {
  it('une page qui n’est pas celle d’un magasin : KO UNSUPPORTED_PAGE, et le site n’est pas interrogé', async () => {
    const { adapter, fake } = site(GOOD, { hostname: 'www.exemple.invalid', pathname: '/accueil' })

    const { by, page } = await run(deps(adapter))

    expect(by.page).toMatchObject({ status: 'KO', code: 'UNSUPPORTED_PAGE' })
    expect(by.search).toMatchObject({ status: 'NOT_TESTED' })
    expect(by.content).toMatchObject({ status: 'NOT_TESTED' })
    expect(page).toBeNull()
    expect(fake.calls).toEqual([])
  })

  it('le marqueur d’origine non remplacé : KO UNSUPPORTED_PAGE', async () => {
    const { by } = await run(deps(site().adapter, { originReplaced: false }))

    expect(by.origin).toMatchObject({ status: 'KO', code: 'UNSUPPORTED_PAGE' })
  })

  it.each([
    ['absent', null],
    [
      'qui lance une erreur',
      {
        length: 0,
        key: () => null,
        getItem: () => {
          throw new Error('interdit')
        },
        setItem: () => {
          throw new Error('interdit')
        },
        removeItem: () => undefined,
      },
    ],
  ])('un stockage de session %s : KO, sans code', async (_name, storage) => {
    const { by } = await run(deps(site().adapter, { storage }))

    expect(by.session).toEqual({
      id: 'session',
      status: 'KO',
      detail: expect.stringContaining('inaccessible'),
    })
  })

  it('un stockage qui perd ce qu’on lui écrit : KO', async () => {
    const storage = { ...fakeStorage(), getItem: () => null }

    const { by } = await run(deps(site().adapter, { storage }))

    expect(by.session).toMatchObject({ status: 'KO' })
  })

  it('le stockage d’essai est effacé après le contrôle', async () => {
    const storage = fakeStorage()

    await run(deps(site().adapter, { storage }))

    expect(storage.data.size).toBe(0)
  })

  it('pas de Wake Lock : KO, mais toléré', async () => {
    const { by } = await run(deps(site().adapter, { wakeLock: null }))

    expect(by.wakeLock).toMatchObject({ status: 'KO', detail: expect.stringContaining('toléré') })
  })
})

describe('ce que le rapport laisse voir', () => {
  it('cache le numéro de magasin (trois chiffres au plus), ne garde que la famille de l’hôte', () => {
    expect(storeTail('000123')).toBe('…123')
    expect(storeTail('123')).toBe('…')
    expect(storeTail('7')).toBe('…')
    expect(hostFamily('fd9-courses.leclercdrive.fr')).toBe('fd9')
    expect(hostFamily('FD12-courses.leclercdrive.fr')).toBe('fd12')
    expect(hostFamily('ville-test-courses.leclercdrive.fr')).toBe('autre hôte leclercdrive.fr')
    expect(hostFamily('m-courses.leclercdrive.fr')).toBe('site mobile (pas la version ordinateur)')
  })

  it('ne contient aucune des valeurs interdites : numéro entier, ville, cookie, libellé de produit, adresse', async () => {
    // Given : une page dont l'adresse a un numéro et une ville inventés, un cookie, et des produits aux libellés connus
    document.cookie = 'sessionid=VALEUR-DE-COOKIE-INVENTEE'
    const fake = fakeSite(() => GOOD, {
      location: {
        hostname: 'fd9-courses.leclercdrive.fr',
        pathname: '/magasin-123456-123456-Ville-Test/recherche.aspx',
      },
      pageText: () => 'compte : jean.dupont@exemple.invalid',
      readLabel: () => 'Drive de Ville-Test',
    })
    const { results, page } = await run(deps(new LeclercAdapter(fake.deps)))

    // When
    const report = reportOf('0.5.0', NOW, page, results)

    // Then
    const forbidden = [
      '123456',
      'Ville-Test',
      'VALEUR-DE-COOKIE-INVENTEE',
      'sessionid',
      'jean.dupont',
      'Drive de',
      'Moulin Imaginaire',
      'Farine de blé',
      'TexteRecherche',
      'https://',
      'magasin-',
    ]
    expect(forbidden.filter((value) => report.includes(value))).toEqual([])
    expect(report).toContain('Magasin : …456')
    expect(report).toContain('Hôte : fd9')
    document.cookie = 'sessionid=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('porte la version, la date à la minute en temps universel, chaque contrôle et la mention « aucune écriture »', async () => {
    const { results, page } = await run(deps(site({ status: 403 }).adapter))

    const report = reportOf('0.5.0', NOW, page, results)

    expect(report.split('\n')).toEqual([
      'Repas Drive : diagnostic',
      'Agent : 0.5.0',
      'Date : 2026-10-18 14:03 UTC',
      'Hôte : fd0',
      'Magasin : …123',
      'Connexion : indéterminé (aucun signe)',
      '',
      '[OK] Version de l’agent : version 0.5.0',
      '[OK] Page prise en charge : hôte fd0, magasin …123',
      '[OK] Origine de Repas dans l’agent : origine écrite dans l’agent',
      '[OK] Stockage de session : lecture et écriture possibles',
      '[OK] Écran allumé (Wake Lock) : disponible',
      '[KO BLOCKED] Recherche d’un mot courant',
      '[NON TESTÉ] Contenu net des produits : recherche impossible, contenu non analysé',
      '[NON TESTÉ] Cadre de même origine : non utilisé : l’agent affiche lui-même la liste de produits',
      '',
      'Aucune écriture au panier.',
      'Ce rapport ne contient ni cookie, ni identifiant de compte, ni adresse, ni nom, ni numéro de magasin complet.',
    ])
  })

  it('une page non prise en charge n’a ni hôte ni magasin dans le rapport', () => {
    const report = reportOf('0.5.0', NOW, null, [
      { id: 'page', status: 'KO', code: 'UNSUPPORTED_PAGE' },
    ])

    expect(report).not.toContain('Hôte')
    expect(report).not.toContain('Magasin')
    expect(report).toContain('[KO UNSUPPORTED_PAGE] Page prise en charge')
  })

  it('les lignes de l’écran attendent tant qu’un contrôle n’a pas rendu son résultat', () => {
    const rows = rowsOf([{ id: 'agent', status: 'OK', detail: 'version 1.0.0' }])

    expect(rows).toHaveLength(CHECK_IDS.length)
    expect(rows[0]).toEqual({
      label: 'Version de l’agent',
      badge: 'OK',
      detail: 'version 1.0.0',
      tone: 'ok',
    })
    expect(rows.slice(1).every((row) => row.badge === '…' && row.tone === 'wait')).toBe(true)
  })

  it('met la date à la minute, en temps universel', () => {
    expect(dateOf(NOW)).toBe('2026-10-18 14:03 UTC')
  })
})

describe('l’écran du diagnostic', () => {
  /** L'utilisateur devant l'écran : il attend la fin des contrôles, puis ferme. */
  function screen() {
    const updates: (readonly DiagnosticRow[])[] = []
    const finished: { summary: string; report: string }[] = []
    const ui = fakeUi({
      diagnostic: (value: DiagnosticProps) =>
        new Promise<'close'>((resolve) => {
          const view: DiagnosticView = {
            update: (rows) => void updates.push(rows),
            finish: (summary, report) => {
              finished.push({ summary, report })
              resolve('close')
            },
          }
          value.start(view)
        }),
    })
    return { ui, updates, finished }
  }

  it('affiche chaque contrôle qui avance, puis le résumé et le rapport, et rend la main à la fermeture', async () => {
    // Given
    const { adapter } = site()
    const { ui, updates, finished } = screen()
    const copy = vi.fn<(text: string) => Promise<boolean>>().mockResolvedValue(true)
    const full: DiagnosticDeps = { ...deps(adapter), ui: ui.ui, now: () => NOW, copy }

    // When
    await showDiagnostic(full)

    // Then
    expect(ui.screens()).toEqual(['diagnostic'])
    expect(updates[0]?.every((row) => row.tone === 'wait')).toBe(true)
    expect(updates.at(-1)?.map((row) => row.tone)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'skip',
    ])
    expect(updates.length).toBe(CHECK_IDS.length + 1)
    expect(finished[0]?.summary).toBe('Contrôles terminés : 7 réussis, 0 en échec, 1 non testé.')
    expect(finished[0]?.report).toContain('Agent : 0.5.0')
    expect(ui.propsOf('diagnostic')[0]?.copy).toBe(copy)
  })
})

describe('la cause précise d’un échec dans le diagnostic (ticket A)', () => {
  const rowOf = (results: readonly CheckResult[], id: (typeof CHECK_IDS)[number]) =>
    rowsOf(results)[CHECK_IDS.indexOf(id)]

  it('une page de recherche refaite : la cause est lue dans la ligne et dans le rapport', async () => {
    const { results, page, by } = await run(
      deps(site({ body: fixture('recherche-changee.html') }).adapter),
    )

    expect(by.search).toMatchObject({
      status: 'KO',
      code: 'CONTRACT_CHANGED',
      cause: 'SEARCH_NO_STATE',
    })
    expect(rowOf(results, 'search')?.detail).toBe(
      'cause SEARCH_NO_STATE : page de recherche sans l’état embarqué du magasin',
    )
    expect(reportOf('0.5.0', NOW, page, results)).toContain(
      '[KO CONTRACT_CHANGED] Recherche d’un mot courant : cause SEARCH_NO_STATE : page de recherche sans l’état embarqué du magasin',
    )
  })

  it('des produits aux champs renommés ne sont pas pris pour une recherche vide', async () => {
    const { by } = await run(
      deps(site({ body: fixture('recherche-liste-illisible.html') }).adapter),
    )

    expect(by.search).toMatchObject({
      code: 'CONTRACT_CHANGED',
      cause: 'SEARCH_PRODUCTS_UNREADABLE',
    })
  })

  it.each([
    ['une réponse inattendue', { status: 404 }, 'HTTP_404'],
    ['un 401', { status: 401 }, 'HTTP_401'],
  ] as const)('%s : cause %s', async (_name, reply, cause) => {
    const { by } = await run(deps(site(reply).adapter))

    expect(by.search?.cause).toBe(cause)
  })

  it('une page « aucun résultat » pour le mot courant : le rapport le dit comme une anomalie, avec sa cause', async () => {
    const { by, results, page } = await run(
      deps(site({ body: fixture('recherche-vide-sans-liste.html') }).adapter),
    )

    expect(by.search).toMatchObject({
      status: 'KO',
      code: 'CONTRACT_CHANGED',
      cause: 'SEARCH_COMMON_EMPTY',
    })
    expect(reportOf('0.5.0', NOW, page, results)).toContain(
      '« sel » : aucun produit lu ; cause SEARCH_COMMON_EMPTY',
    )
  })

  it('des produits incomplets, un contenu net illisible : une cause chacun', async () => {
    const incomplete = {
      ...fakeAdapter().adapter,
      searchProducts: () =>
        Promise.resolve([{ id: '1', label: 'A', label2: null, price: null, stock: null }] as never),
    }
    const unreadable = {
      ...fakeAdapter().adapter,
      searchProducts: () =>
        Promise.resolve(
          ['1', '2', '3'].map((id) => ({
            id,
            label: 'Produit de test',
            label2: null,
            price: 100,
            stock: 3,
            content: null,
          })) as never,
        ),
    }

    expect((await run(deps(incomplete))).by.search?.cause).toBe('SEARCH_FIELDS_INCOMPLETE')
    expect((await run(deps(unreadable))).by.content?.cause).toBe('CONTENT_UNREADABLE')
  })

  it('une erreur imprévue de l’adaptateur s’appelle EXCEPTION, sans citer son message', async () => {
    const adapter = fakeAdapter(
      {},
      {
        before: () => {
          throw new Error('secret interne')
        },
      },
    ).adapter

    const { by, results, page } = await run(deps(adapter))

    expect(by.search).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'EXCEPTION' })
    expect(reportOf('0.5.0', NOW, page, results)).not.toContain('secret interne')
  })

  it('le site mobile : KO UNSUPPORTED_PAGE de cause PAGE_MOBILE, sans aucune requête (ticket J)', async () => {
    const { adapter, fake } = site(GOOD, {
      hostname: 'm-courses.leclercdrive.fr',
      pathname: '/magasin-000123-000123-Ville-Test/recherche.aspx',
    })

    const { by, page } = await run(deps(adapter))

    expect(by.page).toMatchObject({ status: 'KO', code: 'UNSUPPORTED_PAGE', cause: 'PAGE_MOBILE' })
    expect(by.search).toMatchObject({ status: 'NOT_TESTED' })
    expect(page).toBeNull()
    expect(fake.calls).toEqual([])
  })

  it('une page non prise en charge dit pourquoi', async () => {
    const { by } = await run(
      deps(site(GOOD, { hostname: PAGE.hostname, pathname: '/accueil' }).adapter),
    )

    expect(by.page).toMatchObject({ status: 'KO', code: 'UNSUPPORTED_PAGE', cause: 'PAGE_PATH' })
  })
})

describe('la connexion de l’utilisateur dans le diagnostic (ticket G)', () => {
  const NAV = '<nav><a href="/accueil">Accueil</a> <a href="/panier">Panier</a></nav>'
  const visitorPage = fixture('recherche-farine.html').replace(
    NAV,
    '<nav><a>Se connecter</a> <a>Créer un compte</a></nav>',
  )
  const memberPage = fixture('recherche-farine.html').replace(
    NAV,
    '<nav><a>Se déconnecter</a></nav>',
  )

  it('le rapport dit ce que la page montre de la connexion, avec les noms des signes lus', async () => {
    const fake = fakeSite(() => GOOD, { pageText: () => memberPage })
    const { results, page } = await run(deps(new LeclercAdapter(fake.deps)))

    expect(page?.session).toBe('connecté (signes : LOGOUT_LINK)')
    expect(reportOf('0.5.0', NOW, page, results)).toContain(
      'Connexion : connecté (signes : LOGOUT_LINK)',
    )
  })

  it('un visiteur : la recherche est KO NOT_LOGGED_IN (SESSION_VISITOR) et le rapport le dit', async () => {
    const fake = fakeSite(() => ({ body: visitorPage }), { pageText: () => visitorPage })

    const { by, results, page } = await run(deps(new LeclercAdapter(fake.deps)))

    expect(by.search).toMatchObject({
      status: 'KO',
      code: 'NOT_LOGGED_IN',
      cause: 'SESSION_VISITOR',
    })
    expect(by.content).toMatchObject({ status: 'NOT_TESTED' })
    const report = reportOf('0.5.0', NOW, page, results)
    expect(report).toContain('Connexion : visiteur (signes : LOGIN_LINK, REGISTER_LINK)')
    expect(report).toContain('[KO NOT_LOGGED_IN] Recherche d’un mot courant')
  })

  it('le rapport ne contient que des noms de signes, jamais un libellé de la page', async () => {
    const fake = fakeSite(() => GOOD, { pageText: () => visitorPage })
    const { results, page } = await run(deps(new LeclercAdapter(fake.deps)))

    const report = reportOf('0.5.0', NOW, page, results)

    expect(report).not.toMatch(/Se connecter|Créer un compte/)
  })
})
