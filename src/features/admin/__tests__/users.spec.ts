import { describe, expect, it } from 'vitest'

import {
  countByStatus,
  filterUsers,
  lastLoginAge,
  sortUsers,
  type AdminUser,
} from '@/features/admin/users'

// Mardi 20 octobre 2026, 14 h 00 (heure locale : les jours se comptent en jours de calendrier)
const now = new Date(2026, 9, 20, 14, 0, 0)
const ago = (hours: number, minutes = 0, seconds = 0) =>
  new Date(now.getTime() - ((hours * 60 + minutes) * 60 + seconds) * 1000).toISOString()

describe('lastLoginAge', () => {
  it('« Pas encore vu » sans date, ou avec une date illisible', () => {
    expect(lastLoginAge(null, now)).toEqual({ unit: 'never' })
    expect(lastLoginAge(undefined, now)).toEqual({ unit: 'never' })
    expect(lastLoginAge('pas une date', now)).toEqual({ unit: 'never' })
  })

  it('« à l’instant » sous la minute, et pour une horloge en avance', () => {
    expect(lastLoginAge(ago(0, 0, 30), now)).toEqual({ unit: 'now' })
    expect(lastLoginAge(ago(0, 0, 0), now)).toEqual({ unit: 'now' })
    expect(lastLoginAge(ago(0, 0, -300), now)).toEqual({ unit: 'now' })
  })

  it('compte les minutes sous l’heure', () => {
    expect(lastLoginAge(ago(0, 1), now)).toEqual({ unit: 'minutes', n: 1 })
    expect(lastLoginAge(ago(0, 59, 59), now)).toEqual({ unit: 'minutes', n: 59 })
  })

  it('compte les heures dans la même journée', () => {
    expect(lastLoginAge(ago(1), now)).toEqual({ unit: 'hours', n: 1 })
    expect(lastLoginAge(ago(2, 30), now)).toEqual({ unit: 'hours', n: 2 })
    expect(lastLoginAge(ago(14), now)).toEqual({ unit: 'hours', n: 14 })
  })

  it('dit « hier » dès que minuit est passé, même à moins de 24 h', () => {
    expect(lastLoginAge(ago(14, 1), now)).toEqual({ unit: 'yesterday' })
    expect(lastLoginAge(ago(30), now)).toEqual({ unit: 'yesterday' })
  })

  it('compte les jours jusqu’à une semaine, puis donne la date', () => {
    expect(lastLoginAge(new Date(2026, 9, 18, 23, 0).toISOString(), now)).toEqual({
      unit: 'days',
      n: 2,
    })
    expect(lastLoginAge(new Date(2026, 9, 14, 9, 0).toISOString(), now)).toEqual({
      unit: 'days',
      n: 6,
    })
    expect(lastLoginAge(new Date(2026, 9, 13, 9, 0).toISOString(), now)).toEqual({
      unit: 'date',
      date: new Date(2026, 9, 13, 9, 0),
    })
  })
})

const user = (email: string, status: AdminUser['status'], lastLoginAt?: string | null) =>
  ({ email, status, lastLoginAt }) as AdminUser

describe('sortUsers', () => {
  it('met les comptes en attente d’abord, puis les plus récemment vus, les jamais vus à la fin, puis par adresse', () => {
    const sorted = sortUsers([
      user('d@x.fr', 'ACTIVE', null),
      user('c@x.fr', 'ACTIVE', ago(30)),
      user('b@x.fr', 'DISABLED', ago(1)),
      user('a@x.fr', 'ACTIVE', null),
      user('z@x.fr', 'PENDING', ago(1)),
      user('y@x.fr', 'PENDING', null),
      user('e@x.fr', 'ACTIVE', undefined),
    ])

    expect(sorted.map((candidate) => candidate.email)).toEqual([
      'z@x.fr',
      'y@x.fr',
      'b@x.fr',
      'c@x.fr',
      'a@x.fr',
      'd@x.fr',
      'e@x.fr',
    ])
  })

  it('ne modifie pas la liste reçue', () => {
    const input = [user('b@x.fr', 'ACTIVE'), user('a@x.fr', 'PENDING')]

    sortUsers(input)

    expect(input.map((candidate) => candidate.email)).toEqual(['b@x.fr', 'a@x.fr'])
  })
})

describe('filtres', () => {
  const all = [user('a@x.fr', 'PENDING'), user('b@x.fr', 'ACTIVE'), user('c@x.fr', 'ACTIVE')]

  it('garde les comptes du statut choisi, tous si « Tous »', () => {
    expect(filterUsers(all, 'ALL')).toHaveLength(3)
    expect(filterUsers(all, 'ACTIVE').map((candidate) => candidate.email)).toEqual([
      'b@x.fr',
      'c@x.fr',
    ])
    expect(filterUsers(all, 'DISABLED')).toEqual([])
  })

  it('compte les comptes de chaque statut', () => {
    expect(countByStatus(all)).toEqual({ ALL: 3, PENDING: 1, ACTIVE: 2, DISABLED: 0 })
  })
})
