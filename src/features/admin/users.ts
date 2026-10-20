import type { UserStatus, UserSummary } from '@/api'

export type AdminUser = UserSummary

/** Les colonnes du tableau (dès `xl`), les mêmes pour l'en-tête et chaque ligne : utilisateur, dernière connexion, activité, application, statut, actions. */
export const usersGrid =
  'xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_7.5rem_11.5rem]'

export type UserFilter = 'ALL' | UserStatus

export const userFilters: readonly UserFilter[] = ['ALL', 'PENDING', 'ACTIVE', 'DISABLED']

/** Depuis quand l'utilisateur s'est connecté, sous une forme que l'écran met en phrase. */
export type LastLoginAge =
  | { unit: 'never' }
  | { unit: 'now' }
  | { unit: 'minutes' | 'hours' | 'days'; n: number }
  | { unit: 'yesterday' }
  | { unit: 'date'; date: Date }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
/** Au-delà d'une semaine, la date vaut mieux que « il y a 12 j ». */
const MAX_RELATIVE_DAYS = 7

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Jours de calendrier entre deux dates (heure locale) : minuit passé = « hier », même à 20 h d'écart. */
function calendarDays(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / (24 * HOUR))
}

export function lastLoginAge(iso: string | null, now: Date): LastLoginAge {
  const date = iso == null ? null : new Date(iso)
  if (date === null || Number.isNaN(date.getTime())) return { unit: 'never' }

  const elapsed = now.getTime() - date.getTime()
  // Une horloge en avance ne fait pas voyager dans le futur
  if (elapsed < MINUTE) return { unit: 'now' }
  const days = calendarDays(date, now)
  if (elapsed < HOUR) return { unit: 'minutes', n: Math.floor(elapsed / MINUTE) }
  if (days === 0) return { unit: 'hours', n: Math.floor(elapsed / HOUR) }
  if (days === 1) return { unit: 'yesterday' }
  if (days < MAX_RELATIVE_DAYS) return { unit: 'days', n: days }

  return { unit: 'date', date }
}

const loginTime = (user: AdminUser): number | null => {
  if (user.lastLoginAt == null) return null
  const time = new Date(user.lastLoginAt).getTime()

  return Number.isNaN(time) ? null : time
}

/**
 * Ce que l'administrateur doit traiter d'abord : les comptes en attente, puis les plus récemment vus (ceux qu'on n'a jamais vus
 * à la fin), puis l'adresse pour que l'ordre ne bouge pas d'un affichage à l'autre.
 */
export function sortUsers(users: readonly AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => {
    const pending = Number(b.status === 'PENDING') - Number(a.status === 'PENDING')
    if (pending !== 0) return pending
    const timeA = loginTime(a)
    const timeB = loginTime(b)
    if (timeA !== timeB) {
      if (timeA === null) return 1
      if (timeB === null) return -1

      return timeB - timeA
    }

    return a.email.localeCompare(b.email, 'fr')
  })
}

export function filterUsers(users: readonly AdminUser[], filter: UserFilter): AdminUser[] {
  return filter === 'ALL' ? [...users] : users.filter((user) => user.status === filter)
}

export function countByStatus(users: readonly AdminUser[]): Record<UserFilter, number> {
  const counts: Record<UserFilter, number> = {
    ALL: users.length,
    PENDING: 0,
    ACTIVE: 0,
    DISABLED: 0,
  }
  for (const user of users) counts[user.status] += 1

  return counts
}
