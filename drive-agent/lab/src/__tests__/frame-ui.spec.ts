import { afterEach, describe, expect, it, vi } from 'vitest'

import { cartBody } from '../cart'
import { FLOUR, SUGAR } from './fixtures'
import {
  click,
  field,
  mount,
  openEssai,
  output,
  type,
  unmount,
  untilOutput,
  type Harness,
} from './harness'

afterEach(unmount)

/** Le cadre jsdom qui vient d’être créé par l’essai 5 : une vraie fenêtre, dont on remplit la page. */
function frameWindow(harness: Harness): Window & typeof globalThis & { __sent: unknown[] } {
  const iframe = harness.root.querySelector('iframe') as HTMLIFrameElement
  const win = iframe.contentWindow as unknown as Window & typeof globalThis & { __sent: unknown[] }
  // Les fonctions d’envoi « réelles » du cadre : rien ne part sur le réseau.
  win.__sent = []
  win.XMLHttpRequest.prototype.open = function () {}
  win.XMLHttpRequest.prototype.send = function (body) {
    win.__sent.push(body)
  }
  win.fetch = vi.fn<() => Promise<Response>>(
    async () => new Response('[]'),
  ) as unknown as typeof win.fetch
  return win
}

function fillFrame(harness: Harness, html: string): void {
  const doc = (harness.root.querySelector('iframe') as HTMLIFrameElement)
    .contentDocument as Document
  doc.open()
  doc.write(html)
  doc.close()
}

function loadFrame(harness: Harness): void {
  ;(harness.root.querySelector('iframe') as HTMLIFrameElement).dispatchEvent(new Event('load'))
}

const TILES = `<section data-produit="${FLOUR.id}"><h3>${FLOUR.line1}</h3><span class="quantite">0</span></section>
<section data-produit="${SUGAR.id}"><h3>${SUGAR.line1}</h3><span class="quantite">0</span></section>`
const FRAME_PAGE = `<html><body><main>${TILES}${'<p>Résultats de la recherche pour votre magasin.</p>'.repeat(2)}<script>var d = ${JSON.stringify({ lstProduits: [FLOUR, SUGAR].map((p) => ({ iIdProduit: p.id, sLibelleLigne1: p.line1, iQteDisponible: p.stock })) })}</script></main></body></html>`

