import { afterEach, describe, expect, it } from 'vitest'

import {
  conclusions,
  nextOffers,
  obtainedText,
  stepLine,
  type StepRecord,
} from '../essais/quantites'
import { ERROR_PAGE, FLOUR, MILK, SUGAR, searchPage } from './fixtures'
import {
  button,
  cartCall,
  choose,
  click,
  field,
  html,
  json,
  mount,
  openEssai,
  output,
  posts,
  unmount,
  untilOutput,
  type Harness,
  type Route,
} from './harness'

afterEach(unmount)

const FLOUR_ID = String(FLOUR.id)

type Mode = 'absolue' | 'monte-seulement' | 'ajoute'

/**
 * Un faux panier INVENTÉ qui garde la quantité du produit et la change selon le mode choisi.
 * `absolue` : `iQuantite` est une quantité visée, avec les deux actions ;
 * `monte-seulement` : l'action 1 ne fait que monter, l'action 2 fixe la quantité ;
 * `ajoute` : l'action 1 additionne, l'action 2 retranche (0 retire).
 */
function fakeCart(mode: Mode): { route: Route; bodies: () => Record<string, unknown>[] } {
  let quantity = 0
  const bodies: Record<string, unknown>[] = []
  const route: Route = (url, init) => {
    if (!url.includes('panier.aspx')) return html(searchPage([FLOUR, SUGAR, MILK]))
    const call = JSON.parse(new URLSearchParams(String(init?.body)).get('d') ?? '{}') as {
      eTypeAction: number
      iQuantite: number
    }
    bodies.push(call)
    if (mode === 'absolue') quantity = call.iQuantite
    else if (mode === 'monte-seulement') {
      quantity = call.eTypeAction === 1 ? Math.max(quantity, call.iQuantite) : call.iQuantite
    } else if (call.eTypeAction === 1) quantity += call.iQuantite
    else quantity = call.iQuantite === 0 ? 0 : Math.max(0, quantity - call.iQuantite)
    return json([
      { eTypeEvenement: 101, sIdUnique: `Produit${FLOUR_ID}`, iIdProduit: FLOUR_ID },
      {
        eTypeEvenement: 1,
        sIdUnique: 'Panier000000',
        lstProduitsLight:
          quantity > 0
            ? [
                {
                  iIdProduit: FLOUR_ID,
                  iQtePanier: quantity,
                  iQteDisponible: 12,
                  fQuantiteMax: 20,
                },
              ]
            : [],
        iQuantitePanier: quantity,
        sTotalAPayer: '1,29 €',
      },
    ])
  }
  return { route, bodies: () => bodies }
}

async function searched(harness: Harness): Promise<void> {
  openEssai(harness, 2)
  click(harness.root, 'Chercher')
  expect(await untilOutput(harness.root, 'Produits reconnus')).toContain('Produits reconnus')
}

function pick(harness: Harness, productId: string): void {
  choose(harness.root.querySelector('select') as HTMLSelectElement, productId)
}

/** Ouvre l'essai 3b sur la farine, après une recherche, et demande l'étape 1. */
async function ready(harness: Harness): Promise<void> {
  await searched(harness)
  openEssai(harness, '3b')
  pick(harness, FLOUR_ID)
}

/** Confirme l'étape proposée et attend la ligne de résultat de l'étape numéro `position`. */
async function confirm(harness: Harness, confirmLabel: string, position: number): Promise<string> {
  click(harness.root, confirmLabel)
  return untilOutput(harness.root, new RegExp(`^${position}\\. action`, 'm'))
}

