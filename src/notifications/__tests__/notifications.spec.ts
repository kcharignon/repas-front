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
    [0, 'Le serveur est injoignable. Réessaie dans un instant.'],
    [401, 'Ta session a expiré : reconnecte-toi.'],
    [403, "Tu n'as pas le droit de faire cela."],
    [404, "Cet élément n'existe plus."],
    [409, 'Une autre modification est en cours. Réessaie dans un instant.'],
    [412, "Modifié ailleurs entre-temps : la page vient d'être rechargée, refais ton action."],
    [500, 'Une erreur est survenue. Réessaie.'],
  ])('dit clairement un %i', (status, expected) => {
    expect(messageForFailure(new ApiError(status, 'x'))).toBe(expected)
  })

  it.each([
    [409, 'CONVERSION_ALREADY_EXISTS', 'Cette conversion existe déjà : modifie-la.'],
    [422, 'CONVERSION_SAME_UNIT', 'Choisis deux unités différentes.'],
    [
      422,
      'CONVERSION_REQUIRED_BY_INGREDIENT',
      'Cette conversion relie l’unité de ta recette à celle du magasin : change d’abord l’unité.',
    ],
  ])('dit le refus d’une conversion (%i %s)', (status, code, expected) => {
    expect(messageForFailure(new ApiError(status, code))).toBe(expected)
  })

  it.each([
    [
      'RECIPE_LIMIT_REACHED',
      'Tu as atteint le nombre maximum de recettes. Supprime-en une, puis réessaie.',
    ],
    [
      'INGREDIENT_LIMIT_REACHED',
      'Tu as déjà 2 000 ingrédients : c’est le maximum. Supprime ou fusionne-en, puis réessaie.',
    ],
    [
      'SHOPPING_LIST_LIMIT_REACHED',
      'Tu as déjà 1 000 listes en cours : c’est le maximum. Termine ou supprime une liste, puis réessaie.',
    ],
    [
      'SHOPPING_LIST_MEAL_LIMIT_REACHED',
      'Cette liste a déjà 500 repas : c’est le maximum. Retire-en un, puis réessaie.',
    ],
    [
      'RECIPE_ROWS_LIMIT_REACHED',
      'Une recette a 100 ingrédients au plus. Retire-en un, puis réessaie.',
    ],
    [
      'CONVERSION_LIMIT_REACHED',
      'Cet ingrédient a déjà 50 conversions : c’est le maximum. Supprime-en une, puis réessaie.',
    ],
    [
      'RECIPE_QUANTITY_INVALID',
      'Cette quantité n’est pas valable : choisis un nombre plus grand que 0, jusqu’à 1 000 000.',
    ],
    [
      'SHOPPING_LIST_QUANTITY_INVALID',
      'Cette quantité n’est pas valable : choisis un nombre plus grand que 0, jusqu’à 1 000 000.',
    ],
    ['RECIPE_SERVING_INVALID', 'Le nombre de personnes doit être de 1 à 100.'],
    ['MEAL_SERVING_INVALID', 'Le nombre de personnes doit être de 1 à 100.'],
    ['USER_SERVING_INVALID', 'Le nombre de personnes doit être de 1 à 100.'],
    [
      'CONVERSION_COEFFICIENT_INVALID',
      'Ce nombre n’est pas valable : choisis un nombre de 0,000001 à 1 000 000.',
    ],
  ])('dit la limite ou la borne au lieu du code (422 %s)', (code, expected) => {
    expect(messageForFailure(new ApiError(422, code))).toBe(expected)
  })

  it('DRIVE_INGREDIENT_NOT_FOUND (404) invite à rouvrir la liste et à réessayer', () => {
    expect(messageForFailure(new ApiError(404, 'DRIVE_INGREDIENT_NOT_FOUND'))).toBe(
      'Repas ne retrouve pas cet article. Rien n’a été enregistré. Rouvre ta liste, puis réessaie.',
    )
  })

  it.each([
    [null, 'un instant'],
    [1, 'un instant'],
    [60, 'un instant'],
    [61, '2 minutes'],
  ])('WRITE_RATE_LIMITED (Retry-After %s) : trop d’actions, réessayer dans %s', (seconds, wait) => {
    expect(messageForFailure(new ApiError(429, 'WRITE_RATE_LIMITED', seconds))).toBe(
      `Trop d’actions en peu de temps. Cette action n’a pas été enregistrée. Attends ${wait}, puis réessaie.`,
    )
  })

  it.each([
    [null, 'une minute'],
    [30, 'une minute'],
    [300, '5 minutes'],
    [900, '15 minutes'],
  ])('PASSWORD_RATE_LIMITED (Retry-After %s) : patienter %s', (seconds, wait) => {
    expect(messageForFailure(new ApiError(429, 'PASSWORD_RATE_LIMITED', seconds))).toBe(
      `Trop de mots de passe actuels incorrects. Rien n’a été changé. Patiente ${wait}, puis réessaie.`,
    )
  })

  it('un 429 d’écriture est passager : pas de relecture forcée', () => {
    const error = new ApiError(429, 'WRITE_RATE_LIMITED', 1)

    expect(isRateLimited(error)).toBe(true)
    expect(isStale(error)).toBe(false)
  })

  it('rend tel quel le message de validation du back (422)', () => {
    expect(
      messageForFailure(
        new ApiError(422, 'rows: Cette collection doit contenir 1 élément ou plus.'),
      ),
    ).toBe('rows: Cette collection doit contenir 1 élément ou plus.')
  })

  it.each([
    [30, 'Trop de requêtes. Réessaie dans 1 minute'],
    [300, 'Trop de requêtes. Réessaie dans 5 minutes'],
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
        `Trop de demandes en peu de temps. Rien n’est perdu. Attends ${wait}, puis réessaie.`,
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
    expect(messageForFailure(new Error('boom'))).toBe('Une erreur est survenue. Réessaie.')
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
    [
      404,
      'DRIVE_DISABLED',
      'L’envoi au drive n’est pas disponible pour le moment. Ta liste n’a pas changé. Réessaie plus tard.',
    ],
    [
      409,
      'SHOPPING_LIST_SENT',
      'Cette liste vient d’être envoyée au drive : elle n’est plus modifiable. Rien n’a été changé. Rouvre-la pour la modifier.',
    ],
    [
      409,
      'SHOPPING_LIST_NOT_SENT',
      'Cette liste n’est plus envoyée au drive. Rien n’a été changé. Ouvre la liste pour voir où elle en est.',
    ],
    [
      422,
      'UNIT_MEASURE_INCOMPLETE',
      'La dimension et le facteur de base vont ensemble : renseigne les deux, ou laisse-les vides.',
    ],
    [422, 'UNIT_BASE_FACTOR_INVALID', 'Le facteur de base doit être un nombre supérieur à zéro.'],
    [
      422,
      'DRIVE_LIMIT_REACHED',
      'Repas se souvient déjà de trop de produits, ou il y a eu trop d’écritures aujourd’hui. Tes choix déjà enregistrés sont gardés. Oublie des produits dans « Mes produits », ou réessaie demain.',
    ],
    [
      409,
      'SHOPPING_LIST_NOT_SENDABLE',
      'Seule une liste en cours peut être envoyée au drive. Rien n’a été changé. Ouvre une liste en cours.',
    ],
    [
      422,
      'SHOPPING_LIST_EMPTY',
      'La liste est vide : il n’y a rien à envoyer au drive. Ta liste n’a pas changé. Ajoute des articles, puis envoie-la.',
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
