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
} from '../src/leclerc'
import { fixture, fakeSite } from './leclerc-helpers'

function pacerOf(site: ReturnType<typeof fakeSite>): Pacer {
  return new Pacer(site.deps.fetch, site.deps)
}

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