describe('essai 5 : cadre natif', () => {
  it('ouvre un cadre plein écran vers la recherche du même hôte et cache le banc', () => {
    // Given
    const harness = mount()
    openEssai(harness, 5)

    // When
    type(field(harness.root, 'Mot à chercher'), 'lait')
    click(harness.root, 'Ouvrir le cadre')

    // Then
    const iframe = harness.root.querySelector('iframe') as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toBe(
      `${window.location.origin}/magasin-999111-999111/recherche.aspx?TexteRecherche=lait`,
    )
    expect(harness.root.querySelector<HTMLElement>('.overlay')?.hidden).toBe(true)
    expect(harness.root.querySelector('.framebar')).not.toBeNull()
    expect(harness.lab.state.frame?.isOpen()).toBe(true)
  })

  it('décrit le cadre chargé, lisible, avec ses produits, puis surveille les ajouts', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    frameWindow(harness)
    fillFrame(harness, FRAME_PAGE)

    loadFrame(harness)
    click(harness.root, 'Retour au banc')

    const text = output(harness.root)
    expect(text).toContain('Cadre : évènement « load » reçu.')
    expect(text).toContain('Contenu du cadre accessible (même origine) : oui.')
    expect(text).toContain('Produits reconnus dans le cadre : 2')
    expect(text).toContain('Surveillance armée (XHR, fetch, DOM)')
  })

  it('refuse de s’ouvrir hors d’une page de magasin ou sans mot', () => {
    const harness = mount({ path: '/' })
    openEssai(harness, 5)

    click(harness.root, 'Ouvrir le cadre')
    expect(output(harness.root)).toContain("Cette page n'est pas une page de magasin")
    expect(harness.root.querySelector('iframe')).toBeNull()
    unmount()

    const second = mount()
    openEssai(second, 5)
    type(field(second.root, 'Mot à chercher'), ' ')
    click(second.root, 'Ouvrir le cadre')
    expect(output(second.root)).toBe('Écris un mot à chercher.')
  })

  it('dit quand le cadre ne se charge pas', () => {
    vi.useFakeTimers()
    try {
      const harness = mount()
      openEssai(harness, 5)
      click(harness.root, 'Ouvrir le cadre')

      vi.advanceTimersByTime(20_001)

      expect(output(harness.root)).toContain("Le cadre ne s'est pas chargé en 20 s")
    } finally {
      vi.useRealTimers()
    }
  })

  it('n’avertit pas d’un non-chargement quand le cadre s’est chargé', () => {
    vi.useFakeTimers()
    try {
      const harness = mount()
      openEssai(harness, 5)
      click(harness.root, 'Ouvrir le cadre')
      frameWindow(harness)
      fillFrame(harness, FRAME_PAGE)
      loadFrame(harness)

      vi.advanceTimersByTime(30_000)

      expect(output(harness.root)).not.toContain("ne s'est pas chargé")
    } finally {
      vi.useRealTimers()
    }
  })

  it('un cadre refusé (contenu illisible) n’est pas surveillé', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    const iframe = harness.root.querySelector('iframe') as HTMLIFrameElement
    Object.defineProperty(iframe, 'contentDocument', { value: null })

    loadFrame(harness)

    expect(output(harness.root)).toContain('refus probable')
    expect(output(harness.root)).not.toContain('Surveillance armée')
  })

  it('dit quand la surveillance est impossible', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    const win = frameWindow(harness)
    fillFrame(harness, FRAME_PAGE)
    Object.defineProperty(win, 'XMLHttpRequest', {
      get() {
        throw new Error('interdit')
      },
    })

    loadFrame(harness)

    expect(output(harness.root)).toContain('Surveillance impossible')
  })

  it('ferme le cadre et revient au banc', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')

    click(harness.root, 'Fermer le cadre')

    expect(harness.root.querySelector('iframe')).toBeNull()
    expect(harness.root.querySelector('.framebar')).toBeNull()
    expect(harness.root.querySelector<HTMLElement>('.overlay')?.hidden).toBe(false)
    expect(harness.lab.state.frame).toBeNull()
  })

  it('remplace le cadre précédent quand on en ouvre un autre, et le ferme avec le banc', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    click(harness.root, 'Retour au banc')
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')

    expect(harness.root.querySelectorAll('iframe')).toHaveLength(1)

    click(harness.root, 'Retour au banc')
    click(harness.root, 'Fermer')
    expect(harness.root.querySelectorAll('iframe')).toHaveLength(0)
  })
})

