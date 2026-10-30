// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Le raccord de la recherche d'Auchan (DRV-724) et de son panier (DRV-725) : le MÊME passage que `auchan-flow.spec.ts` (phases A et B, résultat conforme au
// protocole), mais avec la VRAIE recherche de l'adaptateur (`GET /recherche` sur le faux site) au lieu de la recherche posée par `withShelf`. Chaque produit
// lu est retenu par `rememberOffer` : sans cela le panier refuserait l'écriture (`CART_OFFER_UNKNOWN`). Le temps est faux ; la cadence est jugée par les e2e.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { PlanLine, PlanMessage, ResultLine } from '../protocol'
import { PRODUCTS, type FakeProduct } from '../fake-auchan/catalog'
import { coursesPage } from '../fake-auchan/pages'
import { CONSENT_ID } from '../fake-auchan/pages'
import { startFakeAuchan, STORE, type FakeAuchan } from '../fake-auchan/server'
import { AuchanAdapter } from '../src/auchan'
import { guidedChoice } from '../src/flow'
import type { ChooserAnswer, ChooserProps } from '../src/ui'
import { auchanSite } from './auchan-helpers'
import { bridgeTo } from './auchan-fake-bridge'
import { expectConform, fakeUi, known, makeFlow, product, RUN_ID } from './flow-helpers'

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
  return new AuchanAdapter(site.deps)
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

describe('un passage complet avec la vraie recherche (phases A et B)', () => {
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
    // La recherche est celle de l'adaptateur : une requête GET /recherche par produit cherché, et chaque écriture porte l'offre lue par la recherche
    expect(
      fake.paced().filter((request) => request.kind === 'search').length,
    ).toBeGreaterThanOrEqual(3)
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
})
