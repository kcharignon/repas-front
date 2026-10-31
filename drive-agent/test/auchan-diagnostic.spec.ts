// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Le diagnostic d'Auchan et la lecture de son panier (DRV-752) : l'adaptateur réel parle au VRAI faux site d'Auchan (`fake-auchan/`). Le contrôle « Lecture du
// panier » lit le panier par UNE requête `GET` et dit la FORME de la réponse ; il n'écrit jamais. Les réponses de panier fautives sont INVENTÉES (aucune n'a
// été vue sur le vrai site). Aucun contact avec un site d'enseigne.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CONSENT_ID, coursesPage, MEMBER_CART_ID } from '../fake-auchan/pages'
import { PRODUCTS } from '../fake-auchan/catalog'
import { startFakeAuchan, type FakeAuchan } from '../fake-auchan/server'
import { AuchanAdapter } from '../src/auchan'
import { CHECK_IDS, reportOf, rowsOf, runChecks, type CheckResult } from '../src/diagnostic'
import { RETAILERS, type RetailerInfo } from '../src/retailers'
import { auchanSite } from './auchan-helpers'
import { bridgeTo } from './auchan-fake-bridge'
import { fakeStorage, fakeWakeLock } from './flow-helpers'

const AUCHAN: RetailerInfo = RETAILERS.find((entry) => entry.id === 'auchan')!
const NOW = Date.UTC(2026, 9, 31, 20, 0, 0)
const FARINE = PRODUCTS[0]!

let fake: FakeAuchan
beforeAll(async () => {
  fake = await startFakeAuchan()
})
afterAll(async () => {
  await fake.close()
})
beforeEach(() => {
  fake.reset()
  showPage('withdrawal')
})
afterEach(() => {
  document.documentElement.innerHTML = ''
})

function showPage(bar: 'withdrawal' | 'choose'): void {
  document.documentElement.innerHTML = coursesPage({
    bar,
    session: 'member',
    entry: 'none',
  }).replace(/^<!doctype html>\s*/i, '')
}

/** L'adaptateur réel, branché sur le faux site, comme chez une personne connectée ; le stockage est celui de l'onglet (partagé entre deux pages). */
function adapterFor(storage = fakeStorage()) {
  fake.setBehavior({ session: 'member' })
  const site = auchanSite(() => ({}), {
    cookies: () => `lark-consentId=${CONSENT_ID}; datadome=x`,
    authenticated: () => 'true',
    storage,
  })
  site.deps.fetch = bridgeTo(fake)
  const adapter = new AuchanAdapter(site.deps)
  for (const product of PRODUCTS) {
    adapter.rememberOffer(product.productId, {
      offerId: product.offerId,
      sellerType: 'GROCERY',
      offerType: 'DEFAULT',
      sellerId: '',
    })
  }
  return { adapter, storage }
}

async function diagnose(adapter: AuchanAdapter, storage = fakeStorage()) {
  const { results, page, probes } = await runChecks(
    {
      adapter,
      agentVersion: '0.56.0',
      storage,
      wakeLock: fakeWakeLock().wakeLock,
      originReplaced: null,
      retailer: AUCHAN,
    },
    () => undefined,
  )
  const by = Object.fromEntries(results.map((result) => [result.id, result])) as Record<
    CheckResult['id'],
    CheckResult
  >
  return { results, page, probes, by, report: reportOf('0.56.0', NOW, page, results, probes) }
}

const cartRequests = () =>
  fake
    .requests()
    .filter((request) => request.kind === 'cart')
    .map((request) => `${request.method} ${request.path.split('?')[0]}`)