describe('essai 6 : repérer un ajout fait dans le cadre', () => {
  it('demande d’abord l’essai 5', () => {
    const harness = mount()
    openEssai(harness, 6)

    expect(output(harness.root)).toBe('Aucun cadre ouvert : fais d’abord l’essai 5.')
  })

  it('affiche le produit ajouté par la requête du cadre, avec la méthode XHR, au fil de l’eau', () => {
    // Given : le cadre est ouvert, chargé et surveillé
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    const win = frameWindow(harness)
    fillFrame(harness, FRAME_PAGE)
    loadFrame(harness)
    click(harness.root, 'Retour au banc')
    openEssai(harness, 6)
    expect(output(harness.root)).toContain('Aucun ajout repéré pour l’instant.')

    // When : la page de Leclerc, dans le cadre, envoie un ajout au panier
    const xhr = new win.XMLHttpRequest()
    xhr.open('POST', '/magasin-999111-999111/panier.aspx?op=1')
    xhr.send(
      cartBody({ action: 1, productId: String(SUGAR.id), quantity: 1, deliveryPoint: '999111' }),
    )

    // Then : le produit et la méthode apparaissent, la requête est partie normalement
    const text = output(harness.root)
    expect(text).toContain(
      'Méthode(s) qui ont réagi : XHR (1) ; produit identifié dans 1 cas sur 1.',
    )
    expect(text).toContain(
      `1. [XHR] produit ${SUGAR.id} « ${SUGAR.line1} » — ajout, quantité visée 1`,
    )
    expect(win.__sent).toHaveLength(1)
  })

  it('affiche aussi un ajout repéré par fetch et montre la dernière détection dans la barre du cadre', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    const win = frameWindow(harness)
    fillFrame(harness, FRAME_PAGE)
    loadFrame(harness)

    void win.fetch('/magasin-999111-999111/panier.aspx?op=1', {
      method: 'POST',
      body: cartBody({ action: 1, productId: String(FLOUR.id), quantity: 2, deliveryPoint: '1' }),
    })

    expect(harness.root.querySelector('.framebar .live')?.textContent).toBe(
      `[fetch] produit ${FLOUR.id} « ${FLOUR.line1} » — ajout, quantité visée 2`,
    )
    click(harness.root, 'Retour au banc')
    openEssai(harness, 6)
    expect(output(harness.root)).toContain('fetch (1)')
  })

  it('repère par le DOM le produit dont la tuile change après un toucher', async () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    const win = frameWindow(harness)
    fillFrame(harness, FRAME_PAGE)
    loadFrame(harness)
    click(harness.root, 'Retour au banc')
    openEssai(harness, 6)

    win.document.dispatchEvent(new win.Event('pointerdown'))
    ;(win.document.querySelector(`[data-produit="${FLOUR.id}"] .quantite`) as Element).textContent =
      '1'

    await vi.waitFor(() =>
      expect(output(harness.root)).toContain(`[DOM] produit ${FLOUR.id} « ${FLOUR.line1} »`),
    )
    expect(output(harness.root)).toContain('Méthode(s) qui ont réagi : DOM (1)')
  })

  it('permet de revoir le cadre et de mettre à jour le résultat', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    click(harness.root, 'Retour au banc')
    openEssai(harness, 6)

    click(harness.root, 'Voir le cadre')
    expect(harness.root.querySelector<HTMLElement>('.overlay')?.hidden).toBe(true)
    expect(harness.root.querySelector<HTMLElement>('iframe')?.hidden).toBe(false)

    click(harness.root, 'Retour au banc')
    openEssai(harness, 6)
    click(harness.root, 'Mettre à jour')
    expect(output(harness.root)).toContain('Aucun ajout repéré')
  })

  it('redit « aucun cadre » une fois le cadre fermé', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    click(harness.root, 'Fermer le cadre')

    openEssai(harness, 6)

    expect(output(harness.root)).toBe('Aucun cadre ouvert : fais d’abord l’essai 5.')
  })

  it('relance la surveillance quand l’utilisateur change de page dans le cadre', () => {
    const harness = mount()
    openEssai(harness, 5)
    click(harness.root, 'Ouvrir le cadre')
    frameWindow(harness)
    fillFrame(harness, FRAME_PAGE)
    loadFrame(harness)
    const first = harness.lab.state.frame?.disarm

    const win = frameWindow(harness)
    fillFrame(harness, FRAME_PAGE)
    loadFrame(harness)

    expect(harness.lab.state.frame?.disarm).not.toBe(first)
    const xhr = new win.XMLHttpRequest()
    xhr.open('POST', '/x/panier.aspx')
    xhr.send(cartBody({ action: 1, productId: String(FLOUR.id), quantity: 1, deliveryPoint: '1' }))
    expect(harness.lab.state.frame?.events).toHaveLength(1)
  })
})

describe('invariants du cadre', () => {
  it('n’envoie aucune requête vers le réseau : le cadre est seulement ouvert', async () => {
    const harness = mount()
    openEssai(harness, 5)

    click(harness.root, 'Ouvrir le cadre')
    await untilOutput(harness.root, 'Ouverture du cadre')

    expect(harness.fetch).not.toHaveBeenCalled()
    expect(harness.navigated).toEqual([])
  })
})
