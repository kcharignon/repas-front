// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Un passage COMPLET chez Auchan (DRV-725) : l'orchestrateur réel (phase A, phase B, résultat conforme au protocole) avec l'adaptateur réel d'Auchan, dont le
// panier parle au VRAI faux site (`fake-auchan/`, sur 127.0.0.1) : le magasin se lit par `GET /journey`, la connexion par `tracking_authenticated`, les écritures
// sont absolues. LA RECHERCHE D'AUCHAN N'EST PAS ÉCRITE (DRV-724, en parallèle) : un adaptateur de test pose les produits du faux catalogue DIRECTEMENT (`posed`
// ci-dessous) et retient leur offre comme DRV-724 devra le faire (`rememberOffer`). À relier : quand DRV-724 sera fusionnée, la recherche réelle remplace
// `withShelf` et ce test doit passer inchangé. Le temps est faux ; la cadence est jugée ailleurs (`auchan-cart.spec.ts`, e2e).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { PlanLine, PlanMessage, ResultLine } from '../protocol'
import { PRODUCTS, type FakeProduct } from '../fake-auchan/catalog'
import { coursesPage } from '../fake-auchan/pages'
import { CONSENT_ID } from '../fake-auchan/pages'
import { startFakeAuchan, STORE, type FakeAuchan } from '../fake-auchan/server'
import { AuchanAdapter } from '../src/auchan'
import { guidedChoice } from '../src/flow'
import type { Candidate } from '../src/retailers'
import type { ChooserAnswer, ChooserProps } from '../src/ui'
import { auchanSite } from './auchan-helpers'
import { bridgeTo } from './auchan-fake-bridge'
import { candidate, expectConform, fakeUi, known, makeFlow, product, RUN_ID } from './flow-helpers'

const FARINE = PRODUCTS[0]!
const LAIT = PRODUCTS[1]!
const SEL = PRODUCTS[3]!

let fake: FakeAuchan
beforeAll(async () => {
  fake = await startFakeAuchan()
})
afterAll(async () => {
  await fake.close()
})
beforeEach(() => {
  fake.reset()
  document.documentElement.innerHTML = coursesPage({
    bar: 'withdrawal',
    session: 'member',
    entry: 'none',
  }).replace(/^<!doctype html>\s*/i, '')
})
afterEach(() => {
  document.documentElement.innerHTML = ''
})

/** Le produit du faux catalogue tel que la recherche d'Auchan le donnera : les deux identifiants, jamais un EAN (la page de résultats n'en a pas, B-3). */
function posed(item: FakeProduct): Candidate {
  return candidate(item.productId, {
    label: item.label,
    price: item.priceCents,
    stock: null,
    inCart: null,
    offerId: item.offerId,
  })
}

/**
 * Un adaptateur d'Auchan dont la recherche est POSÉE par le test (DRV-724 n'est pas fusionnée) ; le panier est l'adaptateur réel. La recherche posée retient
 * l'offre de chaque produit lu, comme DRV-724 devra le faire (`rememberOffer`).
 */
function withShelf(adapter: AuchanAdapter) {
  const show = (items: FakeProduct[]): Candidate[] => {
    for (const item of items) {
      adapter.rememberOffer(item.productId, {
        offerId: item.offerId,
        sellerType: 'GROCERY',
        offerType: 'DEFAULT',
        sellerId: '',
      })
    }
    return items.map(posed)
  }
  return Object.assign(adapter, {
    searchProducts: (query: string): Promise<Candidate[]> =>
      Promise.resolve(
        show(PRODUCTS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))),
      ),
    readProductFromSearch: (_query: string, productId: string): Promise<Candidate | null> => {
      const item = PRODUCTS.find((found) => found.productId === productId)
      return Promise.resolve(item === undefined ? null : (show([item])[0] ?? null))
    },
  })
}

