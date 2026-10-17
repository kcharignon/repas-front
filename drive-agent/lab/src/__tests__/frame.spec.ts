import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cartBody } from '../cart'
import {
  armFrame,
  catalogOf,
  formatEvent,
  inspectFrame,
  matchProduct,
  summarizeEvents,
  type AddEvent,
} from '../frame'
import type { Product } from '../parse'

const FLOUR: Product = {
  id: '1000001',
  label1: 'Farine de blé T55 Moulin Imaginaire',
  label2: '1 kg',
  unitPrice: 1.29,
  unitPriceText: '1,29 €',
  promoText: null,
  measurePrice: 1.29,
  measurePriceText: '1,29 € / kg',
  stock: 12,
  inCart: 0,
}
const SUGAR: Product = { ...FLOUR, id: '1000002', label1: 'Sucre en poudre Sucrerie Fictive' }
const CATALOG = catalogOf([FLOUR, SUGAR])

const ADD_BODY = cartBody({ action: 1, productId: '1000001', quantity: 1, deliveryPoint: '123456' })

function tile(id: string, label: string): string {
  return `<section data-produit="${id}"><h3>${label}</h3><span class="quantite">0</span><button>Ajouter</button></section>`
}

describe('matchProduct', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="liste">${tile('1000001', FLOUR.label1 ?? '')}${tile('1000002', SUGAR.label1 ?? '')}</div>`
  })

  it('rattache un élément au produit dont l’identifiant est dans un attribut d’un ancêtre', () => {
    const quantity = document.querySelector('[data-produit="1000002"] .quantite') as Element

    expect(matchProduct(quantity, CATALOG)).toMatchObject({
      product: { id: '1000002' },
      via: 'attribut « data-produit »',
    })
  })

  it('part d’un nœud texte', () => {
    const text = (document.querySelector('[data-produit="1000001"] .quantite') as Element)
      .firstChild as Node

    expect(matchProduct(text, CATALOG)?.product.id).toBe('1000001')
  })

  it('rattache un élément au produit dont le libellé est dans le texte voisin', () => {
    document.body.innerHTML = `<article><b>${FLOUR.label1}</b><i class="qte">1</i></article>`

    expect(matchProduct(document.querySelector('.qte') as Element, CATALOG)).toMatchObject({
      product: { id: '1000001' },
      via: 'libellé dans le texte voisin',
    })
  })

  it('ne prend pas un nombre plus long qui contient l’identifiant', () => {
    document.body.innerHTML = '<div data-x="991000001999"><span id="s">a</span></div>'

    expect(matchProduct(document.getElementById('s') as Element, CATALOG)).toBeNull()
  })

  it('ne trouve rien hors d’un produit', () => {
    document.body.innerHTML = '<footer><p id="p">Mentions</p></footer>'

    expect(matchProduct(document.getElementById('p') as Element, CATALOG)).toBeNull()
  })
})

describe('armFrame : enveloppe de XMLHttpRequest et de fetch', () => {
  const events: AddEvent[] = []
  let disarm: () => void
  let sent: unknown[]
  let originalSend: typeof XMLHttpRequest.prototype.send
  let originalOpen: typeof XMLHttpRequest.prototype.open
  let originalFetch: typeof window.fetch

  beforeEach(() => {
    events.length = 0
    sent = []
    originalSend = XMLHttpRequest.prototype.send
    originalOpen = XMLHttpRequest.prototype.open
    originalFetch = window.fetch
    // Les « vraies » fonctions du cadre : rien ne part sur le réseau.
    XMLHttpRequest.prototype.open = function () {}
    XMLHttpRequest.prototype.send = function (body) {
      sent.push(body)
    }
    window.fetch = vi.fn<() => Promise<Response>>(
      async () => new Response('[]'),
    ) as unknown as typeof window.fetch
    document.body.innerHTML = ''
    disarm = armFrame(window, CATALOG, (event) => events.push(event))
  })

  afterEach(() => {
    disarm()
    XMLHttpRequest.prototype.open = originalOpen
    XMLHttpRequest.prototype.send = originalSend
    window.fetch = originalFetch
  })

  it('repère un ajout envoyé par XMLHttpRequest et laisse la requête partir', () => {
    // When
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/magasin-1-1/panier.aspx?op=1')
    xhr.send(ADD_BODY)

    // Then
    expect(events).toEqual([
      {
        method: 'XHR',
        productId: '1000001',
        label: FLOUR.label1,
        detail: 'ajout, quantité visée 1',
      },
    ])
    expect(sent).toEqual([ADD_BODY])
  })

  it('repère un retrait', () => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', 'https://exemple.test/magasin-1-1/panier.aspx?op=1')
    xhr.send(cartBody({ action: 2, productId: '1000002', quantity: 0, deliveryPoint: '1' }))

    expect(events[0]).toMatchObject({
      method: 'XHR',
      productId: '1000002',
      detail: 'retrait, quantité visée 0',
    })
  })

  it('ignore les autres requêtes', () => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/magasin-1-1/recherche.aspx')
    xhr.send(null)
    new XMLHttpRequest().send(ADD_BODY)

    expect(events).toEqual([])
    expect(sent).toHaveLength(2)
  })

  it('dit qu’un produit est inconnu du catalogue et qu’un corps est illisible', () => {
    const unknown = new XMLHttpRequest()
    unknown.open('POST', '/panier.aspx')
    unknown.send(cartBody({ action: 1, productId: '555', quantity: 2, deliveryPoint: '1' }))
    const blank = new XMLHttpRequest()
    blank.open('POST', '/panier.aspx')
    blank.send('rien')

    expect(events[0]).toMatchObject({
      productId: '555',
      label: null,
      detail: 'ajout, quantité visée 2',
    })
    expect(events[1]).toEqual({
      method: 'XHR',
      productId: null,
      label: null,
      detail: 'requête vers le panier, corps illisible',
    })
  })

  it('repère un ajout envoyé par fetch', async () => {
    // When
    await window.fetch('/magasin-1-1/panier.aspx?op=1', { method: 'POST', body: ADD_BODY })
    await window.fetch(new URL('https://exemple.test/magasin-1-1/panier.aspx'), {
      method: 'POST',
      body: ADD_BODY,
    })
    await window.fetch(
      new Request('https://exemple.test/panier.aspx', { method: 'POST', body: ADD_BODY }),
    )
    await window.fetch('/autre.aspx')

    // Then
    expect(events.map((event) => event.method)).toEqual(['fetch', 'fetch', 'fetch'])
    expect(events[0]).toMatchObject({ productId: '1000001', label: FLOUR.label1 })
    expect(events[2]?.detail).toBe('requête vers le panier, corps illisible')
  })

  it('retire ses enveloppes quand on le lui demande', () => {
    disarm()
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/panier.aspx')
    xhr.send(ADD_BODY)

    expect(events).toEqual([])
    disarm = armFrame(window, CATALOG, (event) => events.push(event))
  })
})

describe('armFrame : observation du DOM', () => {
  let disarm: () => void = () => {}
  const events: AddEvent[] = []
  let clock = 0

  beforeEach(() => {
    events.length = 0
    clock = 0
    document.body.innerHTML = `<div id="liste">${tile('1000001', FLOUR.label1 ?? '')}${tile('1000002', SUGAR.label1 ?? '')}</div><p id="bas">Pied</p>`
    disarm = armFrame(window, CATALOG, (event) => events.push(event), {
      now: () => clock,
      debounceMs: 5,
      interactionWindowMs: 1000,
    })
  })

  afterEach(() => disarm())

  const settle = () => new Promise((resolve) => setTimeout(resolve, 30))
  const touch = () => document.dispatchEvent(new Event('pointerdown'))

  it('repère le produit dont la tuile change après un toucher', async () => {
    // Given
    touch()

    // When
    ;(document.querySelector('[data-produit="1000002"] .quantite') as Element).textContent = '1'
    await settle()

    // Then
    expect(events).toEqual([
      {
        method: 'DOM',
        productId: '1000002',
        label: SUGAR.label1,
        detail: 'changement de la page, rattaché au produit par attribut « data-produit »',
      },
    ])
  })

  it('ne signale qu’une fois un produit dont plusieurs éléments changent', async () => {
    touch()
    const section = document.querySelector('[data-produit="1000001"]') as Element
    ;(section.querySelector('.quantite') as Element).textContent = '1'
    section.querySelector('button')?.setAttribute('class', 'ajoute')
    await settle()

    expect(events.map((event) => event.productId)).toEqual(['1000001'])
  })

  it('ignore ce qui change sans toucher récent (images, publicités…)', async () => {
    ;(document.querySelector('[data-produit="1000001"] .quantite') as Element).textContent = '9'
    await settle()
    clock = 5000
    ;(document.querySelector('[data-produit="1000001"] .quantite') as Element).textContent = '8'
    await settle()

    expect(events).toEqual([])
  })

  it('ignore les attributs d’image et de style', async () => {
    touch()
    ;(document.querySelector('[data-produit="1000001"] h3') as Element).setAttribute(
      'style',
      'color: red',
    )
    await settle()

    expect(events).toEqual([])
  })

  it('signale un changement sans produit reconnu', async () => {
    touch()
    ;(document.getElementById('bas') as Element).textContent = 'Autre'
    await settle()

    expect(events).toEqual([
      {
        method: 'DOM',
        productId: null,
        label: null,
        detail: 'changement de la page, produit non reconnu',
      },
    ])
  })

  it('s’arrête une fois retiré', async () => {
    disarm()
    touch()
    ;(document.querySelector('[data-produit="1000001"] .quantite') as Element).textContent = '2'
    await settle()

    expect(events).toEqual([])
    disarm = armFrame(window, CATALOG, () => {})
  })
})

describe('formatEvent et summarizeEvents', () => {
  const events: AddEvent[] = [
    { method: 'XHR', productId: '1000001', label: 'Farine', detail: 'ajout, quantité visée 1' },
    {
      method: 'DOM',
      productId: null,
      label: null,
      detail: 'changement de la page, produit non reconnu',
    },
    { method: 'DOM', productId: '1000001', label: null, detail: 'x' },
  ]

  it('écrit un évènement en une ligne', () => {
    expect(formatEvent(events[0] as AddEvent)).toBe(
      '[XHR] produit 1000001 « Farine » — ajout, quantité visée 1',
    )
    expect(formatEvent(events[1] as AddEvent)).toBe(
      '[DOM] produit non identifié — changement de la page, produit non reconnu',
    )
    expect(formatEvent(events[2] as AddEvent)).toBe('[DOM] produit 1000001 (libellé inconnu) — x')
  })

  it('dit quelles méthodes ont réagi', () => {
    expect(summarizeEvents(events)).toBe(
      'Méthode(s) qui ont réagi : XHR (1), DOM (2) ; produit identifié dans 2 cas sur 3.',
    )
    expect(summarizeEvents([])).toBe('Aucun ajout repéré pour l’instant.')
  })
})

describe('inspectFrame', () => {
  const frameOf = (html: string | null, pathname: string | null, extra: Partial<Document> = {}) => {
    const doc = html === null ? null : new DOMParser().parseFromString(html, 'text/html')
    return {
      contentDocument: doc && Object.assign(doc, extra),
      contentWindow: pathname === null ? null : ({ location: { pathname } } as Window),
    } as Pick<HTMLIFrameElement, 'contentDocument' | 'contentWindow'>
  }
  const PAGE = `<html><body><main>${'Résultats de la recherche '.repeat(5)}<script>{"iIdProduit":1000001,"sLibelleLigne1":"Farine"}</script></main></body></html>`

  it('décrit un cadre lisible avec des produits', () => {
    const report = inspectFrame(
      frameOf(PAGE, '/magasin-1-1/recherche.aspx'),
      '/recherche.aspx',
      '/magasin-1-1/accueil.aspx',
    )

    expect(report).toMatchObject({ accessible: true, refused: false })
    expect(report.products.map((product) => product.id)).toEqual(['1000001'])
    expect(report.lines).toEqual([
      'Cadre : évènement « load » reçu.',
      'Contenu du cadre accessible (même origine) : oui.',
      'Chemin dans le cadre : /magasin-1-1/recherche.aspx',
      'Produits reconnus dans le cadre : 1',
    ])
  })

  it('reconnaît un cadre inaccessible (refus du navigateur)', () => {
    const report = inspectFrame(frameOf(null, null), '/recherche.aspx', '/p')

    expect(report).toMatchObject({ accessible: false, refused: true, products: [] })
    expect(report.lines[1]).toContain('refus probable')
  })

  it('reconnaît un accès qui lève une exception', () => {
    const frame = {
      get contentDocument(): Document {
        throw new DOMException('Blocked a frame', 'SecurityError')
      },
      contentWindow: null,
    } as Pick<HTMLIFrameElement, 'contentDocument' | 'contentWindow'>

    expect(inspectFrame(frame, '/recherche.aspx', '/p').refused).toBe(true)
  })

  it('reconnaît un cadre redirigé vers la page parente', () => {
    const report = inspectFrame(
      frameOf(PAGE, '/magasin-1-1/accueil.aspx'),
      '/recherche.aspx',
      '/magasin-1-1/accueil.aspx',
    )

    expect(report.refused).toBe(true)
    expect(report.lines).toContain('Le cadre a été redirigé vers la page parente : refus.')
  })

  it('signale une autre redirection sans refuser', () => {
    const report = inspectFrame(
      frameOf(PAGE, '/magasin-1-1/ailleurs.aspx'),
      '/recherche.aspx',
      '/magasin-1-1/accueil.aspx',
    )

    expect(report.refused).toBe(false)
    expect(report.lines.join('\n')).toContain('redirection ?')
  })

  it('reconnaît une page vide', () => {
    const report = inspectFrame(
      frameOf('<html><body></body></html>', '/magasin-1-1/recherche.aspx'),
      '/recherche.aspx',
      '/p',
    )

    expect(report.refused).toBe(true)
    expect(report.lines.join('\n')).toContain('vide')
  })

  it('reconnaît un texte de blocage et un chemin illisible', () => {
    const html = `<html><body><p>${'Please complete the CAPTCHA to continue and prove you are human. '.repeat(2)}</p></body></html>`
    const frame = {
      contentDocument: new DOMParser().parseFromString(html, 'text/html'),
      get contentWindow(): Window {
        throw new DOMException('Blocked', 'SecurityError')
      },
    } as Pick<HTMLIFrameElement, 'contentDocument' | 'contentWindow'>

    const report = inspectFrame(frame, '/recherche.aspx', '/p')

    expect(report.lines).toContain('Chemin dans le cadre : illisible')
    expect(report.lines).toContain(
      'Texte de blocage reconnu dans le cadre (captcha, accès refusé…).',
    )
  })
})
