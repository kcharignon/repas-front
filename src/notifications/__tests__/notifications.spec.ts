import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { ApiError } from '@/api'
import { isRateLimited, isStale, messageForFailure, notifyFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'

describe('notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })
  afterEach(() => vi.useRealTimers())

  it('affiche un message puis le retire après quelques secondes', () => {
    const notifications = useNotificationsStore()

    notifications.push('success', 'Enregistré')
    expect(notifications.items.map((item) => item.text)).toEqual(['Enregistré'])

    vi.advanceTimersByTime(6001)
    expect(notifications.items).toEqual([])
  })

  it('se ferme à la main et garde les autres', () => {
    const notifications = useNotificationsStore()
    const first = notifications.push('error', 'Un', 0)
    notifications.push('error', 'Deux', 0)

    notifications.dismiss(first)

    expect(notifications.items.map((item) => item.text)).toEqual(['Deux'])
  })
})

describe('messageForFailure', () => {
  it.each([
    [0, 'Le serveur est injoignable. Réessayez dans un instant.'],
    [401, 'Votre session a expiré : reconnectez-vous.'],
    [403, "Vous n'avez pas le droit de faire cela."],
    [404, "Cet élément n'existe plus."],
    [409, 'Une autre modification est en cours. Réessayez dans un instant.'],
    [412, "Modifié ailleurs entre-temps : la page vient d'être rechargée, refaites votre action."],
    [500, 'Une erreur est survenue. Réessayez.'],
  ])('dit clairement un %i', (status, expected) => {
    expect(messageForFailure(new ApiError(status, 'x'))).toBe(expected)
  })

  it('rend tel quel le message de validation du back (422)', () => {
    expect(
      messageForFailure(
        new ApiError(422, 'rows: Cette collection doit contenir 1 élément ou plus.'),
      ),
    ).toBe('rows: Cette collection doit contenir 1 élément ou plus.')
  })

  it.each([
    [30, 'Trop de requêtes. Réessayez dans 1 minute'],
    [300, 'Trop de requêtes. Réessayez dans 5 minutes'],
  ])('annonce le délai d’un 429 (%i s)', (seconds, expected) => {
    expect(messageForFailure(new ApiError(429, 'x', seconds))).toBe(expected)
  })

  it.each([
    [null, 'une minute'],
    [1, 'une minute'],
    [59, 'une minute'],
    [60, 'une minute'],
    [61, '2 minutes'],
    [300, '5 minutes'],
  ])(
    'DRIVE_RATE_LIMITED (Retry-After %s) : passager, au moins une minute, jamais moins que le délai annoncé',
    (seconds, wait) => {
      expect(messageForFailure(new ApiError(429, 'DRIVE_RATE_LIMITED', seconds))).toBe(
        `Trop de demandes en peu de temps. Attendez ${wait}, puis réessayez.`,
      )
    },
  )

  it('DRIVE_RATE_LIMITED se distingue des plafonds de quantité et du refus d’une préférence', () => {
    const texts = [
      messageForFailure(new ApiError(429, 'DRIVE_RATE_LIMITED', 1)),
      messageForFailure(new ApiError(422, 'DRIVE_LIMIT_REACHED')),
      messageForFailure(new ApiError(422, 'DRIVE_CHOICE_INVALID')),
    ]

    expect(new Set(texts).size).toBe(3)
    expect(texts[0]).not.toContain('demain')
  })

  it('un 429 est un refus passager, un autre échec non', () => {
    expect(isRateLimited(new ApiError(429, 'DRIVE_RATE_LIMITED', 1))).toBe(true)
    expect(isRateLimited(new ApiError(429, 'x'))).toBe(true)
    expect(isRateLimited(new ApiError(422, 'DRIVE_LIMIT_REACHED'))).toBe(false)
    expect(isRateLimited(new Error('x'))).toBe(false)
  })

  it('un 429 ne demande pas de relire l’écran : la ressource n’a pas changé', () => {
    expect(isStale(new ApiError(429, 'DRIVE_RATE_LIMITED', 1))).toBe(false)
  })

  it('traite une erreur inconnue comme une erreur générale', () => {
    expect(messageForFailure(new Error('boom'))).toBe('Une erreur est survenue. Réessayez.')
  })

  it('412 et 409 disent que la ressource est périmée, pas les autres', () => {
    expect([412, 409, 404, 422].map((status) => isStale(new ApiError(status, 'x')))).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(isStale(new Error('x'))).toBe(false)
  })

  it.each([
    [404, 'DRIVE_DISABLED', 'L’envoi au drive n’est pas disponible pour le moment.'],
    [
      409,
      'SHOPPING_LIST_SENT',
      'Cette liste vient d’être envoyée au drive : elle n’est plus modifiable.',
    ],
    [409, 'SHOPPING_LIST_NOT_SENT', 'Cette liste n’est plus envoyée au drive.'],
    [
      422,
      'UNIT_MEASURE_INCOMPLETE',
      'La dimension et le facteur de base vont ensemble : renseignez les deux, ou laissez-les vides.',
    ],
    [422, 'UNIT_BASE_FACTOR_INVALID', 'Le facteur de base doit être un nombre supérieur à zéro.'],
    [
      422,
      'DRIVE_LIMIT_REACHED',
      'Trop de produits mémorisés, ou trop d’écritures aujourd’hui : oubliez des produits dans « Mes produits », ou réessayez demain.',
    ],
    [409, 'SHOPPING_LIST_NOT_SENDABLE', 'Seule une liste en cours peut être envoyée au drive.'],
    [
      422,
      'SHOPPING_LIST_EMPTY',
      'La liste est vide : ajoutez des articles avant de l’envoyer au drive.',
    ],
  ])('traduit le code du drive %i %s en français simple', (status, code, expected) => {
    expect(messageForFailure(new ApiError(status, code))).toBe(expected)
  })

  it('un drive coupé (404 DRIVE_DISABLED) demande aussi de relire les réglages', () => {
    expect(isStale(new ApiError(404, 'DRIVE_DISABLED'))).toBe(true)
  })

  it('notifyFailure pousse le message dans le magasin', () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())

    notifyFailure(new ApiError(404, 'x'))

    expect(useNotificationsStore().items[0]).toMatchObject({
      kind: 'error',
      text: "Cet élément n'existe plus.",
    })
    vi.useRealTimers()
  })
})
