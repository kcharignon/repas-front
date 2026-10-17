import { afterEach, describe, expect, it, vi } from 'vitest'

import { LAB_NOTICE } from '../config'
import { launch, HOST_ID } from '../ui/shell'
import {
  button,
  click,
  field,
  html,
  mount,
  openEssai,
  output,
  setPath,
  type,
  unmount,
  untilOutput,
  type Harness,
} from './harness'
import { ERROR_PAGE, FLOUR, MILK, SUGAR, searchPage } from './fixtures'

afterEach(unmount)

function textOf(harness: Harness): string {
  return harness.root.textContent ?? ''
}

describe('menu et lancement', () => {
  it('affiche le menu des 12 essais et du 3b, et la mention d’outil jetable', () => {
    // Given / When
    const harness = mount()

    // Then
    const items = Array.from(harness.root.querySelectorAll('.menu button')).map(
      (item) => item.querySelector('strong')?.textContent,
    )
    expect(items).toHaveLength(13)
    expect(items[0]).toBe("Sonde d'environnement")
    expect(items[3]).toBe('Quantités')
    expect(
      Array.from(harness.root.querySelectorAll('.menu .num')).map((item) => item.textContent),
    ).toEqual(['1.', '2.', '3.', '3b.', ...Array.from({ length: 9 }, (_, i) => `${i + 4}.`)])
    expect(textOf(harness)).toContain(LAB_NOTICE)
    expect(harness.lab.host.id).toBe(HOST_ID)
    expect(document.getElementById(HOST_ID)).toBe(harness.lab.host)
  })

  it('relancé par le favori, rouvre le banc existant au lieu d’en créer un deuxième', () => {
    const harness = mount()
    click(harness.root, 'Fermer')
    expect(harness.root.querySelector<HTMLElement>('.overlay')?.hidden).toBe(true)

    const second = launch(harness.env)

    expect(second).toBeNull()
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1)
    expect(harness.root.querySelector<HTMLElement>('.overlay')?.hidden).toBe(false)
    expect(harness.root.querySelectorAll('.menu button')).toHaveLength(13)
  })

  it('lance un banc neuf quand il n’y en a pas', () => {
    const harness = mount()
    harness.lab.host.remove()

    const lab = launch(harness.env)

    expect(lab).not.toBeNull()
    expect(document.getElementById(HOST_ID)).toBe(lab?.host)
  })

  it('ouvre un essai, revient au menu, ferme avec Échap', () => {
    const harness = mount()

    click(harness.root, 'Sonde')
    expect(harness.root.querySelector('h1')?.textContent).toBe("1. Sonde d'environnement")
    click(harness.root, '← Menu')
    expect(harness.root.querySelectorAll('.menu button')).toHaveLength(13)
    harness.root
      .querySelector('.overlay')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(harness.root.querySelector<HTMLElement>('.overlay')?.hidden).toBe(true)
  })

  it('ignore un numéro d’essai inconnu', () => {
    const harness = mount()

    harness.lab.showEssai(99)

    expect(harness.root.querySelectorAll('.menu button')).toHaveLength(13)
  })

  it('met la feuille de style dans le Shadow DOM sans balise style quand le navigateur sait la construire', () => {
    const harness = mount()

    expect(harness.root.adoptedStyleSheets).toHaveLength(1)
    expect(harness.root.querySelectorAll('style')).toHaveLength(0)
  })

  it('tombe sur un élément style quand les feuilles de style construites échouent', () => {
    // Given : un navigateur dont CSSStyleSheet refuse de se construire
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        constructor() {
          throw new TypeError('Illegal constructor')
        }
      },
    )

    // When
    const harness = mount()

    // Then
    const styles = harness.root.querySelectorAll('style')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toContain('.overlay')
    vi.unstubAllGlobals()
  })
})

