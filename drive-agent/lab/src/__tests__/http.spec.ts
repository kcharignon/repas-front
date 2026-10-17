import { describe, expect, it, vi } from 'vitest'

import { ERROR_PAGE } from './fixtures'
import {
  FORM_HEADERS,
  getPage,
  isBlockStatus,
  isChallengeText,
  pauseBetweenRequests,
  postForm,
  runSeries,
  type FetchFn,
} from '../http'

function reply(status: number, body = '', type = 'text/html; charset=utf-8'): Response {
  return new Response(body, { status, headers: { 'content-type': type } })
}

const clock = () => {
  let t = 0
  return () => (t += 10)
}

describe('isBlockStatus et pauseBetweenRequests', () => {
  it('ne considère comme blocage que 403 et 429', () => {
    expect([200, 301, 403, 404, 429, 500].map(isBlockStatus)).toEqual([
      false,
      false,
      true,
      false,
      true,
      false,
    ])
  })

  it('attend de 800 à 1500 ms', () => {
    expect(pauseBetweenRequests(() => 0)).toBe(800)
    expect(pauseBetweenRequests(() => 0.5)).toBe(1150)
    expect(pauseBetweenRequests(() => 0.999999)).toBe(1500)
  })
})

describe('isChallengeText', () => {
  it('reconnaît un renvoi vers la page de défi, en HTML comme en JSON', () => {
    expect(isChallengeText('<script src="https://geo.captcha-delivery.com/c.js"></script>')).toBe(
      true,
    )
    expect(isChallengeText('{"url":"https://geo.captcha-delivery.com/captcha/?cid=abc"}')).toBe(
      true,
    )
  })

  it('ne prend pas le simple mot datadome pour un défi', () => {
    expect(isChallengeText(ERROR_PAGE)).toBe(false)
    expect(isChallengeText('')).toBe(false)
  })
})

describe('getPage et postForm', () => {
  it('lit une page de l’hôte courant avec la session du navigateur', async () => {
    // Given
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(reply(200, '<html></html>'))

    // When
    const result = await getPage(fetchFn, 'https://h.example/a', clock())

    // Then
    expect(result).toMatchObject({
      status: 200,
      text: '<html></html>',
      contentType: 'text/html; charset=utf-8',
      error: null,
      blocked: false,
    })
    expect(result.ms).toBe(10)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://h.example/a',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )
  })

  it('signale un blocage 403', async () => {
    const result = await getPage(
      vi.fn<FetchFn>().mockResolvedValue(reply(403, 'x')),
      'https://h.example',
      clock(),
    )

    expect(result).toMatchObject({ status: 403, blocked: true })
  })

  it('ne signale pas un blocage pour une page d’erreur 404 qui contient le mot datadome', async () => {
    const result = await getPage(
      vi.fn<FetchFn>().mockResolvedValue(reply(404, ERROR_PAGE)),
      'https://h.example',
      clock(),
    )

    expect(result).toMatchObject({ status: 404, blocked: false })
  })

  it('signale un blocage pour une page de défi servie avec un code 200', async () => {
    const result = await getPage(
      vi
        .fn<FetchFn>()
        .mockResolvedValue(
          reply(
            200,
            '{"url":"https://geo.captcha-delivery.com/captcha/?cid=abc"}',
            'application/json',
          ),
        ),
      'https://h.example',
      clock(),
    )

    expect(result).toMatchObject({ status: 200, blocked: true })
  })

  it('transforme un échec réseau en réponse sans code', async () => {
    const result = await getPage(
      vi.fn<FetchFn>().mockRejectedValue(new TypeError('Failed to fetch')),
      'https://h.example',
      clock(),
    )

    expect(result).toMatchObject({ status: 0, error: 'Failed to fetch', blocked: false, text: '' })
  })

  it('décrit une erreur qui n’en est pas une', async () => {
    const result = await getPage(
      vi.fn<FetchFn>().mockRejectedValue('boum'),
      'https://h.example',
      clock(),
    )

    expect(result.error).toBe('boum')
  })

  it('envoie le formulaire du panier en POST', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(reply(200, '[]', 'application/json'))

    await postForm(fetchFn, 'https://h.example/panier.aspx?op=1', 'd=%7B%7D', clock())

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const init = fetchFn.mock.calls[0]?.[1]
    expect(init).toMatchObject({ method: 'POST', body: 'd=%7B%7D', credentials: 'same-origin' })
    expect(init?.headers).toMatchObject({
      'Content-Type': expect.stringContaining('x-www-form-urlencoded'),
    })
  })

  it('envoie exactement les en-têtes du site pour le panier, y compris zcwb', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(reply(200, '[]', 'application/json'))

    await postForm(fetchFn, 'https://h.example/panier.aspx?op=1', 'd=%7B%7D', clock())

    expect(fetchFn.mock.calls[0]?.[1]?.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      zcwb: 'ajax-manager',
    })
    expect(Object.keys(FORM_HEADERS)).toEqual([
      'Content-Type',
      'Accept',
      'X-Requested-With',
      'zcwb',
    ])
  })

  it('n’ajoute ni zcwb ni les en-têtes du panier à la lecture d’une page', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(reply(200, '<html></html>'))

    await getPage(fetchFn, 'https://h.example/a', clock())

    expect(fetchFn.mock.calls[0]?.[1]?.headers).toEqual({
      Accept: 'text/html,application/xhtml+xml',
    })
  })
})

