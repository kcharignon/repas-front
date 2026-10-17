import { afterEach, describe, expect, it } from 'vitest'

import { checkBeforeAdd } from '../essais/cartFlow'
import type { Product } from '../parse'
import { FLOUR, MILK, SUGAR, searchPage } from './fixtures'
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
  type,
  unmount,
  untilOutput,
  type Harness,
} from './harness'

afterEach(unmount)

/** Cherche « farine » (essai 2) pour que les essais suivants connaissent les produits. */
async function searched(harness: Harness): Promise<void> {
  openEssai(harness, 2)
  click(harness.root, 'Chercher')
  expect(await untilOutput(harness.root, 'Produits reconnus')).toContain('Produits reconnus')
}

function pick(harness: Harness, productId: string): void {
  const select = harness.root.querySelector('select') as HTMLSelectElement
  choose(select, productId)
}

const FLOUR_ID = String(FLOUR.id)
const SUGAR_ID = String(SUGAR.id)
const MILK_ID = String(MILK.id)

describe('essai 3 : ajouter puis retirer un produit', () => {
  it('n’écrit rien tant que l’utilisateur n’a pas confirmé, puis ajoute un seul produit en quantité 1, comme le site', async () => {
    // Given
    const harness = mount()
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)
    expect(field(harness.root, 'Identifiant du produit').value).toBe(FLOUR_ID)

    // When : il prépare l’ajout
    click(harness.root, 'Préparer l’ajout')

    // Then : une demande de confirmation, aucune écriture
    expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain(
      `produit ${FLOUR_ID} « ${FLOUR.line1} »`,
    )
    expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain('VRAI panier')
    expect(posts(harness)).toHaveLength(0)

    // When : il confirme
    click(harness.root, 'Oui, ajouter 1 au panier')
    const text = await untilOutput(harness.root, 'Réponse JSON')

    // Then : un seul POST, action 1, quantité 1, sur l’hôte courant, de la forme relevée sur le site
    const writes = posts(harness)
    expect(writes).toHaveLength(1)
    expect(writes[0]?.url).toBe(`${window.location.origin}/magasin-999111-999111/panier.aspx?op=1`)
    expect(cartCall(writes[0] as { body: unknown })).toEqual({
      eTypeAction: 1,
      iIdProduit: FLOUR_ID,
      iQuantite: 1,
      sNoPointLivraison: '999111',
      objContexteProvenanceArticle: {
        eOrigine: 4,
        eTypePage: 3,
        sTexteRecherche: 'farine',
        eVue: 0,
        sInformationsComplementaires: 'uni-2',
      },
    })
    expect(harness.fetch.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
      'X-Requested-With': 'XMLHttpRequest',
    })
    expect(text).toContain(
      'Ajout du produit 1000001 « Farine de blé T55 Moulin Imaginaire » : action 1, quantité visée 1, contexte de recherche « farine »',
    )
    expect(text).toContain("Point de livraison : absent de la page, repris de l'adresse")
    expect(text).toContain('HTTP 200 · application/json')
    expect(text).toContain('(type 1, panier)')
    expect(text).toContain('nrTotal=2.5')
    expect(harness.lab.state.lastAdded).toEqual({ productId: FLOUR_ID, label: FLOUR.line1 })
  })

  it('propose le retrait après l’ajout et ne retire qu’après une seconde confirmation', async () => {
    const harness = mount()
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)
    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    expect(await untilOutput(harness.root, 'Réponse JSON')).toContain('Réponse JSON')

    // When : il demande le retrait
    click(harness.root, 'Retirer ce produit du panier')

    // Then : toujours un seul POST, le retrait attend sa confirmation
    expect(posts(harness)).toHaveLength(1)
    expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'quantité mise à 0',
    )

    // When : il confirme
    click(harness.root, 'Oui, retirer du panier')
    const text = await untilOutput(harness.root, 'Retrait demandé')

    // Then : action 2, quantité 0
    const writes = posts(harness)
    expect(writes).toHaveLength(2)
    expect(cartCall(writes[1] as { body: unknown })).toEqual({
      eTypeAction: 2,
      iIdProduit: FLOUR_ID,
      iQuantite: 0,
      sNoPointLivraison: '999111',
    })
    expect(text).toContain('Retrait du produit 1000001')
    expect(text).toContain('Vérifie sur le site que le panier est revenu comme avant.')
  })

  it('n’écrit rien quand l’utilisateur annule', async () => {
    const harness = mount()
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Annuler')

    expect(posts(harness)).toHaveLength(0)
    expect(harness.root.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('refuse un produit déjà dans le panier', async () => {
    const harness = mount()
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, MILK_ID)

    click(harness.root, 'Préparer l’ajout')

    expect(output(harness.root)).toContain('déjà dans ton panier (quantité 2)')
    expect(harness.root.querySelector('[role="alertdialog"]')).toBeNull()
    expect(posts(harness)).toHaveLength(0)
  })

  it('avertit qu’un produit inconnu de la recherche ne peut pas être vérifié', () => {
    const harness = mount()
    openEssai(harness, 3)

    type(field(harness.root, 'Identifiant du produit'), '4242')
    click(harness.root, 'Préparer l’ajout')

    expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'ne peut pas vérifier',
    )
    expect(posts(harness)).toHaveLength(0)
  })

  it('refuse un identifiant qui n’est pas un nombre', () => {
    const harness = mount()
    openEssai(harness, 3)

    type(field(harness.root, 'Identifiant du produit'), '12abc')
    click(harness.root, 'Préparer l’ajout')

    expect(output(harness.root)).toContain('Identifiant invalide')
    expect(harness.root.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('refuse hors d’une page de magasin', () => {
    const harness = mount({ path: '/' })
    openEssai(harness, 3)

    type(field(harness.root, 'Identifiant du produit'), '4242')
    click(harness.root, 'Préparer l’ajout')

    expect(output(harness.root)).toContain("Cette page n'est pas une page de magasin")
  })

  it('n’envoie pas l’objet de contexte seulement si la variante de diagnostic est cochée', async () => {
    const harness = mount()
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    ;(harness.root.querySelector('input[type="checkbox"]') as HTMLInputElement).checked = true
    click(harness.root, 'Oui, ajouter 1 au panier')
    const text = await untilOutput(harness.root, 'Réponse JSON')

    expect(cartCall(posts(harness)[0] as { body: unknown })).not.toHaveProperty(
      'objContexteProvenanceArticle',
    )
    expect(cartCall(posts(harness)[0] as { body: unknown }).iIdProduit).toBe(FLOUR_ID)
    expect(text).toContain('sans contexte (diagnostic)')
  })

  it('s’arrête sur un blocage 403 et ne propose pas de retrait', async () => {
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx') ? html('Accès refusé', 403) : html(searchPage([FLOUR])),
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    const text = await untilOutput(harness.root, 'Blocage probable')

    expect(text).toContain('HTTP 403')
    expect(() => button(harness.root, 'Retirer ce produit')).toThrow('introuvable')
  })

  it('montre une erreur réseau sans proposer de retrait', async () => {
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx')
          ? Promise.reject(new Error('coupé'))
          : html(searchPage([FLOUR])),
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')

    expect(await untilOutput(harness.root, 'Requête sans réponse : coupé')).toContain(
      'Requête sans réponse : coupé',
    )
    expect(() => button(harness.root, 'Retirer ce produit')).toThrow('introuvable')
  })

  it('résume une réponse qui n’est pas du JSON', async () => {
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx')
          ? html('<html><body>Erreur du serveur</body></html>', 500)
          : html(searchPage([FLOUR])),
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')

    const text = await untilOutput(harness.root, 'Réponse non JSON')
    expect(text).toContain('Début du texte : Erreur du serveur')
    expect(button(harness.root, 'Retirer ce produit')).toBeTruthy()
  })

  it('n’autorise pas deux écritures en même temps', async () => {
    // Given : le serveur du panier met du temps à répondre
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

    // When : il tente de préparer une autre écriture pendant que la première est en cours
    pick(harness, SUGAR_ID)
    click(harness.root, 'Préparer l’ajout')

    // Then
    expect(output(harness.root)).toContain('Une requête au panier est déjà en cours')
    expect(posts(harness)).toHaveLength(1)
    release(json([]))
    expect(await untilOutput(harness.root, 'Réponse JSON')).toContain('Réponse JSON')
  })

  it('lit le point de livraison dans la page quand il s’y trouve', async () => {
    const harness = mount()
    document.body.insertAdjacentHTML(
      'beforeend',
      '<script type="text/plain">{"sNoPointLivraison":"777888"}</script>',
    )
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    expect(await untilOutput(harness.root, 'Réponse JSON')).toContain('Réponse JSON')

    expect(cartCall(posts(harness)[0] as { body: unknown }).sNoPointLivraison).toBe('777888')
    document.querySelectorAll('script[type="text/plain"]').forEach((node) => node.remove())
  })

  it('ne propose le choix de produit qu’après une recherche', () => {
    const harness = mount()
    openEssai(harness, 3)

    expect(harness.root.querySelector('select')).toBeNull()
  })
})

/** Réponse d'écriture inventée : le produit FLOUR est au panier en quantité `quantity`. */
function cartReply(quantity: number): Response {
  return json([
    { eTypeEvenement: 101, sIdUnique: `Produit${FLOUR_ID}`, iIdProduit: FLOUR_ID },
    {
      eTypeEvenement: 1,
      sIdUnique: 'Panier000000',
      lstProduitsLight:
        quantity > 0
          ? [{ iIdProduit: FLOUR_ID, iQtePanier: quantity, iQteDisponible: 12, fQuantiteMax: 20 }]
          : [],
      iQuantitePanier: quantity,
      sTotalAPayer: '1,29 €',
    },
  ])
}

describe('essai 3 : réponses du panier', () => {
  it('affiche la quantité obtenue lue dans lstProduitsLight, avec le total', async () => {
    const harness = mount({
      route: (url) => (url.includes('panier.aspx') ? cartReply(1) : html(searchPage([FLOUR]))),
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    const text = await untilOutput(harness.root, 'Quantité obtenue')

    expect(text).toContain(
      `Quantité obtenue du produit ${FLOUR_ID} (iQtePanier) : 1 ; iQteDisponible 12 ; fQuantiteMax 20`,
    )
    expect(text).toContain('Panier : iQuantitePanier 1 ; sTotalAPayer 1,29 €')
  })

  it('joint un texte de recherche vide quand aucune recherche n’a été faite', async () => {
    const harness = mount()
    openEssai(harness, 3)
    type(field(harness.root, 'Identifiant du produit'), '4242')

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    await untilOutput(harness.root, 'Réponse JSON')

    const call = cartCall(posts(harness)[0] as { body: unknown })
    expect(call.iIdProduit).toBe('4242')
    expect(call.objContexteProvenanceArticle).toMatchObject({ sTexteRecherche: '' })
  })

  it('présente un 404 comme une requête non comprise, pas comme un blocage', async () => {
    // Given : la page d’erreur HTML que Leclerc a renvoyée au premier essai du banc
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx')
          ? html('<html><body>Ce service est momentanément indisponible</body></html>', 404)
          : html(searchPage([FLOUR])),
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    // When
    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    const text = await untilOutput(harness.root, 'Réponse non JSON')

    // Then
    expect(text).toContain('HTTP 404')
    expect(text).toContain(
      "La requête n'a pas été comprise par Leclerc (HTTP 404). Ce n'est pas un blocage de l'anti-robot.",
    )
    expect(text).not.toContain('Blocage probable')
    expect(button(harness.root, 'Retirer ce produit')).toBeTruthy()
  })

  it('garde le message de blocage pour un 429', async () => {
    const harness = mount({
      route: (url) => (url.includes('panier.aspx') ? html('', 429) : html(searchPage([FLOUR]))),
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    const text = await untilOutput(harness.root, 'Blocage probable')

    expect(text).not.toContain('pas été comprise')
    expect(() => button(harness.root, 'Retirer ce produit')).toThrow('introuvable')
  })

  it('s’arrête aussi sur la page de contrôle de l’anti-robot servie avec un code 200', async () => {
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx')
          ? html('<script src="https://geo.captcha-delivery.com/c.js"></script>')
          : html(searchPage([FLOUR])),
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)

    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')

    expect(await untilOutput(harness.root, 'Blocage probable')).toContain('Blocage probable')
    expect(() => button(harness.root, 'Retirer ce produit')).toThrow('introuvable')
  })

  it('dit après le retrait que la requête n’a pas été comprise, sans annoncer un retrait réussi', async () => {
    let writes = 0
    const harness = mount({
      route: (url) => {
        if (!url.includes('panier.aspx')) return html(searchPage([FLOUR]))
        return ++writes === 1 ? cartReply(1) : html('introuvable', 404)
      },
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)
    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    await untilOutput(harness.root, 'Quantité obtenue')

    click(harness.root, 'Retirer ce produit du panier')
    click(harness.root, 'Oui, retirer du panier')
    const text = await untilOutput(harness.root, 'pas été comprise')

    expect(text).not.toContain('Retrait demandé')
    expect(text).not.toContain('Blocage probable')
  })

  it('lit la quantité 0 après le retrait', async () => {
    let writes = 0
    const harness = mount({
      route: (url) => {
        if (!url.includes('panier.aspx')) return html(searchPage([FLOUR]))
        return ++writes === 1 ? cartReply(1) : cartReply(0)
      },
    })
    await searched(harness)
    openEssai(harness, 3)
    pick(harness, FLOUR_ID)
    click(harness.root, 'Préparer l’ajout')
    click(harness.root, 'Oui, ajouter 1 au panier')
    await untilOutput(harness.root, 'Quantité obtenue')

    click(harness.root, 'Retirer ce produit du panier')
    click(harness.root, 'Oui, retirer du panier')
    const text = await untilOutput(harness.root, 'Retrait demandé')

    expect(text).toContain(
      `Produit ${FLOUR_ID} absent de lstProduitsLight (0 au panier) : quantité obtenue 0`,
    )
  })
})

describe('checkBeforeAdd', () => {
  const product = (overrides: Partial<Product>): Product => ({
    id: '1',
    label1: 'x',
    label2: null,
    unitPrice: null,
    unitPriceText: null,
    promoText: null,
    measurePrice: null,
    measurePriceText: null,
    stock: 5,
    inCart: 0,
    ...overrides,
  })

  it('autorise un produit connu, absent du panier et en stock, sans réserve', () => {
    expect(checkBeforeAdd([product({})], '1')).toEqual({ allowed: true, warnings: [] })
  })

  it('refuse un produit déjà au panier', () => {
    expect(checkBeforeAdd([product({ inCart: 3 })], '1').allowed).toBe(false)
  })

  it('autorise un produit sans stock en le disant', () => {
    expect(checkBeforeAdd([product({ stock: 0 })], '1').warnings[0]).toContain('stock lu est 0')
  })

  it('autorise un produit inconnu avec une mise en garde', () => {
    expect(checkBeforeAdd([product({})], '2')).toMatchObject({ allowed: true })
  })

  it('tient pour absent du panier un produit dont la quantité n’a pas été lue', () => {
    expect(checkBeforeAdd([product({ inCart: null })], '1').allowed).toBe(true)
  })
})

describe('essai 12 : disponibilité d’un produit connu', () => {
  it('retrouve le produit par son libellé et lit son stock', async () => {
    // Given
    const harness = mount()
    await searched(harness)
    openEssai(harness, 12)
    pick(harness, FLOUR_ID)
    expect(field(harness.root, 'Libellé du produit').value).toBe(FLOUR.line1)

    // When
    click(harness.root, 'Chercher ce produit')
    const text = await untilOutput(harness.root, 'Stock (iQteDisponible)')

    // Then
    expect(harness.fetch.mock.calls.at(-1)?.[0]).toContain(
      `TexteRecherche=${encodeURIComponent(FLOUR.line1)}`,
    )
    expect(text).toContain(`Produit recherché : id ${FLOUR_ID}, libellé « ${FLOUR.line1} »`)
    expect(text).toContain('Retrouvé par son identifiant : oui, au rang 1')
    expect(text).toContain('Stock (iQteDisponible) : 12')
    expect(text).toContain('Déjà au panier (iQuantitePanier) : 0')
    expect(harness.root.textContent).toContain("Disponible : l'essai 3 teste l'ajout.")
    expect(() => button(harness.root, 'Essayer d’ajouter')).toThrow('introuvable')
  })

  it('propose l’essai d’ajout d’un produit en rupture, relit la quantité au panier et laisse retirer', async () => {
    // Given : un produit à stock 0, que le panier refuse d’ajouter
    const harness = mount({
      route: (url) =>
        url.includes('panier.aspx')
          ? json([
              {
                eTypeEvenement: 2,
                lstProduits: [{ iIdProduit: SUGAR.id, iQuantite: 0, iQteDisponible: 0 }],
              },
            ])
          : html(searchPage([FLOUR, SUGAR])),
    })
    openEssai(harness, 12)
    type(field(harness.root, 'Identifiant du produit'), SUGAR_ID)
    type(field(harness.root, 'Libellé du produit'), SUGAR.line1)
    click(harness.root, 'Chercher ce produit')
    const found = await untilOutput(harness.root, 'Stock (iQteDisponible) : 0')
    expect(found).toContain('au rang 2')

    // When : il demande l’essai d’ajout puis confirme
    click(harness.root, 'Essayer d’ajouter ce produit')
    expect(posts(harness)).toHaveLength(0)
    expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'stock lu est 0',
    )
    click(harness.root, 'Oui, ajouter 1 au panier')
    const text = await untilOutput(harness.root, 'quantité au panier lue (iQuantitePanier)')

    // Then : la réponse du panier et la quantité relue par une recherche (après une pause de cadence)
    expect(posts(harness)).toHaveLength(1)
    expect(text).toContain(
      `Produit ${SUGAR_ID} dans la réponse : iIdProduit=${SUGAR_ID} ; iQuantite=0 ; iQteDisponible=0`,
    )
    expect(text).toContain("Après l'essai, quantité au panier lue (iQuantitePanier) : 0")
    expect(harness.sleeps).toEqual([1150])
    expect(button(harness.root, 'Retirer ce produit du panier')).toBeTruthy()
  })

  it('propose aussi l’essai quand le produit n’est plus retrouvé', async () => {
    const harness = mount({ route: () => html(searchPage([FLOUR])) })
    openEssai(harness, 12)
    type(field(harness.root, 'Identifiant du produit'), '999')
    type(field(harness.root, 'Libellé du produit'), 'Produit disparu')

    click(harness.root, 'Chercher ce produit')
    const text = await untilOutput(harness.root, 'Retrouvé par son identifiant : non')

    expect(text).toContain('Produits reconnus dans la recherche : 1')
    expect(button(harness.root, 'Essayer d’ajouter ce produit')).toBeTruthy()
  })

  it('demande l’identifiant et le libellé', () => {
    const harness = mount()
    openEssai(harness, 12)

    click(harness.root, 'Chercher ce produit')

    expect(output(harness.root)).toBe(
      "Renseigne l'identifiant (chiffres) et le libellé du produit.",
    )
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('refuse hors d’une page de magasin', () => {
    const harness = mount({ path: '/' })
    openEssai(harness, 12)

    click(harness.root, 'Chercher ce produit')

    expect(output(harness.root)).toContain("Cette page n'est pas une page de magasin")
  })

  it('dit quand la recherche est bloquée ou échoue', async () => {
    const blocked = mount({ route: () => html('', 403) })
    openEssai(blocked, 12)
    type(field(blocked.root, 'Identifiant du produit'), '1')
    type(field(blocked.root, 'Libellé du produit'), 'x')
    click(blocked.root, 'Chercher ce produit')
    expect(await untilOutput(blocked.root, 'Blocage probable')).toContain('Blocage probable')
    unmount()

    const down = mount({ route: () => Promise.reject(new Error('coupé')) })
    openEssai(down, 12)
    type(field(down.root, 'Identifiant du produit'), '1')
    type(field(down.root, 'Libellé du produit'), 'x')
    click(down.root, 'Chercher ce produit')
    expect(await untilOutput(down.root, 'Pas de réponse exploitable')).toContain(
      'Pas de réponse exploitable',
    )
  })

  it('lit la quantité au panier après un ajout dont la relecture échoue', async () => {
    let searches = 0
    const harness = mount({
      route: (url) => {
        if (url.includes('panier.aspx')) return json([])
        return ++searches === 1 ? html(searchPage([SUGAR])) : html('', 500)
      },
    })
    openEssai(harness, 12)
    type(field(harness.root, 'Identifiant du produit'), SUGAR_ID)
    type(field(harness.root, 'Libellé du produit'), SUGAR.line1)
    click(harness.root, 'Chercher ce produit')
    expect(await untilOutput(harness.root, 'Stock (iQteDisponible) : 0')).toContain(
      'Stock (iQteDisponible) : 0',
    )

    click(harness.root, 'Essayer d’ajouter ce produit')
    click(harness.root, 'Oui, ajouter 1 au panier')

    expect(await untilOutput(harness.root, 'HTTP 500')).toContain('HTTP 500')
  })
})