describe('le contrôle « Lecture du panier » du diagnostic d’Auchan', () => {
  it('un panier qui se lit : OK, une seule requête GET /cart, aucune écriture, la forme de la réponse dans le rapport', async () => {
    fake.seedCart(FARINE.productId, 2)
    const { adapter } = adapterFor()

    const { by, report, results } = await diagnose(adapter)

    expect(results.map((result) => result.id)).toEqual([...CHECK_IDS])
    expect(by.cart).toMatchObject({
      status: 'OK',
      detail: 'panier lu par une seule requête de lecture, rien écrit : 1 ligne',
    })
    expect(cartRequests()).toEqual(['GET /cart'])
    expect(fake.writes()).toEqual([])
    expect(fake.cart()).toEqual({ [FARINE.productId]: 2 })
    expect(report).toContain(
      ' - Panier (une lecture, jamais d’écriture) : lu, 1 ligne ; réponse : HTTP 200, type application/json, ',
    )
    expect(report).toContain('adresse /cart, non redirigée, corps JSON, mots reconnus : aucun')
    expect(report).toMatch(/En-têtes de la réponse du panier \(noms seulement\) : .*content-type/)
    expect(report).toContain('Aucune écriture au panier.')
    expect(report).toContain('[OK] Lecture du panier : panier lu')
  })

  it('un panier qui répond la page de connexion en 200 : KO NOT_LOGGED_IN (LOGIN_FORM), la forme dit « page de connexion »', async () => {
    fake.setCartBehavior({ read: 'login-page' })
    const { adapter } = adapterFor()

    const { by, report, results } = await diagnose(adapter)

    expect(by.cart).toMatchObject({
      status: 'KO',
      code: 'NOT_LOGGED_IN',
      cause: 'LOGIN_FORM',
      detail: expect.stringContaining('mots reconnus : page de connexion'),
    })
    expect(rowsOf(results)[CHECK_IDS.indexOf('cart')]?.badge).toBe('KO NOT_LOGGED_IN')
    expect(report).toContain('[KO NOT_LOGGED_IN] Lecture du panier : HTTP 200, type text/html, ')
    expect(report).toContain('cause LOGIN_FORM : page de connexion servie à la place de la réponse')
    expect(report).toContain(
      ' - Panier (une lecture, jamais d’écriture) : échec NOT_LOGGED_IN (LOGIN_FORM), HTTP 200 ; réponse : HTTP 200, type text/html, ',
    )
    expect(fake.writes()).toEqual([])
  })

  it.each([
    ['un défi de l’anti-robot', { read: 'challenge' }, 'BLOCKED', 'CHALLENGE'],
    ['une page d’erreur', { read: 'error-page' }, 'CONTRACT_CHANGED', 'CART_ERROR_PAGE'],
    ['une page de cookies', { read: 'consent-page' }, 'CONTRACT_CHANGED', 'CART_NOT_JSON'],
    ['un corps vide', { read: 'empty-body' }, 'CONTRACT_CHANGED', 'CART_EMPTY'],
  ] as const)(
    '%s : KO %s (%s), jamais d’exception, jamais d’écriture',
    async (_name, behavior, code, cause) => {
      fake.setCartBehavior(behavior)
      const { adapter } = adapterFor()

      const { by } = await diagnose(adapter)

      expect(by.cart).toMatchObject({ status: 'KO', code, cause })
      expect(cartRequests()).toEqual(['GET /cart'])
      expect(fake.writes()).toEqual([])
    },
  )

  it('une page qui n’est pas prise en charge (aucun magasin choisi) : « non testé », aucune requête de panier', async () => {
    showPage('choose')
    const { adapter } = adapterFor()

    const { by } = await diagnose(adapter)

    expect(by.cart).toMatchObject({ status: 'NOT_TESTED' })
    expect(by.cart?.detail).toContain('non lu')
    expect(cartRequests()).toEqual([])
  })

  it('le dernier échec d’un envoi, resté dans l’onglet, est dit à côté de la sonde (la sonde ne l’écrase pas)', async () => {
    const storage = fakeStorage()
    fake.setCartBehavior({ read: 'login-page' })
    await expect(
      adapterFor(storage).adapter.setCartQuantity(FARINE.productId, 1),
    ).rejects.toMatchObject({ code: 'NOT_LOGGED_IN', cause: 'LOGIN_FORM' })
    // Une autre page de l'onglet : le site répond maintenant d'une page d'erreur.
    fake.setCartBehavior({ read: 'error-page' })
    const { adapter } = adapterFor(storage)

    const { report, probes } = await diagnose(adapter)

    expect(probes.cartFailure).toMatchObject({ body: 'HTML', words: ['LOGIN'] })
    expect(report).toContain(
      ' - Dernier échec de la réponse du panier dans cet onglet : HTTP 200, type text/html, ',
    )
    expect(report).toContain('mots reconnus : page de connexion')
    expect(report).toContain('échec CONTRACT_CHANGED (CART_ERROR_PAGE)')
    // Le prochain diagnostic dit encore l'échec de l'envoi, pas celui de la sonde.
    expect(adapterFor(storage).adapter.lastCartFailure()?.words).toEqual(['LOGIN'])
  })

  it('le rapport ne dit ni identifiant de consentement, ni identifiant de panier, ni adresse', async () => {
    fake.setCartBehavior({ read: 'login-page' })
    const { adapter } = adapterFor()

    const { report } = await diagnose(adapter)

    expect(report).not.toContain(CONSENT_ID)
    expect(report).not.toContain(MEMBER_CART_ID)
    expect(report).not.toMatch(/https?:|consentId|127\.0\.0\.1|Se connecter|lark-/)
  })
})
