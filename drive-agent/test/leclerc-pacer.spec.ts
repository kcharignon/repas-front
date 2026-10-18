// @vitest-environment node
// La cadence des requêtes (DRV-303), en temps simulé : aucune pause réelle, aucun appel réseau.
import { describe, expect, it } from 'vitest'

import {
  JITTER_MS,
  LeclercError,
  MAX_BLOCKS,
  NETWORK_RETRY_MS,
  Pacer,
  PAUSE_MS,
  REQUEST_TIMEOUT_MS,
} from '../src/leclerc'
import { fixture, fakeSite } from './leclerc-helpers'

function pacerOf(site: ReturnType<typeof fakeSite>): Pacer {
  return new Pacer(site.deps.fetch, site.deps)
}

/** Un Pacer qui a un délai d'attente par requête (celui de l'horloge fausse du site). */
function timedPacerOf(site: ReturnType<typeof fakeSite>): Pacer {
  return new Pacer(site.deps.fetch, { ...site.deps, timer: site.timer })
}

/** Laisse les tâches en attente s'exécuter (les promesses qui ne dépendent d'aucune horloge). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('Pacer : la cadence', () => {
  it('connaît les constantes du protocole : 800 ms, 700 ms de gigue, 2 blocages, reprise après 2 s', () => {
    expect([PAUSE_MS, JITTER_MS, MAX_BLOCKS, NETWORK_RETRY_MS]).toEqual([800, 700, 2, 2000])
  })

  it('n’attend pas avant la première requête, puis 800 ms au moins entre deux', async () => {
    // Given : une gigue nulle
    const site = fakeSite(() => ({ body: 'ok' }))
    const pacer = pacerOf(site)

    // When
    await pacer.request('/a', {})
    await pacer.request('/b', {})
    await pacer.request('/c', {})

    // Then : chaque requête dure 50 ms ; la fin de l'une et le début de la suivante sont séparés de 800 ms
    expect(site.sleeps).toEqual([800, 800])
    const gaps = site.calls
      .slice(1)
      .map((call, index) => call.at - ((site.calls[index]?.at ?? 0) + 50))
    expect(gaps).toEqual([800, 800])
  })

  it('ajoute une gigue aléatoire jusqu’à 700 ms, et pas davantage', async () => {
    // Given : la gigue maximale
    const site = fakeSite(() => ({ body: 'ok' }))
    site.setRandom(0.999999)
    const pacer = pacerOf(site)

    // When
    await pacer.request('/a', {})
    await pacer.request('/b', {})

    // Then
    expect((site.calls[1]?.at ?? 0) - (site.calls[0]?.at ?? 0) - 50).toBe(PAUSE_MS + JITTER_MS)
  })

  it('compte le temps déjà écoulé dans la pause', async () => {
    // Given : l'appelant a déjà attendu 5 s depuis la fin de la première requête
    const site = fakeSite(() => ({ body: 'ok' }))
    const pacer = pacerOf(site)
    await pacer.request('/a', {})

    // When
    site.clock.now += 5000
    await pacer.request('/b', {})

    // Then : aucune pause supplémentaire
    expect(site.sleeps).toEqual([])
  })

  it('met deux appels simultanés en file : jamais deux requêtes en parallèle, dans l’ordre', async () => {
    // Given
    const site = fakeSite((_call, index) => ({ body: `réponse ${index}` }))
    const pacer = pacerOf(site)

    // When : trois appels lancés d'un coup
    const replies = await Promise.all([
      pacer.request('/a', {}),
      pacer.request('/b', {}),
      pacer.request('/c', {}),
    ])

    // Then
    expect(site.maxInFlight()).toBe(1)
    expect(site.calls.map((call) => call.url)).toEqual(['/a', '/b', '/c'])
    expect(replies.map((reply) => reply.text)).toEqual(['réponse 0', 'réponse 1', 'réponse 2'])
    expect(site.sleeps).toHaveLength(2)
  })

  it('continue la file après un appel en erreur', async () => {
    const site = fakeSite((_call, index) =>
      index === 0 ? { status: 404, body: 'non' } : { body: 'oui' },
    )
    const pacer = pacerOf(site)

    const [first, second] = await Promise.all([pacer.request('/a', {}), pacer.request('/b', {})])

    expect([first.status, second.status]).toEqual([404, 200])
  })
})

describe('Pacer : un seul hôte', () => {
  it.each([
    ['https://autre.exemple.invalid/x'],
    ['//autre.exemple.invalid/x'],
    ['http://fd0-courses.leclercdrive.fr/x'],
    ['x'],
    [''],
  ])('refuse l’adresse « %s » sans rien envoyer', async (url) => {
    const site = fakeSite(() => ({ body: 'ok' }))

    await expect(pacerOf(site).request(url, {})).rejects.toThrow(/hôte de la page/)

    expect(site.calls).toEqual([])
  })

  // Un navigateur lit « \ » comme « / » et ignore les tabulations et retours à la ligne d'une adresse : ces chemins, qui commencent
  // par une seule barre, partent pourtant vers un autre hôte.
  it.each([
    ['/\\autre.exemple.invalid/x'],
    ['/\t/autre.exemple.invalid/x'],
    ['/\n/autre.exemple.invalid/x'],
    ['/\r/autre.exemple.invalid/x'],
    ['/\t\\autre.exemple.invalid/x'],
  ])('refuse le chemin %j, que le navigateur enverrait à un autre hôte', async (url) => {
    const site = fakeSite(() => ({ body: 'ok' }))
    expect(new URL(url, 'https://fd0-courses.leclercdrive.fr').host).toBe('autre.exemple.invalid')

    await expect(pacerOf(site).request(url, {})).rejects.toThrow(/hôte de la page/)

    expect(site.calls).toEqual([])
  })

  it.each([
    ['/magasin-000123-000123/panier.aspx?op=1'],
    ['/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=a%5Cb'],
    ['/a\\b'],
  ])('laisse passer le chemin %j, qui reste sur l’hôte de la page', async (url) => {
    const site = fakeSite(() => ({ body: 'ok' }))
    expect(new URL(url, 'https://fd0-courses.leclercdrive.fr').host).toBe(
      'fd0-courses.leclercdrive.fr',
    )

    await pacerOf(site).request(url, {})

    expect(site.calls).toHaveLength(1)
  })

  it('envoie avec les cookies de la session du navigateur (same-origin), sans les lire', async () => {
    const site = fakeSite(() => ({ body: 'ok' }))

    await pacerOf(site).request('/a', { method: 'POST', body: 'd=1' })

    expect(site.calls[0]?.init).toEqual({ credentials: 'same-origin', method: 'POST', body: 'd=1' })
  })
})

describe('Pacer : les blocages', () => {
  it('retente une fois après un 403 ; la reprise réussie remet le compte à zéro', async () => {
    // Given : un 403 puis une page
    const site = fakeSite((_call, index) =>
      index === 0 ? { status: 403, body: 'refusé' } : { body: 'ok' },
    )
    const pacer = pacerOf(site)

    // When
    const reply = await pacer.request('/a', {})

    // Then
    expect(reply.text).toBe('ok')
    expect(site.calls).toHaveLength(2)
    expect(site.sleeps).toHaveLength(1)
    expect(pacer.isStopped).toBe(false)
  })

  it.each([[403], [429]])(
    'arrête tout après deux réponses %i de suite : BLOCKED, puis plus aucune requête',
    async (status) => {
      // Given
      const site = fakeSite(() => ({ status, body: 'refusé' }))
      const pacer = pacerOf(site)

      // When
      const failure = pacer.request('/a', {})

      // Then
      await expect(failure).rejects.toThrow(expect.objectContaining({ code: 'BLOCKED' }))
      expect(site.calls).toHaveLength(2)
      expect(pacer.isStopped).toBe(true)
      await expect(pacer.request('/b', {})).rejects.toThrow(
        expect.objectContaining({ code: 'BLOCKED' }),
      )
      expect(site.calls).toHaveLength(2)
    },
  )

  it('compte une page de défi servie avec un code 200 comme un blocage', async () => {
    const site = fakeSite(() => ({ status: 200, body: fixture('defi.html') }))

    await expect(pacerOf(site).request('/a', {})).rejects.toThrow(
      expect.objectContaining({ code: 'BLOCKED' }),
    )
  })

  it('ne prend pas une page d’erreur 404 qui contient le mot datadome pour un blocage', async () => {
    const site = fakeSite(() => ({ status: 404, body: fixture('erreur-404.html') }))
    const pacer = pacerOf(site)

    const reply = await pacer.request('/a', {})

    expect(reply.status).toBe(404)
    expect(pacer.isStopped).toBe(false)
    expect(site.calls).toHaveLength(1)
  })

  it('ne met aucun cookie, en-tête ni contenu de page dans l’erreur', async () => {
    const site = fakeSite(() => ({
      status: 403,
      body: 'Set-Cookie: datadome=SECRET123; page secrète',
    }))

    const failure = await pacerOf(site)
      .request('/a', {})
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(LeclercError)
    expect(JSON.stringify([(failure as Error).message, (failure as Error).stack])).not.toMatch(
      /SECRET|datadome|Cookie/i,
    )
  })
})

describe('Pacer : les erreurs réseau', () => {
  it('reprend une fois après 2 s, puis réussit', async () => {
    // Given : un échec réseau puis une page
    const site = fakeSite((_call, index) =>
      index === 0 ? new Error('réseau coupé') : { body: 'ok' },
    )
    const pacer = pacerOf(site)

    // When
    const reply = await pacer.request('/a', {})

    // Then
    expect(reply.text).toBe('ok')
    expect(site.sleeps).toEqual([NETWORK_RETRY_MS])
    expect(site.calls).toHaveLength(2)
  })

  it('lève NETWORK à la seconde erreur de suite, sans autre reprise', async () => {
    const site = fakeSite(() => new Error('réseau coupé : détail secret'))

    const failure = await pacerOf(site)
      .request('/a', {})
      .catch((error: unknown) => error)

    expect(failure).toMatchObject({ code: 'NETWORK' })
    expect((failure as Error).message).not.toContain('secret')
    expect(site.calls).toHaveLength(2)
  })
})

describe('Pacer : le délai d’attente de chaque requête (ticket K)', () => {
  const lastSignal = (site: ReturnType<typeof fakeSite>, index = 0) =>
    site.calls[index]?.init.signal as AbortSignal | undefined

  it('est de 20 secondes', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(20_000)
  })

  it('pose un signal d’interruption sur la requête, que la réponse annule : aucun délai ne reste armé', async () => {
    // Given : un site qui répond tout de suite
    const site = fakeSite(() => ({ body: 'ok' }))

    // When
    await timedPacerOf(site).request('/a', {})

    // Then
    expect(lastSignal(site)).toBeInstanceOf(AbortSignal)
    expect(lastSignal(site)?.aborted).toBe(false)
    expect(site.activeTimers()).toBe(0)
  })

  it('une réponse qui vient juste avant le délai passe', async () => {
    const site = fakeSite(() => ({ body: 'ok', delayMs: REQUEST_TIMEOUT_MS - 100 }))

    const reply = await timedPacerOf(site).request('/a', {})

    expect(reply.text).toBe('ok')
    expect(site.calls).toHaveLength(1)
    expect(site.sleeps).toEqual([])
  })

  it('interrompt la requête qui ne répond pas dans le délai, puis la retente une fois après 2 s', async () => {
    // Given : la première réponse ne vient jamais, la seconde est immédiate
    const site = fakeSite((_call, index) =>
      index === 0 ? { delayMs: Number.POSITIVE_INFINITY } : { body: 'ok' },
    )

    // When
    const reply = await timedPacerOf(site).request('/a', {})

    // Then : la première est interrompue au bout de 20 s, la reprise part après 2 s et réussit
    expect(reply.text).toBe('ok')
    expect(site.calls).toHaveLength(2)
    expect(lastSignal(site, 0)?.aborted).toBe(true)
    expect(lastSignal(site, 1)?.aborted).toBe(false)
    expect(site.sleeps).toEqual([NETWORK_RETRY_MS])
    expect((site.calls[1]?.at ?? 0) - (site.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(
      REQUEST_TIMEOUT_MS + NETWORK_RETRY_MS,
    )
  })

  it('deux délais dépassés de suite : NETWORK avec la cause REQUEST_TIMEOUT et un message qui le dit, jamais BLOCKED', async () => {
    const site = fakeSite(() => ({ delayMs: Number.POSITIVE_INFINITY }))
    const pacer = timedPacerOf(site)

    const failure = await pacer.request('/a', {}).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(LeclercError)
    expect(failure).toMatchObject({
      code: 'NETWORK',
      cause: 'REQUEST_TIMEOUT',
      status: null,
      message: 'Leclerc met trop de temps à répondre.',
    })
    expect(site.calls).toHaveLength(2)
    expect(pacer.isStopped).toBe(false)
  })

  it('un délai dépassé n’arrête pas le Pacer : la requête suivante part, à la cadence normale', async () => {
    const site = fakeSite((_call, index) =>
      index < 2 ? { delayMs: Number.POSITIVE_INFINITY } : { body: 'ok' },
    )
    const pacer = timedPacerOf(site)
    await pacer.request('/a', {}).catch(() => undefined)

    const reply = await pacer.request('/b', {})

    expect(reply.text).toBe('ok')
    expect(site.calls.map((call) => call.url)).toEqual(['/a', '/a', '/b'])
    expect((site.calls[2]?.at ?? 0) - (site.calls[1]?.at ?? 0)).toBeGreaterThanOrEqual(
      REQUEST_TIMEOUT_MS + PAUSE_MS,
    )
  })

  it('ne compte pas un délai dépassé comme un refus du site : un 403 qui suit a sa propre reprise', async () => {
    const replies = [
      { delayMs: Number.POSITIVE_INFINITY },
      { status: 403, body: 'non' },
      { body: 'ok' },
    ]
    const site = fakeSite((_call, index) => replies[index] ?? { body: 'ok' })
    const pacer = timedPacerOf(site)

    const reply = await pacer.request('/a', {})

    expect(reply.text).toBe('ok')
    expect(site.calls).toHaveLength(3)
    expect(pacer.isStopped).toBe(false)
  })

  it('le délai couvre aussi la lecture du corps de la réponse', async () => {
    // Given : la réponse arrive, mais son corps ne vient jamais (le fetch du test ne le rend que s'il n'est pas interrompu)
    const site = fakeSite(() => ({}), {
      fetch: (_url, init) =>
        Promise.resolve({
          status: 200,
          url: '/a',
          redirected: false,
          headers: new Headers(),
          text: () =>
            new Promise<string>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              )
            }),
        } as unknown as Response),
    })
    const failure = timedPacerOf(site)
      .request('/a', {})
      .catch((error: unknown) => error)

    // When : le délai sonne, la reprise attend à son tour, puis sonne
    await flush()
    site.elapse(REQUEST_TIMEOUT_MS)
    await flush()
    site.elapse(REQUEST_TIMEOUT_MS)

    // Then
    expect(await failure).toMatchObject({ code: 'NETWORK', cause: 'REQUEST_TIMEOUT' })
    expect(site.activeTimers()).toBe(0)
  })

  it('une erreur réseau ordinaire n’est pas un délai dépassé : même code, message et cause d’avant', async () => {
    const site = fakeSite(() => new Error('réseau coupé'))

    const failure = await timedPacerOf(site)
      .request('/a', {})
      .catch((error: unknown) => error)

    expect(failure).toMatchObject({
      code: 'NETWORK',
      cause: null,
      message: 'Le site ne répond pas.',
    })
    expect(site.activeTimers()).toBe(0)
  })

  it('ne met dans l’erreur ni adresse, ni cookie, ni contenu de page', async () => {
    const site = fakeSite(() => ({ delayMs: Number.POSITIVE_INFINITY }))

    const failure = await timedPacerOf(site)
      .request('/magasin-000123-000123/panier.aspx?op=1', {})
      .catch((error: unknown) => error)

    expect(JSON.stringify([(failure as Error).message, (failure as Error).stack])).not.toMatch(
      /magasin|panier|000123|cookie/i,
    )
  })
})

describe('Pacer : la page de défi de l’anti-robot (ticket K)', () => {
  it.each([[200], [403], [429]])(
    'une page de défi servie avec le code %i lève BLOCKED, cause CHALLENGE, dès la première réponse : elle n’est pas retentée',
    async (status) => {
      // Given
      const site = fakeSite(() => ({ status, body: fixture('defi.html') }))

      // When
      const failure = await pacerOf(site)
        .request('/a', {})
        .catch((error: unknown) => error)

      // Then
      expect(failure).toMatchObject({ code: 'BLOCKED', cause: 'CHALLENGE', status })
      expect(site.calls).toHaveLength(1)
    },
  )

  it('n’arrête pas le Pacer : une fois le défi résolu par l’utilisateur, la requête suivante part à la cadence normale', async () => {
    // Given : un défi à la première requête, puis une page
    const site = fakeSite((_call, index) =>
      index === 0 ? { body: fixture('defi.html') } : { body: 'ok' },
    )
    const pacer = pacerOf(site)
    await expect(pacer.request('/a', {})).rejects.toThrow(
      expect.objectContaining({ code: 'BLOCKED', cause: 'CHALLENGE' }),
    )
    expect(pacer.isStopped).toBe(false)

    // When
    const reply = await pacer.request('/a', {})

    // Then : la pause normale a eu lieu avant la requête qui suit
    expect(reply.text).toBe('ok')
    expect(site.sleeps).toEqual([PAUSE_MS])
  })

  it('un 403 ordinaire n’est pas un défi : une reprise, puis l’arrêt, sans cause', async () => {
    const site = fakeSite(() => ({ status: 403, body: 'refusé' }))
    const pacer = pacerOf(site)

    const failure = await pacer.request('/a', {}).catch((error: unknown) => error)

    expect(failure).toMatchObject({ code: 'BLOCKED', cause: null, status: 403 })
    expect(site.calls).toHaveLength(2)
    expect(pacer.isStopped).toBe(true)
  })

  it('ne met aucune partie de la page de défi dans l’erreur', async () => {
    const site = fakeSite(() => ({
      body: '<a href="https://geo.captcha-delivery.com/captcha/?cid=SECRET123">défi</a>',
    }))

    const failure = await pacerOf(site)
      .request('/a', {})
      .catch((error: unknown) => error)

    expect(JSON.stringify([(failure as Error).message, (failure as Error).stack])).not.toMatch(
      /SECRET|captcha|cid=/i,
    )
  })
})