function setup(session: 'member' | 'visitor' = 'member') {
  fake.setBehavior({ session })
  const site = auchanSite(() => ({}), {
    cookies: () =>
      session === 'member'
        ? `lark-consentId=${CONSENT_ID}`
        : `lark-consentId=${CONSENT_ID}; lark-cart=c0000000-0000-4000-8000-0000000000a1`,
    authenticated: () => (session === 'member' ? 'true' : 'false'),
  })
  site.deps.fetch = bridgeTo(fake)
  return withShelf(new AuchanAdapter(site.deps))
}

const auchanPlan = (lines: PlanLine[]): PlanMessage => ({
  v: 1,
  type: 'plan',
  runId: RUN_ID,
  retailer: 'auchan',
  store: { id: STORE.id, host: STORE.host },
  returnPath: '/drive/retour',
  lines,
})

/** L'utilisateur devant la liste de la phase B : touche « Choisir » du produit nommé. */
function choosing(name: string) {
  return async (props: ChooserProps): Promise<ChooserAnswer> => {
    const zone = document.body.appendChild(document.createElement('div'))
    const answered = new Promise<ChooserAnswer>((resolve) => {
      props.mount(zone, (value) => resolve({ kind: 'content', value }))
    })
    const row = [...zone.querySelectorAll<HTMLElement>('li.candidate')].find((item) =>
      item.querySelector('.name')?.textContent?.includes(name),
    )
    row?.querySelector('button')?.click()
    return answered
  }
}

const withOffer = (item: FakeProduct, packs: number) => ({
  ...product(item.productId, packs, item.label),
  offerId: item.offerId,
})

const outcomes = (lines: ResultLine[] | undefined) => (lines ?? []).map((line) => line.outcome)