describe('essai 3b : quantités', () => {
  it('suit le scénario où iQuantite est absolu : 3, puis 2, puis retrait, une confirmation par écriture', async () => {
    // Given
    const cart = fakeCart('absolue')
    const harness = mount({ route: cart.route })
    await ready(harness)

    // When : l'étape 1 est préparée, rien n'est envoyé
    click(harness.root, "Préparer l'étape 1")
    expect(posts(harness)).toHaveLength(0)
    expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain(
      `action 1, quantité 3, produit ${FLOUR_ID} « ${FLOUR.line1} »`,
    )
    expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain('VRAI panier')

    // Then : une seule écriture après la confirmation, puis plus rien sans nouvelle confirmation
    const first = await confirm(harness, 'Oui, fixer à 3', 1)
    expect(posts(harness)).toHaveLength(1)
    expect(first).toContain('1. action 1 · quantité demandée 3 · HTTP 200 · quantité obtenue 3')
    expect(button(harness.root, 'Étape 2')).toBeTruthy()
    expect(button(harness.root, 'Retirer le produit')).toBeTruthy()

    // When : étape 2, d'abord proposée puis confirmée
    click(harness.root, 'Étape 2')
    expect(posts(harness)).toHaveLength(1)
    expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'action 1, quantité 2',
    )
    const second = await confirm(harness, 'Oui, fixer à 2', 2)

    // Then : 2 obtenu, donc pas d'essai de l'action 2, et une conclusion
    expect(posts(harness)).toHaveLength(2)
    expect(second).toContain('2. action 1 · quantité demandée 2 · HTTP 200 · quantité obtenue 2')
    expect(second).toContain('Action 1, quantité 2 : iQuantite est une quantité visée')
    expect(() => button(harness.root, "Essayer l'action 2")).toThrow('introuvable')

    // When : retrait
    click(harness.root, 'Retirer le produit')
    expect(posts(harness)).toHaveLength(2)
    const last = await confirm(harness, 'Oui, retirer du panier', 3)

    // Then
    expect(last).toContain(
      '3. action 2 · quantité demandée 0 · HTTP 200 · quantité obtenue 0 (absent de lstProduitsLight)',
    )
    expect(last).toContain('Retrait : le produit a quitté le panier.')
    expect(cart.bodies().map((b) => [b.eTypeAction, b.iQuantite, b.iIdProduit])).toEqual([
      [1, 3, FLOUR_ID],
      [1, 2, FLOUR_ID],
      [2, 0, FLOUR_ID],
    ])
    expect(() => button(harness.root, 'Retirer le produit')).toThrow('introuvable')
    expect(() => button(harness.root, 'Étape 2')).toThrow('introuvable')
  })

  it('envoie les corps du site : identifiant en texte, contexte à l’ajout seulement', async () => {
    const cart = fakeCart('absolue')
    const harness = mount({ route: cart.route })
    await ready(harness)

    click(harness.root, "Préparer l'étape 1")
    await confirm(harness, 'Oui, fixer à 3', 1)
    click(harness.root, 'Étape 2')
    await confirm(harness, 'Oui, fixer à 2', 2)
    click(harness.root, 'Retirer le produit')
    await confirm(harness, 'Oui, retirer du panier', 3)

    const sent = posts(harness).map((call) => cartCall(call))
    expect(sent[0]).toMatchObject({
      eTypeAction: 1,
      iIdProduit: FLOUR_ID,
      iQuantite: 3,
      objContexteProvenanceArticle: {
        sTexteRecherche: 'farine',
        sInformationsComplementaires: 'uni-2',
      },
    })
    expect(sent[1]).toMatchObject({ eTypeAction: 1, iQuantite: 2 })
    expect(sent[1]).toHaveProperty('objContexteProvenanceArticle')
    expect(sent[2]).toEqual({
      eTypeAction: 2,
      iIdProduit: FLOUR_ID,
      iQuantite: 0,
      sNoPointLivraison: '999111',
    })
  })

  it('propose l’action 2 quand l’action 1 ne fait pas baisser la quantité, puis la teste après confirmation', async () => {
    const cart = fakeCart('monte-seulement')
    const harness = mount({ route: cart.route })
    await ready(harness)
    click(harness.root, "Préparer l'étape 1")
    await confirm(harness, 'Oui, fixer à 3', 1)
    click(harness.root, 'Étape 2')

    const second = await confirm(harness, 'Oui, fixer à 2', 2)

    expect(second).toContain('2. action 1 · quantité demandée 2 · HTTP 200 · quantité obtenue 3')
    expect(second).toContain('la quantité ne baisse pas (reste 3)')
    expect(posts(harness)).toHaveLength(2)

    // When : l'essai de l'action 2 est proposé, puis confirmé
    click(harness.root, "Essayer l'action 2")
    expect(posts(harness)).toHaveLength(2)
    const third = await confirm(harness, "Oui, essayer l'action 2", 3)

    // Then
    expect(third).toContain('3. action 2 · quantité demandée 2 · HTTP 200 · quantité obtenue 2')
    expect(third).toContain('Action 2, quantité 2 : iQuantite est une quantité visée')
    expect(cart.bodies()[2]).toMatchObject({ eTypeAction: 2, iQuantite: 2 })
    expect(cart.bodies()[2]).not.toHaveProperty('objContexteProvenanceArticle')
    expect(button(harness.root, 'Retirer le produit')).toBeTruthy()
  })

  it("reconnaît une quantité qui s'ajoute au lieu d’être fixée", async () => {
    const harness = mount({ route: fakeCart('ajoute').route })
    await ready(harness)
    click(harness.root, "Préparer l'étape 1")
    await confirm(harness, 'Oui, fixer à 3', 1)
    click(harness.root, 'Étape 2')

    const second = await confirm(harness, 'Oui, fixer à 2', 2)

    expect(second).toContain('quantité obtenue 5')
    expect(second).toContain("iQuantite s'ajoute (3 + 2 = 5)")
  })

  it('n’écrit rien quand l’utilisateur annule la confirmation', async () => {
    const harness = mount({ route: fakeCart('absolue').route })
    await ready(harness)

    click(harness.root, "Préparer l'étape 1")
    click(harness.root, 'Annuler')

    expect(posts(harness)).toHaveLength(0)
    expect(harness.root.querySelector('[role="alertdialog"]')).toBeNull()
    expect(button(harness.root, "Préparer l'étape 1").disabled).toBe(false)
  })

  it('s’arrête tout de suite sur un blocage 403 : rien d’autre n’est proposé', async () => {
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx') ? html('Accès refusé', 403) : html(searchPage([FLOUR])),
    })
    await ready(harness)
    click(harness.root, "Préparer l'étape 1")

    const text = await confirm(harness, 'Oui, fixer à 3', 1)

    expect(text).toContain(
      '1. action 1 · quantité demandée 3 · HTTP 403 · quantité obtenue non lue',
    )
    expect(text).toContain('Blocage probable')
    expect(text).toContain('Arrêt : si le produit est resté au panier, retire-le à la main.')
    expect(() => button(harness.root, 'Étape 2')).toThrow('introuvable')
    expect(() => button(harness.root, 'Retirer le produit')).toThrow('introuvable')
    expect(posts(harness)).toHaveLength(1)
  })

  it('s’arrête aussi sur un 429', async () => {
    const harness = mount({
      route: (url) => (url.includes('panier.aspx') ? html('', 429) : html(searchPage([FLOUR]))),
    })
    await ready(harness)
    click(harness.root, "Préparer l'étape 1")

    const text = await confirm(harness, 'Oui, fixer à 3', 1)

    expect(text).toContain('HTTP 429')
    expect(() => button(harness.root, 'Étape 2')).toThrow('introuvable')
  })

  it('présente un 404 comme une requête non comprise et ne propose que le retrait', async () => {
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx') ? html(ERROR_PAGE, 404) : html(searchPage([FLOUR])),
    })
    await ready(harness)
    click(harness.root, "Préparer l'étape 1")

    const text = await confirm(harness, 'Oui, fixer à 3', 1)

    expect(text).toContain(
      '1. action 1 · quantité demandée 3 · HTTP 404 · quantité obtenue non lue',
    )
    expect(text).toContain("La requête n'a pas été comprise par Leclerc (HTTP 404).")
    expect(text).not.toContain('Blocage probable')
    expect(() => button(harness.root, 'Étape 2')).toThrow('introuvable')
    expect(button(harness.root, 'Retirer le produit')).toBeTruthy()
  })

  it('note l’absence de réponse du réseau et ne propose que le retrait', async () => {
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx')
          ? Promise.reject(new Error('coupé'))
          : html(searchPage([FLOUR])),
    })
    await ready(harness)
    click(harness.root, "Préparer l'étape 1")

    const text = await confirm(harness, 'Oui, fixer à 3', 1)

    expect(text).toContain(
      '1. action 1 · quantité demandée 3 · HTTP sans réponse · quantité obtenue non lue',
    )
    expect(text).toContain('Requête sans réponse : coupé')
    expect(button(harness.root, 'Retirer le produit')).toBeTruthy()
    expect(() => button(harness.root, 'Étape 2')).toThrow('introuvable')
  })

  it('refuse un produit déjà dans le panier, un identifiant faux et une page hors magasin', async () => {
    const harness = mount({ route: fakeCart('absolue').route })
    await searched(harness)
    openEssai(harness, '3b')

    pick(harness, String(MILK.id))
    click(harness.root, "Préparer l'étape 1")
    expect(output(harness.root)).toContain('déjà dans ton panier')

    field(harness.root, 'Identifiant du produit').value = '12abc'
    click(harness.root, "Préparer l'étape 1")
    expect(output(harness.root)).toContain('Identifiant invalide')
    expect(harness.root.querySelector('[role="alertdialog"]')).toBeNull()
    expect(posts(harness)).toHaveLength(0)
    unmount()

    const away = mount({ path: '/' })
    openEssai(away, '3b')
    click(away.root, "Préparer l'étape 1")
    expect(output(away.root)).toContain("Cette page n'est pas une page de magasin")
  })

  it('reprend le produit de l’essai 3 sans qu’on le ressaisisse', () => {
    const harness = mount()
    harness.lab.state.lastAdded = { productId: FLOUR_ID, label: FLOUR.line1 }

    openEssai(harness, '3b')

    expect(field(harness.root, 'Identifiant du produit').value).toBe(FLOUR_ID)
  })

  it('refuse de commencer pendant qu’une autre écriture est en cours', async () => {
    let release: (response: Response) => void = () => {}
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx')
          ? new Promise<Response>((resolve) => {
              release = resolve
            })
          : html(searchPage([FLOUR, SUGAR])),
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)
    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')

    openEssai(harness, '3b')
    pick(harness, String(SUGAR.id))
    click(harness.root, "Préparer l'étape 1")

    expect(output(harness.root)).toContain('Une requête au panier est déjà en cours')
    expect(posts(harness)).toHaveLength(1)
    release(json([]))
  })

  it('ne se relance pas une fois commencé', async () => {
    const harness = mount({ route: fakeCart('absolue').route })
    await ready(harness)
    click(harness.root, "Préparer l'étape 1")
    await confirm(harness, 'Oui, fixer à 3', 1)

    expect(button(harness.root, "Préparer l'étape 1").disabled).toBe(true)
    expect(field(harness.root, 'Identifiant du produit').disabled).toBe(true)
  })
})