describe('essai 1 : sonde', () => {
  it('indique l’hôte et le magasin de la page', () => {
    const harness = mount({ path: '/magasin-999111-999111/accueil.aspx' })

    openEssai(harness, 1)

    expect(output(harness.root)).toContain(`Hôte : ${window.location.host}`)
    expect(output(harness.root)).toContain("Magasin lu dans l'adresse : 999111")
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('copie le résultat avec le numéro du magasin masqué', async () => {
    const harness = mount()
    openEssai(harness, 1)

    click(harness.root, 'Copier le résultat')

    await vi.waitFor(() => expect(harness.copied).toHaveLength(1))
    expect(harness.copied[0]).toContain('[n° magasin]')
    expect(harness.copied[0]).toContain('magasin-[masqué]')
    expect(harness.copied[0]).not.toContain('999111')
    expect(harness.root.querySelector('.status')?.textContent).toContain('Copié')
  })

  it('dit quand la copie échoue', async () => {
    const harness = mount()
    harness.env.copy = async () => false
    openEssai(harness, 1)

    click(harness.root, 'Copier le résultat')

    await vi.waitFor(() =>
      expect(harness.root.querySelector('.status')?.textContent).toContain('La copie a échoué'),
    )
  })

  it('efface le résultat et le relance', () => {
    const harness = mount()
    openEssai(harness, 1)

    click(harness.root, 'Effacer')
    expect(output(harness.root)).toBe('Pas encore de résultat.')
    click(harness.root, 'Lancer la sonde')

    expect(output(harness.root)).toContain("Banc d'essai version")
  })

  it('ne montre jamais la valeur du cookie datadome', () => {
    Object.defineProperty(document, 'cookie', {
      value: 'datadome=VALEUR-A-NE-JAMAIS-MONTRER',
      configurable: true,
    })
    const harness = mount()
    openEssai(harness, 1)

    expect(output(harness.root)).toContain('Cookie « datadome » visible par la page : oui')
    expect(textOf(harness)).not.toContain('VALEUR-A-NE-JAMAIS-MONTRER')
    Object.defineProperty(document, 'cookie', { value: '', configurable: true })
  })
})

describe('essai 2 : recherche sur le site', () => {
  it('cherche « farine » par défaut sur l’hôte courant et détaille les produits', async () => {
    // Given
    const harness = mount()
    openEssai(harness, 2)

    // When
    click(harness.root, 'Chercher')
    const text = await untilOutput(harness.root, 'Produits reconnus')

    // Then
    expect(harness.fetch).toHaveBeenCalledTimes(1)
    expect(harness.fetch.mock.calls[0]?.[0]).toBe(
      `${window.location.origin}/magasin-999111-999111/recherche.aspx?TexteRecherche=farine`,
    )
    expect(text).toContain('HTTP 200 · text/html · ')
    expect(text).toContain(
      'Produits reconnus : 3 (identifiants repérés : 3 ; lecture : texte brut).',
    )
    expect(text).toContain('EAN dans les données : non')
    expect(text).toContain(`1. id ${FLOUR.id} — ${FLOUR.line1}`)
    expect(text).toContain('   libellé 2 : 1 kg')
    expect(text).toContain(
      'prix : 1,29 € (1.29) · promo : — · par unité de mesure : 1,29 € / kg (1.29)',
    )
    expect(text).toContain('stock (iQteDisponible) : 12 · déjà au panier (iQuantitePanier) : 0')
    expect(text).toContain(`3. id ${MILK.id}`)
    expect(text).toContain('promo : 1,35 €')
  })

  it('ne détaille que les cinq premiers produits', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...FLOUR,
      id: 2000000 + i,
      line1: `Produit ${i}`,
    }))
    const harness = mount({ route: () => html(searchPage(many)) })
    openEssai(harness, 2)

    click(harness.root, 'Chercher')
    const text = await untilOutput(harness.root, 'Produits reconnus : 8')

    expect(text).toContain('5. id 2000004')
    expect(text).not.toContain('6. id')
  })

  it('cherche le mot saisi et signale un EAN présent dans les données', async () => {
    const withEan = [{ ...FLOUR, extra: { sEAN: '3000000000000' } }]
    const harness = mount({ route: () => html(searchPage(withEan)) })
    openEssai(harness, 2)

    type(field(harness.root, 'Mot à chercher'), 'huile d’olive')
    click(harness.root, 'Chercher')
    const text = await untilOutput(harness.root, 'EAN dans les données : oui')

    expect(text).toContain('(champs : sEAN)')
    expect(harness.fetch.mock.calls[0]?.[0]).toContain('TexteRecherche=huile%20d%E2%80%99olive')
  })

  it('demande un mot', () => {
    const harness = mount()
    openEssai(harness, 2)

    type(field(harness.root, 'Mot à chercher'), '   ')
    click(harness.root, 'Chercher')

    expect(output(harness.root)).toBe('Écris un mot à chercher.')
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('refuse de chercher hors d’une page de magasin', () => {
    const harness = mount({ path: '/accueil' })
    openEssai(harness, 2)

    click(harness.root, 'Chercher')

    expect(output(harness.root)).toContain("Cette page n'est pas une page de magasin")
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('arrête tout sur un 403', async () => {
    const harness = mount({ route: () => html('Accès refusé', 403) })
    openEssai(harness, 2)

    click(harness.root, 'Chercher')
    const text = await untilOutput(harness.root, 'Blocage probable')

    expect(text).toContain('HTTP 403')
    expect(harness.fetch).toHaveBeenCalledTimes(1)
  })

  it('ne prend pas une page d’erreur 404 qui contient le mot datadome pour un blocage', async () => {
    const harness = mount({ route: () => html(ERROR_PAGE, 404) })
    openEssai(harness, 2)

    click(harness.root, 'Chercher')
    const text = await untilOutput(harness.root, 'Réponse inattendue')

    expect(text).toContain('HTTP 404')
    expect(text).not.toContain('Blocage probable')
  })

  it('dit qu’une réponse inattendue n’a rien à analyser', async () => {
    const harness = mount({ route: () => html('', 500) })
    openEssai(harness, 2)

    click(harness.root, 'Chercher')

    expect(await untilOutput(harness.root, 'Réponse inattendue')).toContain('Réponse inattendue')
  })

  it('montre une erreur réseau', async () => {
    const harness = mount({ route: () => Promise.reject(new TypeError('Failed to fetch')) })
    openEssai(harness, 2)

    click(harness.root, 'Chercher')

    expect(await untilOutput(harness.root, 'Requête sans réponse : Failed to fetch')).toContain(
      'Requête sans réponse : Failed to fetch',
    )
  })

  it('donne un extrait de 300 caractères quand l’analyse échoue', async () => {
    // Given : une page qui parle de produits mais sans le JSON attendu
    const page = `<html>${'x'.repeat(2000)}<p>lstProduits</p>${'y'.repeat(2000)}</html>`
    const harness = mount({ route: () => html(page) })
    openEssai(harness, 2)

    // When
    click(harness.root, 'Chercher')
    const text = await untilOutput(harness.root, 'Produits reconnus : 0')

    // Then
    expect(text).toContain('Extrait autour de « lstProduits » (300 caractères) : ')
    expect(text.length).toBeLessThan(700)
  })

  it('dit quand la page n’a aucun mot-clé', async () => {
    const harness = mount({ route: () => html('<html>Rien ici</html>') })
    openEssai(harness, 2)

    click(harness.root, 'Chercher')

    expect(await untilOutput(harness.root, 'Aucun mot-clé de produit dans la page')).toContain(
      'Aucun mot-clé de produit dans la page',
    )
  })

  it('signale les produits sans stock lu (lignes du panier ?)', async () => {
    const odd = [{ ...FLOUR, stock: undefined }]
    const harness = mount({ route: () => html(searchPage(odd)) })
    openEssai(harness, 2)

    click(harness.root, 'Chercher')

    expect(await untilOutput(harness.root, 'Dont sans stock lu : 1')).toContain(
      'Dont sans stock lu : 1',
    )
  })

  it('mémorise les produits pour les autres essais', async () => {
    const harness = mount()
    openEssai(harness, 2)

    click(harness.root, 'Chercher')
    expect(await untilOutput(harness.root, 'Produits reconnus')).toContain('Produits reconnus')

    expect(harness.lab.state.lastProducts.map((product) => product.id)).toEqual([
      '1000001',
      '1000002',
      '1000003',
    ])
    expect(harness.lab.state.lastQuery).toBe('farine')
  })
})

describe('essai 4 : cadence', () => {
  it('fait cinq recherches de suite avec une pause entre deux', async () => {
    // Given
    const harness = mount({ random: 0.5 })
    openEssai(harness, 4)

    // When
    click(harness.root, 'Lancer les 5 recherches')
    const text = await untilOutput(harness.root, 'Conclusion')

    // Then
    expect(harness.fetch).toHaveBeenCalledTimes(5)
    expect(
      harness.fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('TexteRecherche')),
    ).toEqual(['farine', 'sucre', 'lait', 'beurre', 'oeufs'])
    expect(harness.sleeps).toEqual([1150, 1150, 1150, 1150])
    expect(text).toContain('Conclusion : 5 réponses reçues sur 5, aucun blocage.')
    expect(text).toContain('5/5 « oeufs » : HTTP 200')
    expect(text).toContain('3 produit(s)')
  })

  it('s’arrête à la première réponse 403 et dit combien de réponses sont arrivées avant', async () => {
    let calls = 0
    const harness = mount({
      route: () => (++calls >= 3 ? html('bloqué', 403) : html(searchPage([FLOUR]))),
    })
    openEssai(harness, 4)

    click(harness.root, 'Lancer les 5 recherches')
    const text = await untilOutput(harness.root, 'Conclusion')

    expect(harness.fetch).toHaveBeenCalledTimes(3)
    expect(text).toContain(
      'Conclusion : blocage (HTTP 403) à la requête 3 ; 2 réponse(s) reçue(s) avant le blocage.',
    )
  })

  it('s’arrête aussi sur un 429', async () => {
    const harness = mount({ route: () => html('', 429) })
    openEssai(harness, 4)

    click(harness.root, 'Lancer les 5 recherches')

    expect(
      await untilOutput(harness.root, 'blocage (HTTP 429) à la requête 1 ; 0 réponse(s)'),
    ).toContain('blocage (HTTP 429) à la requête 1 ; 0 réponse(s)')
  })

  it('s’arrête sur une erreur réseau', async () => {
    const harness = mount({ route: () => Promise.reject(new Error('hors ligne')) })
    openEssai(harness, 4)

    click(harness.root, 'Lancer les 5 recherches')

    expect(await untilOutput(harness.root, 'arrêt sur une erreur réseau à la requête 1')).toContain(
      'arrêt sur une erreur réseau à la requête 1',
    )
    expect(harness.fetch).toHaveBeenCalledTimes(1)
  })

  it('s’arrête quand on touche « Arrêter »', async () => {
    const harness = mount()
    harness.env.sleep = async () => {
      click(harness.root, 'Arrêter')
    }
    openEssai(harness, 4)

    click(harness.root, 'Lancer les 5 recherches')
    const text = await untilOutput(harness.root, 'Conclusion')

    expect(harness.fetch).toHaveBeenCalledTimes(1)
    expect(text).toContain('arrêt demandé après 1 réponse(s)')
  })

  it('ne repart pas deux fois en même temps', async () => {
    const harness = mount()
    openEssai(harness, 4)

    click(harness.root, 'Lancer les 5 recherches')

    expect(button(harness.root, 'Lancer les 5 recherches').disabled).toBe(true)
    expect(await untilOutput(harness.root, 'Conclusion')).toContain('Conclusion')
    expect(button(harness.root, 'Lancer les 5 recherches').disabled).toBe(false)
  })
})

describe('essai 10 : contenu net', () => {
  it('compare le libellé et les prix des produits de la dernière recherche', async () => {
    // Given
    const harness = mount()
    openEssai(harness, 2)
    click(harness.root, 'Chercher')
    expect(await untilOutput(harness.root, 'Produits reconnus')).toContain('Produits reconnus')
    openEssai(harness, 10)

    // When
    click(harness.root, 'Comparer')
    const text = await untilOutput(harness.root, 'Contenu net de 3 produit(s)')

    // Then
    expect(harness.fetch).toHaveBeenCalledTimes(1)
    expect(text).toContain('Trouvé par le libellé : 3 (dont ligne 2 : 3, ligne 1 seulement : 0)')
    expect(text).toContain('Trouvé par les prix : 3')
    expect(text).toContain("Les deux méthodes d'accord : 3 ; en désaccord : 0")
    expect(text).toContain('1. id 1000001 — Farine de blé T55 Moulin Imaginaire | 1 kg')
    expect(text).toContain(
      'libellé (ligne 2) : 1000 g · prix : 1000 g (1,29 € ÷ 1,29 € / kg) → accord',
    )
    expect(text).toContain('libellé (ligne 2) : 6000 ml · prix : 6000 ml')
  })

  it('écrit que les champs structurés sont absents quand les produits n’en portent pas', async () => {
    const harness = mount()
    openEssai(harness, 10)

    click(harness.root, 'Comparer')
    const text = await untilOutput(harness.root, 'Contenu net de 3 produit(s)')

    expect(text).toContain(
      'Champs structurés (sUniteMesure, nrContenanceUnitaire, nrContenanceTotale) : absents des produits de cette recherche.',
    )
    expect(text).not.toContain('structuré :')
  })

  it('affiche les champs structurés à côté des deux méthodes et dit s’ils s’accordent', async () => {
    // Given : trois produits INVENTÉS ; la farine et le sucre portent le contenu net structuré, le sucre se trompe
    const structured = [
      {
        ...FLOUR,
        extra: {
          sUniteMesure: 'KG',
          nrContenanceUnitaire: 1,
          nrContenanceTotale: 1,
          sUniteMesureTotale: 'kg',
        },
      },
      {
        ...SUGAR,
        extra: {
          sUniteMesure: 'KG',
          nrContenanceUnitaire: 2,
          nrContenanceTotale: 2,
          sUniteMesureTotale: 'kg',
        },
      },
      MILK,
    ]
    const harness = mount({ route: () => html(searchPage(structured)) })
    openEssai(harness, 10)

    // When
    click(harness.root, 'Comparer')
    const text = await untilOutput(harness.root, 'Contenu net de 3 produit(s)')

    // Then
    expect(text).toContain(
      'Champs structurés (sUniteMesure, nrContenanceUnitaire, nrContenanceTotale) : présents sur 2 produit(s) sur 3.',
    )
    expect(text).toContain(
      "Structuré contre libellé : d'accord 1 sur 2 comparable(s) ; structuré contre prix : d'accord 1 sur 2 comparable(s)",
    )
    expect(text).toContain(
      '   structuré : sUniteMesure=KG · nrContenanceUnitaire=1 · nrContenanceTotale=1 · sUniteMesureTotale=kg → 1000 g (libellé : accord · prix : accord)',
    )
    expect(text).toContain(
      '   structuré : sUniteMesure=KG · nrContenanceUnitaire=2 · nrContenanceTotale=2 · sUniteMesureTotale=kg → 2000 g (libellé : écart · prix : écart)',
    )
    expect(text.split('\n').filter((line) => line.includes('   structuré :'))).toHaveLength(2)
  })

  it('dit « non comparable » quand le produit structuré n’a ni libellé ni prix lisibles', async () => {
    const odd = [
      {
        ...FLOUR,
        line2: 'Marque X',
        line1: 'Farine Y',
        measureText: 'prix variable',
        extra: { sUniteMesureTotale: 'kg', nrContenanceTotale: 1 },
      },
    ]
    const harness = mount({ route: () => html(searchPage(odd)) })
    openEssai(harness, 10)

    click(harness.root, 'Comparer')
    const text = await untilOutput(harness.root, 'Contenu net de 1 produit(s)')

    expect(text).toContain('→ 1000 g (libellé : non comparable · prix : non comparable)')
    expect(text).toContain(
      "Structuré contre libellé : d'accord 0 sur 0 comparable(s) ; structuré contre prix : d'accord 0 sur 0 comparable(s)",
    )
  })

  it('lance d’abord une recherche s’il n’y en a pas encore', async () => {
    const harness = mount()
    openEssai(harness, 10)

    click(harness.root, 'Comparer')
    const text = await untilOutput(harness.root, 'Contenu net de 3 produit(s)')

    expect(harness.fetch).toHaveBeenCalledTimes(1)
    expect(text).toContain('Recherche « farine » : HTTP 200')
  })

  it('dit quand la recherche ne donne rien', async () => {
    const harness = mount({ route: () => html('<html></html>') })
    openEssai(harness, 10)

    click(harness.root, 'Comparer')

    expect(await untilOutput(harness.root, 'Aucun produit reconnu')).toContain(
      'Aucun produit reconnu',
    )
  })

  it('retient le libellé de première ligne à défaut de la seconde et signale un écart', async () => {
    const odd = [
      {
        ...SUGAR,
        line1: 'Sucre 500 g',
        line2: 'Marque X',
        measurePrice: 4,
        measureText: '4,00 € / kg',
        price: 1.5,
      },
    ]
    const harness = mount({ route: () => html(searchPage(odd)) })
    openEssai(harness, 10)

    click(harness.root, 'Comparer')
    const text = await untilOutput(harness.root, 'Contenu net de 1 produit(s)')

    expect(text).toContain('Trouvé par le libellé : 1 (dont ligne 2 : 0, ligne 1 seulement : 1)')
    expect(text).toContain('libellé (ligne 1) : 500 g · prix : 375 g')
    expect(text).toContain('→ écart')
  })

  it('refuse hors d’une page de magasin', () => {
    const harness = mount({ path: '/' })
    openEssai(harness, 10)

    click(harness.root, 'Comparer')

    expect(output(harness.root)).toContain("Cette page n'est pas une page de magasin")
  })
})

describe('essai 11 : lot de recherches', () => {
  it('propose 30 ingrédients prêts à être cherchés', () => {
    const harness = mount()
    openEssai(harness, 11)

    const names = field(harness.root, 'Ingrédients à chercher').value.split('\n')

    expect(names).toHaveLength(30)
    expect(names[0]).toBe('farine')
  })

  it('cherche chaque nom avec la cadence et donne les 3 premiers libellés', async () => {
    // Given
    const harness = mount({ random: 0 })
    openEssai(harness, 11)
    type(field(harness.root, 'Ingrédients à chercher'), 'farine\n\n  lait  \nbeurre\n')

    // When
    click(harness.root, 'Lancer le lot')
    const text = await untilOutput(harness.root, 'Conclusion')

    // Then
    expect(harness.fetch).toHaveBeenCalledTimes(3)
    expect(harness.sleeps).toEqual([800, 800])
    expect(text).toContain('Lot de 3 recherche(s)')
    expect(text).toContain(
      '1. farine\n   1) Farine de blé T55 Moulin Imaginaire (1 kg)\n   2) Sucre en poudre Sucrerie Fictive (750 g)\n   3) Lait demi-écrémé Laiterie Inventée (6 x 1 L)',
    )
    expect(text).toContain('2. lait')
    expect(text).toContain('Conclusion : 3 recherche(s) faite(s) sur 3 (lot terminé).')
  })

  it('ne traite que 30 noms et le dit', async () => {
    const harness = mount()
    openEssai(harness, 11)
    type(
      field(harness.root, 'Ingrédients à chercher'),
      Array.from({ length: 33 }, (_, i) => `mot${i}`).join('\n'),
    )

    click(harness.root, 'Lancer le lot')
    const text = await untilOutput(harness.root, 'Conclusion')

    expect(harness.fetch).toHaveBeenCalledTimes(30)
    expect(text).toContain('Attention : seuls les 30 premiers noms sont traités (3 ignoré(s)).')
  })

  it('s’arrête au premier blocage', async () => {
    let calls = 0
    const harness = mount({
      route: () => (++calls === 2 ? html('', 403) : html(searchPage([FLOUR]))),
    })
    openEssai(harness, 11)
    type(field(harness.root, 'Ingrédients à chercher'), 'a\nb\nc\nd')

    click(harness.root, 'Lancer le lot')
    const text = await untilOutput(harness.root, 'Conclusion')

    expect(harness.fetch).toHaveBeenCalledTimes(2)
    expect(text).toContain('2. b\n   HTTP 403')
    expect(text).toContain(
      'Conclusion : 2 recherche(s) faite(s) sur 4 (arrêt : blocage 403 ou 429).',
    )
  })

  it('s’arrête sur une erreur réseau, et note les recherches sans produit', async () => {
    let calls = 0
    const harness = mount({
      route: () => (++calls === 1 ? html('<html></html>') : Promise.reject(new Error('coupé'))),
    })
    openEssai(harness, 11)
    type(field(harness.root, 'Ingrédients à chercher'), 'a\nb\nc')

    click(harness.root, 'Lancer le lot')
    const text = await untilOutput(harness.root, 'Conclusion')

    expect(text).toContain('1. a\n   (aucun produit reconnu)')
    expect(text).toContain('2. b\n   échec : coupé')
    expect(text).toContain('(arrêt : erreur réseau)')
  })

  it('demande au moins un nom et un magasin', () => {
    const harness = mount()
    openEssai(harness, 11)
    type(field(harness.root, 'Ingrédients à chercher'), ' \n ')

    click(harness.root, 'Lancer le lot')
    expect(output(harness.root)).toBe('Écris au moins un nom, un par ligne.')

    setPath('/')
    click(harness.root, 'Lancer le lot')
    expect(output(harness.root)).toContain("Cette page n'est pas une page de magasin")
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('s’arrête quand on touche « Arrêter »', async () => {
    const harness = mount()
    harness.env.sleep = async () => {
      click(harness.root, 'Arrêter')
    }
    openEssai(harness, 11)
    type(field(harness.root, 'Ingrédients à chercher'), 'a\nb\nc')

    click(harness.root, 'Lancer le lot')
    const text = await untilOutput(harness.root, 'Conclusion')

    expect(harness.fetch).toHaveBeenCalledTimes(1)
    expect(text).toContain('(arrêt demandé)')
  })
})

describe('garde-fous communs à tous les essais de lecture', () => {
  it('ne fait que des lectures vers l’hôte courant, sans jamais lire ni montrer un cookie', async () => {
    // Given : un cookie dont la valeur ne doit apparaître nulle part
    Object.defineProperty(document, 'cookie', {
      value: 'datadome=SECRET-DATADOME; session=SECRET-SESSION',
      configurable: true,
    })
    const harness = mount()

    // When : on joue tous les essais qui lisent
    openEssai(harness, 1)
    openEssai(harness, 2)
    click(harness.root, 'Chercher')
    expect(await untilOutput(harness.root, 'Produits reconnus')).toContain('Produits reconnus')
    openEssai(harness, 4)
    click(harness.root, 'Lancer les 5 recherches')
    expect(await untilOutput(harness.root, 'Conclusion')).toContain('Conclusion')
    openEssai(harness, 10)
    click(harness.root, 'Comparer')
    expect(await untilOutput(harness.root, 'Contenu net')).toContain('Contenu net')
    openEssai(harness, 11)
    click(harness.root, 'Lancer le lot')
    expect(await untilOutput(harness.root, 'Conclusion')).toContain('Conclusion')
    openEssai(harness, 12)

    // Then
    const calls = harness.fetch.mock.calls
    expect(calls.length).toBeGreaterThan(10)
    expect(calls.every(([url]) => url.startsWith(`${window.location.origin}/`))).toBe(true)
    expect(calls.every(([, init]) => init?.method === 'GET')).toBe(true)
    expect(textOf(harness)).not.toContain('SECRET')
    expect(harness.navigated).toEqual([])
    Object.defineProperty(document, 'cookie', { value: '', configurable: true })
  })
})