describe('un passage complet contre le faux site (phases A et B)', () => {
  it('ajoute les produits connus (phase A), fait choisir le nouveau (phase B) : mêmes types de résultats que chez Leclerc, EAN rendu, panier exact', async () => {
    const screens = fakeUi({ chooser: choosing('Sel fin') })
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter: setup(),
      phaseB: guidedChoice,
      retailer: 'auchan',
    })
    const sel: PlanLine = { ...known('sel', []), status: 'NEW', searchQuery: 'sel fin' }

    await flow.start(
      auchanPlan([
        known('farine', [withOffer(FARINE, 3)]),
        known('lait', [withOffer(LAIT, 2)]),
        sel,
      ]),
    )

    const result = expectConform(sent[0])
    expect(result).toMatchObject({ outcome: 'completed' })
    expect(outcomes(result.lines)).toEqual(['ADDED', 'ADDED', 'CHOSEN'])
    expect(fake.cart()).toEqual({
      [FARINE.productId]: 3,
      [LAIT.productId]: 2,
      [SEL.productId]: 1,
    })
    // L'EAN vient de la réponse d'ajout (la page de résultats n'en a pas), l'offre du produit choisi part aussi vers Repas.
    const chosen = result.lines.find((line) => line.outcome === 'CHOSEN')
    expect(chosen).toMatchObject({
      product: { id: SEL.productId, ean: SEL.ean, offerId: SEL.offerId },
    })
    // Une lecture avant chaque écriture, jamais une écriture à zéro, jamais en parallèle.
    const bodies = fake
      .writes()
      .map((write) => JSON.parse(write.detail ?? '{}') as { items: { desiredQuantity: number }[] })
    expect(bodies.every((body) => (body.items[0]?.desiredQuantity ?? 0) >= 1)).toBe(true)
    expect(fake.violations().filter((violation) => violation.kind === 'parallel')).toEqual([])
    expect(fake.paced().every((request) => request.rejected === undefined)).toBe(true)
  })

  it('un produit déjà au panier en plus grande quantité n’est jamais réduit : la ligne est ADDED à la quantité du panier, rien n’est écrit', async () => {
    fake.seedCart(FARINE.productId, 6)
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: setup(), retailer: 'auchan' })

    await flow.start(auchanPlan([known('farine', [withOffer(FARINE, 3)])]))

    const result = expectConform(sent[0])
    expect(outcomes(result.lines)).toEqual(['ADDED'])
    expect(result.lines[0]).toMatchObject({ outcome: 'ADDED', quantity: 6 })
    expect(fake.writes()).toEqual([])
    expect(fake.cart()).toEqual({ [FARINE.productId]: 6 })
  })

  it('une ligne déjà là plus basse est montée à la quantité du plan, avec son id (jamais ignorée)', async () => {
    fake.setCartBehavior({ write: 'ignore-without-id' })
    fake.seedCart(LAIT.productId, 1)
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: setup(), retailer: 'auchan' })

    await flow.start(auchanPlan([known('lait', [withOffer(LAIT, 4)])]))

    expect(expectConform(sent[0])).toMatchObject({ outcome: 'completed' })
    expect(fake.cart()).toEqual({ [LAIT.productId]: 4 })
  })

  it('un défi de l’anti-robot à l’écriture : le passage se suspend derrière le bandeau, « Reprendre » refait la ligne en LISANT d’abord le panier, une écriture de plus seulement', async () => {
    fake.setCartBehavior({ write: 'challenge' })
    const screens = fakeUi({
      challenge: () => {
        // La personne passe la vérification dans la page : le site répond de nouveau normalement.
        fake.setCartBehavior({ write: 'ok' })
        return 'resume'
      },
    })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: setup(), retailer: 'auchan' })

    await flow.start(auchanPlan([known('farine', [withOffer(FARINE, 3)])]))

    expect(screens.screens()).toEqual(['progress', 'challenge', 'progress', 'end'])
    expect(expectConform(sent[0])).toMatchObject({ outcome: 'completed' })
    // L'écriture qui a déclenché le défi n'est pas rejouée seule : la reprise relit le panier (une lecture de plus) puis écrit une fois.
    expect(fake.writes()).toHaveLength(2)
    expect(fake.paced().map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /journey',
      'GET /cart',
      'POST /cart/update',
      'GET /cart',
      'POST /cart/update',
    ])
    expect(fake.cart()).toEqual({ [FARINE.productId]: 3 })
  })

  it('« Arrêter » devant le défi : rien de plus n’est écrit, le résultat est partiel (BLOCKED)', async () => {
    fake.setCartBehavior({ write: 'challenge' })
    const screens = fakeUi({ challenge: () => 'stop' })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter: setup(), retailer: 'auchan' })

    await flow.start(
      auchanPlan([known('farine', [withOffer(FARINE, 3)]), known('lait', [withOffer(LAIT, 2)])]),
    )

    const result = expectConform(sent[0])
    expect(result).toMatchObject({ outcome: 'partial', error: { code: 'BLOCKED' } })
    expect(fake.writes()).toHaveLength(1)
    expect(fake.cart()).toEqual({})
  })

  it('le site qui ignore l’écriture d’une ligne existante : le passage s’arrête sur CONTRACT_CHANGED (CART_QUANTITY_MISMATCH), jamais en succès', async () => {
    fake.setCartBehavior({ write: 'ignored' })
    fake.seedCart(FARINE.productId, 1)
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: setup(), retailer: 'auchan' })

    await flow.start(auchanPlan([known('farine', [withOffer(FARINE, 3)])]))

    const result = expectConform(sent[0])
    expect(result.outcome).not.toBe('completed')
    expect(JSON.stringify(result)).toContain('CART_QUANTITY_MISMATCH')
    expect(outcomes(result.lines)).not.toContain('ADDED')
    expect(fake.cart()).toEqual({ [FARINE.productId]: 1 })
  })

  it('visiteur : l’envoi s’arrête (NOT_LOGGED_IN, SESSION_VISITOR) avant toute écriture, comme chez Leclerc (première recette : conservateur)', async () => {
    const { flow, sent } = makeFlow({
      ui: fakeUi({ error: () => 'return' }).ui,
      adapter: setup('visitor'),
      retailer: 'auchan',
    })

    await flow.start(auchanPlan([known('farine', [withOffer(FARINE, 3)])]))

    const result = expectConform(sent[0])
    expect(result).toMatchObject({ outcome: 'error', error: { code: 'NOT_LOGGED_IN' } })
    expect(fake.writes()).toEqual([])
    expect(fake.paced().map((request) => request.path)).toEqual(['/journey'])
  })
})