describe('essai 3b : étapes, offres et conclusions', () => {
  const step = (overrides: Partial<StepRecord>): StepRecord => ({
    kind: 'trois',
    action: 1,
    quantity: 3,
    http: '200',
    obtained: 3,
    byAbsence: false,
    outcome: 'ok',
    ...overrides,
  })
  const two = step({ kind: 'deux', quantity: 2, obtained: 2 })

  it('écrit une ligne par étape : action, quantité demandée, HTTP, quantité obtenue', () => {
    expect(stepLine(1, step({}))).toBe(
      '1. action 1 · quantité demandée 3 · HTTP 200 · quantité obtenue 3',
    )
    expect(
      stepLine(3, step({ kind: 'retrait', action: 2, quantity: 0, obtained: 0, byAbsence: true })),
    ).toBe(
      '3. action 2 · quantité demandée 0 · HTTP 200 · quantité obtenue 0 (absent de lstProduitsLight)',
    )
    expect(obtainedText(step({ obtained: null }))).toBe('non lue')
  })

  it('propose la suite selon la dernière étape', () => {
    expect(nextOffers([])).toEqual([])
    expect(nextOffers([step({})])).toEqual(['deux', 'retrait'])
    expect(nextOffers([step({}), two])).toEqual(['retrait'])
    expect(nextOffers([step({}), { ...two, obtained: 3 }])).toEqual(['action2', 'retrait'])
    expect(nextOffers([step({}), { ...two, obtained: null }])).toEqual(['action2', 'retrait'])
    expect(nextOffers([step({}), step({ kind: 'action2', action: 2, quantity: 2 })])).toEqual([
      'retrait',
    ])
    expect(nextOffers([step({ kind: 'retrait', action: 2, quantity: 0 })])).toEqual([])
  })

  it('ne propose que le retrait après une réponse non comprise, rien après un blocage', () => {
    expect(nextOffers([step({ outcome: 'incompris' })])).toEqual(['retrait'])
    expect(nextOffers([step({ outcome: 'sans reponse' })])).toEqual(['retrait'])
    expect(nextOffers([step({ outcome: 'bloque' })])).toEqual([])
  })

  it('conclut selon la quantité obtenue après 3 puis 2', () => {
    expect(conclusions([step({}), two])).toEqual([
      'Action 1, quantité 2 : iQuantite est une quantité visée : la quantité devient 2',
    ])
    expect(conclusions([step({}), { ...two, obtained: 3 }])).toEqual([
      'Action 1, quantité 2 : la quantité ne baisse pas (reste 3)',
    ])
    expect(conclusions([step({}), { ...two, obtained: 5 }])).toEqual([
      "Action 1, quantité 2 : iQuantite s'ajoute (3 + 2 = 5)",
    ])
    expect(conclusions([step({}), { ...two, obtained: 7 }])).toEqual([
      'Action 1, quantité 2 : résultat inattendu (7)',
    ])
    expect(conclusions([step({}), { ...two, obtained: null }])[0]).toContain('quantité non lue')
  })

  it('ne conclut rien d’une étape dont la réponse n’a pas été comprise', () => {
    expect(conclusions([step({}), { ...two, outcome: 'incompris' }])).toEqual([])
  })

  it('conclut sur le retrait', () => {
    const out = step({ kind: 'retrait', action: 2, quantity: 0 })

    expect(conclusions([step({}), { ...out, obtained: 0 }])).toEqual([
      'Retrait : le produit a quitté le panier.',
    ])
    expect(conclusions([step({}), { ...out, obtained: 1 }])[0]).toContain('retire-le à la main')
  })
})
