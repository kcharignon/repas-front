// Outils des tests de l'adaptateur Leclerc (DRV-303) : un faux `fetch`, une fausse horloge, les fixtures. Aucun appel réseau.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { LeclercDeps } from '../src/leclerc'

/** Le contenu d'une fixture de `drive-agent/fixtures/leclerc/`. */
export function fixture(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', 'leclerc', name), 'utf8')
}

export interface Call {
  url: string
  init: RequestInit
  /** L'heure (fausse, en ms) à laquelle la requête est partie. */
  at: number
}

/** Une réponse programmée : le code, le corps, l'adresse finale ; ou une erreur réseau. */
export type Scripted =
  | {
      status?: number
      body?: string
      url?: string
      redirected?: boolean
      headers?: Record<string, string>
    }
  | Error

export interface Site {
  deps: LeclercDeps
  calls: Call[]
  /** Les pauses demandées au `sleep` injecté. */
  sleeps: number[]
  /** Le plus grand nombre de requêtes en vol en même temps. */
  maxInFlight: () => number
  setRandom: (value: number) => void
  clock: { now: number }
}

export const PAGE = {
  hostname: 'fd0-courses.leclercdrive.fr',
  pathname: '/magasin-000123-000123-Ville-Test/recherche.aspx',
}

/**
 * Un faux site : `handler` donne la réponse à chaque requête (dans l'ordre des appels). L'horloge est fausse : `sleep` ne dort pas,
 * il avance l'heure, et chaque requête prend 50 ms.
 */
export function fakeSite(
  handler: (call: Call, index: number) => Scripted,
  overrides: Partial<LeclercDeps> = {},
): Site {
  const clock = { now: 1_000_000 }
  const calls: Call[] = []
  const sleeps: number[] = []
  let random = 0
  let inFlight = 0
  let peak = 0
  const deps: LeclercDeps = {
    fetch: async (url, init = {}) => {
      const call = { url, init, at: clock.now }
      const index = calls.push(call) - 1
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      clock.now += 50
      inFlight -= 1
      const scripted = handler(call, index)
      if (scripted instanceof Error) throw scripted
      const body = scripted.body ?? ''
      return {
        status: scripted.status ?? 200,
        url: scripted.url ?? `https://${PAGE.hostname}${url}`,
        redirected: scripted.redirected ?? false,
        headers: new Headers(scripted.headers ?? {}),
        text: () => Promise.resolve(body),
      } as unknown as Response
    },
    location: PAGE,
    pageText: () => '<script>var page = {"sNoPointLivraison":"555123"}</script>',
    sleep: (ms) => {
      sleeps.push(ms)
      clock.now += ms
      return Promise.resolve()
    },
    random: () => random,
    now: () => clock.now,
    ...overrides,
  }
  return {
    deps,
    calls,
    sleeps,
    maxInFlight: () => peak,
    setRandom: (value) => {
      random = value
    },
    clock,
  }
}