describe('runSeries', () => {
  const deps = (overrides: Partial<Parameters<typeof runSeries>[2]> = {}) => ({
    sleep: vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined),
    random: () => 0,
    cancelled: () => false,
    ...overrides,
  })

  it('fait les requêtes une par une, avec une pause entre deux seulement', async () => {
    // Given
    const order: string[] = []
    const sleeping = deps({
      sleep: vi.fn<(ms: number) => Promise<void>>(async () => void order.push('pause')),
    })

    // When
    const outcome = await runSeries(
      ['a', 'b', 'c'],
      async (item) => {
        order.push(item)
        return { result: item, blocked: false }
      },
      sleeping,
    )

    // Then
    expect(order).toEqual(['a', 'pause', 'b', 'pause', 'c'])
    expect(outcome).toEqual({ results: ['a', 'b', 'c'], stoppedBy: 'fin' })
    expect(sleeping.sleep).toHaveBeenCalledWith(800)
  })

  it('s’arrête à la première réponse bloquée et compte les réponses reçues', async () => {
    const step = vi.fn<(item: number) => Promise<{ result: number; blocked: boolean }>>(
      async (item: number) => ({ result: item, blocked: item === 3 }),
    )

    const outcome = await runSeries([1, 2, 3, 4, 5], step, deps())

    expect(outcome).toEqual({ results: [1, 2, 3], stoppedBy: 'blocage' })
    expect(step).toHaveBeenCalledTimes(3)
  })

  it('s’arrête sur une erreur réseau', async () => {
    const outcome = await runSeries(
      [1, 2, 3],
      async (item) => ({ result: item, blocked: false, failed: item === 2 }),
      deps(),
    )

    expect(outcome).toEqual({ results: [1, 2], stoppedBy: 'erreur réseau' })
  })

  it('s’arrête quand on l’annule', async () => {
    let calls = 0
    const outcome = await runSeries(
      [1, 2, 3],
      async (item) => {
        calls++
        return { result: item, blocked: false }
      },
      deps({ cancelled: () => calls >= 1 }),
    )

    expect(outcome).toEqual({ results: [1], stoppedBy: 'annulation' })
  })

  it('prévient à chaque résultat', async () => {
    const seen: [string, number][] = []

    await runSeries(
      ['x', 'y'],
      async (item) => ({ result: item, blocked: false }),
      deps({ onResult: (r, i) => void seen.push([r as string, i]) }),
    )

    expect(seen).toEqual([
      ['x', 0],
      ['y', 1],
    ])
  })
})
