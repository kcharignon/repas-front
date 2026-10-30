// Outils des tests de l'adaptateur d'Auchan (DRV-717) : un faux `fetch`, une fausse horloge, les fixtures synthétiques. Aucun appel réseau.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { AuchanDeps } from '../src/auchan'

/** Le contenu d'une fixture de `drive-agent/fixtures/auchan/`. */
export function auchanFixture(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', 'auchan', name), 'utf8')
}

export interface AuchanCall {
  url: string
  init: RequestInit
  /** L'heure (fausse, en ms) à laquelle la requête est partie. */
  at: number
}

/** Une réponse programmée. */
export interface AuchanReply {
  status?: number
  body?: string
  url?: string
  redirected?: boolean
  contentType?: string
}

export interface AuchanSite {
  deps: AuchanDeps
  calls: AuchanCall[]
  /** Les pauses demandées au `sleep` injecté. */
  sleeps: number[]
  clock: { now: number }
  setRandom(value: number): void
}

export const AUCHAN_PAGE = { hostname: 'www.auchan.fr', pathname: '/courses', protocol: 'https:' }

/**
 * Un faux site : `handler` donne la réponse à chaque requête. L'horloge est fausse : `sleep` ne dort pas, il avance l'heure, et chaque requête
 * prend 50 ms. Le document est celui de jsdom, que le test remplit (`document.documentElement.innerHTML`).
 */
export function auchanSite(
  handler: (call: AuchanCall, index: number) => AuchanReply | Error,
  overrides: Partial<AuchanDeps> = {},
): AuchanSite {
  const clock = { now: 1_000_000 }
  const calls: AuchanCall[] = []
  const sleeps: number[] = []
  let random = 0
  const deps: AuchanDeps = {
    fetch: async (url, init = {}) => {
      const call = { url, init, at: clock.now }
      const index = calls.push(call) - 1
      await Promise.resolve()
      clock.now += 50
      const scripted = handler(call, index)
      if (scripted instanceof Error) throw scripted
      const body = scripted.body ?? ''
      return {
        status: scripted.status ?? 200,
        url: scripted.url ?? `https://${AUCHAN_PAGE.hostname}${url}`,
        redirected: scripted.redirected ?? false,
        headers: new Headers({ 'content-type': scripted.contentType ?? 'application/json' }),
        text: () => Promise.resolve(body),
      } as unknown as Response
    },
    location: AUCHAN_PAGE,
    document,
    authenticated: () => 'true',
    parseHtml: (html) => new DOMParser().parseFromString(html, 'text/html'),
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
    clock,
    setRandom(value) {
      random = value
    },
  }
}

/** Met une page (une fixture) dans le document de jsdom. */
export function showPage(html: string): void {
  document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*/i, '')
}
