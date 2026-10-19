// D'où viennent les libellés de rayons (DRV-647, étape 0) : la structure de la réponse de recherche (noms de clés seulement), le menu « Rayons » de
// la page (identifiant lu dans l'adresse du lien et libellé de catalogue), et leur correspondance avec les rayons des produits. Pages INVENTÉES.
import { describe, expect, it } from 'vitest'

import { probeLines, reportOf, runChecks, type ChecksDeps } from '../src/diagnostic'
import {
  aisleMenuFacts,
  aisleVocabulary,
  LeclercAdapter,
  MAX_MENU_AISLES,
  readPageLinks,
  replyShape,
  safeAisleLabel,
  type PageLink,
  type PageLinks,
} from '../src/leclerc'
import { fakeStorage, fakeWakeLock } from './flow-helpers'
import { fakeSite, fixture, PAGE, type Call, type Scripted } from './leclerc-helpers'

const NOW = Date.UTC(2026, 9, 20, 9, 30, 0)
const LOCATION = PAGE

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html')
const link = (href: string, text: string, inMenu = false): PageLink => ({ href, text, inMenu })
const page = (links: PageLink[], menu = true): PageLinks => ({ menu, links })

/** Une réponse de recherche au JSON inventé : une liste de filtres (avec libellés) puis les produits sous un objet de résultats. */
const FACETED = `<html><body><script>
window.init(function () { var etat = {
  "sNoPointLivraison": "123456",
  "lstFiltres": [ { "iIdRayon": 41, "sLibelleRayon": "Fruits et légumes" }, { "iIdRayon": 15, "sLibelleRayon": "Jus" } ],
  "objResultats": {
    "iNbResultats": 2,
    "lstProduits": [
      { "iIdProduit": 1000001, "sLibelleLigne1": "Tomates rondes", "nrPVUnitaireTTC": 1.5, "iIdRayon": 41, "iIdFamille": 410, "niIdSousFamille": 4101, "objPrix": { "nrValeur": 1.5 } },
      { "iIdProduit": 1000002, "sLibelleLigne1": "Jus de tomate", "nrPVUnitaireTTC": 2.1, "iIdRayon": 15, "iIdFamille": 520 }
    ]
  },
  "parisSecret": { "x": 1 }
}; });
</script></body></html>`

describe('replyShape : la structure de la réponse, des noms de clés seulement', () => {
  it('dit les clés du premier niveau, le chemin jusqu’aux produits et les clés d’un produit, avec son rayon et sa famille', () => {
    const shape = replyShape(FACETED)

    expect(shape).toEqual({
      top: [
        { name: 'sNoPointLivraison', kind: 'VALUE' },
        { name: 'lstFiltres', kind: 'LIST', size: 2 },
        { name: 'objResultats', kind: 'OBJECT' },
        { name: null, kind: 'OBJECT' },
      ],
      topTotal: 4,
      path: [
        { name: 'objResultats', list: false },
        { name: 'lstProduits', list: true },
      ],
      product: [
        { name: 'iIdProduit', kind: 'VALUE' },
        { name: 'sLibelleLigne1', kind: 'VALUE' },
        { name: 'nrPVUnitaireTTC', kind: 'VALUE' },
        { name: 'iIdRayon', kind: 'VALUE' },
        { name: 'iIdFamille', kind: 'VALUE' },
        { name: 'niIdSousFamille', kind: 'VALUE' },
        { name: 'objPrix', kind: 'OBJECT' },
      ],
      productTotal: 7,
      aisle: 41,
      family: 410,
    })
    // Aucune valeur : ni libellé, ni point de livraison, ni nom de clé qui n'a pas le style du site.
    const raw = JSON.stringify(shape)
    for (const secret of ['Tomates', 'Fruits', '123456', 'parisSecret', '1000001']) {
      expect(raw).not.toContain(secret)
    }
  })

  it('lit la forme du faux site : l’état `widgets`, nom hors du style du site remplacé par « ? »', () => {
    const shape = replyShape(fixture('recherche-farine.html'))

    expect(shape?.path).toEqual([
      { name: null, list: true },
      { name: 'lstProduits', list: true },
    ])
    expect(shape?.top[0]).toEqual({ name: 'sNoPointLivraison', kind: 'VALUE' })
    expect(shape?.product.map((key) => key.name)).toContain('iIdRayon')
    expect(shape).toMatchObject({ aisle: 12, family: 345 })
  })

  it('lit un état encodé en entités HTML', () => {
    const state = JSON.stringify({
      sTitre: 'x',
      lstProduits: [{ iIdProduit: 7, sLibelleLigne1: 'Pain', iIdRayon: 3, iIdFamille: 30 }],
    }).replaceAll('"', '&quot;')

    const shape = replyShape(`<div data-init="${state}"></div>`)

    expect(shape?.top).toEqual([
      { name: 'sTitre', kind: 'VALUE' },
      { name: 'lstProduits', kind: 'LIST', size: 1 },
    ])
    expect(shape).toMatchObject({ aisle: 3, family: 30 })
  })

  it('sans produit : rien', () => {
    expect(replyShape(fixture('recherche-vide.html'))).toBeNull()
    expect(replyShape('<html>pas de données</html>')).toBeNull()
  })

  it('les clés de rayon ou de filtre de la page, avec leur nombre, au style du site seulement', () => {
    expect(aisleVocabulary(FACETED)).toEqual([
      { name: 'iIdRayon', count: 4 },
      { name: 'iIdFamille', count: 2 },
      { name: 'sLibelleRayon', count: 2 },
      { name: 'lstFiltres', count: 1 },
      { name: 'niIdSousFamille', count: 1 },
    ])
    expect(aisleVocabulary('{"rayonSecret":1,"menuParis":2}')).toEqual([])
  })
})

describe('aisleMenuFacts : les liens de rayon de la page', () => {
  it('lit le numéro dans le chemin ou dans un paramètre, compte les familles, ignore les autres liens et les autres sites', () => {
    const facts = aisleMenuFacts(
      page([
        link('rayon-41-Fruits-et-legumes.aspx', ' Fruits\n et  légumes '),
        link('/magasin-000123-000123-Ville-Test/liste.aspx?idRayon=12&tri=1', 'Épicerie'),
        link('famille-410-Tomates.aspx', 'Tomates'),
        link('famille-411-Pommes.aspx', 'Pommes'),
        link('panier.aspx', 'Panier'),
        link('https://www.exemple.invalid/rayon-99-Ailleurs.aspx', 'Ailleurs'),
        link('javascript:void(0)', 'Rayon caché'),
        link('rayon-41-Fruits-et-legumes.aspx', 'Fruits et légumes'),
      ]),
      LOCATION,
    )

    expect(facts.aisles).toEqual([
      { kind: 'RAYON', id: 41, label: 'Fruits et légumes' },
      { kind: 'RAYON', id: 12, label: 'Épicerie' },
    ])
    expect(facts).toMatchObject({
      menu: true,
      links: 8,
      aisleCount: 2,
      families: 2,
      aisleIds: [41, 12],
      familyIds: [410, 411],
    })
    expect(facts.shapes).toEqual([
      '/magasin-N-N-V/rayon-N-….aspx',
      '/magasin-N-N-V/liste.aspx ?idRayon&tri',
      '/magasin-N-N-V/famille-N-….aspx',
    ])
  })

  it('un lien du bloc « Rayons » sans le mot dans l’adresse compte s’il porte un numéro', () => {
    const facts = aisleMenuFacts(
      page([
        link('fruits-legumes-41.aspx', 'Fruits et légumes', true),
        link('promotions.aspx', 'Promotions', true),
        link('fruits-legumes-41.aspx', 'Fruits et légumes', false),
      ]),
      LOCATION,
    )

    expect(facts.aisles).toEqual([{ kind: 'MENU', id: 41, label: 'Fruits et légumes' }])
    expect(facts.menuLinks).toBe(2)
  })

  it('écarte un libellé qui ressemble à une donnée : e-mail, nombre long, ville du magasin ; borne les autres', () => {
    expect(safeAisleLabel('jean.dupont@exemple.fr', null)).toBeNull()
    expect(safeAisleLabel('Rayon 123456', null)).toBeNull()
    expect(safeAisleLabel('Spécial Ville-Test', 'Ville-Test')).toBeNull()
    expect(safeAisleLabel('Spécial VILLE TEST', 'Ville-Test')).toBeNull()
    expect(safeAisleLabel('   ', null)).toBeNull()
    expect(safeAisleLabel('Lait​ frais', null)).toBe('Lait frais')
    expect(safeAisleLabel('x'.repeat(100), null)).toHaveLength(60)

    const facts = aisleMenuFacts(
      page([link('rayon-5-Ville-Test.aspx', 'Ville-Test près de chez toi')]),
      LOCATION,
    )
    expect(facts.aisles).toEqual([{ kind: 'RAYON', id: 5, label: null }])
    expect(JSON.stringify(facts)).not.toMatch(/Ville-Test|000123/)
  })

  it(`au plus ${MAX_MENU_AISLES} liens décrits, le nombre total est dit`, () => {
    const links = Array.from({ length: 55 }, (_unused, index) =>
      link(`rayon-${index + 1}-R.aspx`, `Rayon numéro ${index + 1}`),
    )

    const facts = aisleMenuFacts(page(links), LOCATION)

    expect(facts.aisles).toHaveLength(MAX_MENU_AISLES)
    expect(facts.aisleCount).toBe(55)
    expect(facts.aisleIds).toHaveLength(55)
  })

  it('les clés de rayon ou de filtre de l’état de la page', () => {
    const facts = aisleMenuFacts(
      page([], false),
      LOCATION,
      '<script>var m = {"lstRayons":[{"iIdRayon":1,"sLibelle":"A"}]}</script>',
    )

    expect(facts.vocabulary).toEqual([
      { name: 'iIdRayon', count: 1 },
      { name: 'lstRayons', count: 1 },
    ])
  })
})

describe('readPageLinks : le DOM de la page, sans clic', () => {
  const MENU = `<header><div class="menu"><button>Rayons</button><ul hidden>
    <li><a href="rayon-1-A.aspx">A</a></li><li><a href="rayon-2-B.aspx">B</a></li><li><a href="rayon-3-C.aspx">C</a></li>
    <li><a href="rayon-4-D.aspx">D</a></li><li><a href="rayon-5-E.aspx">E</a></li></ul></div>
    <a href="compte.aspx">Mon compte</a></header>`

  it('trouve le bloc du menu « Rayons » replié et y range ses liens', () => {
    const read = readPageLinks(parse(`<body>${MENU}</body>`))

    expect(read.menu).toBe(true)
    expect(read.links).toHaveLength(6)
    expect(read.links.filter((one) => one.inMenu).map((one) => one.text)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
    expect(read.links.at(-1)).toEqual({ href: 'compte.aspx', text: 'Mon compte', inMenu: false })
  })

  it('un titre « Nos rayons » sans liens autour : le titre est vu, aucun lien n’est dans le menu', () => {
    const read = readPageLinks(parse('<body><span>Nos rayons</span><a href="x.aspx">X</a></body>'))

    expect(read).toEqual({ menu: true, links: [{ href: 'x.aspx', text: 'X', inMenu: false }] })
  })

  it('sans titre : pas de menu', () => {
    expect(readPageLinks(parse('<body><a href="x.aspx">X</a></body>')).menu).toBe(false)
  })
})

// —— Le diagnostic ———————————————————————————————————————————————————————————————————————————————————————————————————————————————

const GOOD: Scripted = { body: fixture('recherche-farine.html') }
const EMPTY: Scripted = { body: fixture('recherche-vide.html') }
const normal = (call: Call): Scripted => (call.url.endsWith('TexteRecherche=zzqxkw') ? EMPTY : GOOD)

const STORE_PAGE = `<body><nav><button>Rayons</button><ul hidden>
  <li><a href="rayon-12-Epicerie-salee.aspx">Épicerie salée</a></li>
  <li><a href="rayon-41-Fruits-et-legumes.aspx">Fruits et légumes</a></li>
  <li><a href="famille-345-Farines.aspx">Farines</a></li>
  <li><a href="rayon-60-Bebe.aspx">Bébé</a></li>
  <li><a href="rayon-70-Ville-Test.aspx">Ville-Test et alentours</a></li>
</ul></nav></body>`

function diagnose(storePage = STORE_PAGE, reply: (call: Call) => Scripted = normal) {
  const fake = fakeSite(reply, { pageLinks: () => readPageLinks(parse(storePage)) })
  const adapter = new LeclercAdapter(fake.deps)
  const deps: ChecksDeps = {
    adapter,
    agentVersion: '0.32.0',
    storage: fakeStorage(),
    wakeLock: fakeWakeLock().wakeLock,
    originReplaced: null,
  }
  return { fake, adapter, run: () => runChecks(deps, () => undefined) }
}

describe('le diagnostic dit d’où viennent les libellés de rayons (DRV-647)', () => {
  it('sans aucune requête de plus : les mêmes cinq recherches', async () => {
    const { fake, run } = diagnose()

    await run()

    expect(fake.calls).toHaveLength(5)
  })

  it('le menu de la page : les comptes, les formes d’adresse, une ligne par lien de rayon avec son numéro et son libellé', async () => {
    const { run } = diagnose()

    const { probes } = await run()
    const lines = probeLines(probes).map((line) => line.replace(/^ - /, ''))

    expect(lines).toContain(
      'Menu des rayons de la page : titre « Rayons » présent ; liens de la page : 5, dans le bloc du menu : 5 ; liens de rayon : 4 ; liens de famille : 1',
    )
    expect(lines).toContain(
      'Adresses des liens de rayon et de famille (motifs) : /magasin-N-N-V/rayon-N-….aspx ; /magasin-N-N-V/famille-N-….aspx',
    )
    expect(lines).toContain('Lien de rayon 12 : « Épicerie salée »')
    expect(lines).toContain('Lien de rayon 41 : « Fruits et légumes »')
    expect(lines).toContain('Lien de rayon 70 : (libellé écarté)')
    expect(lines).toContain('Clés de rayon ou de filtre dans l’état de la page : aucune')
    // Le test automatique, au rapport borné, ne le reprend pas : il est au diagnostic.
    const selftest = probeLines(probes, { aisleSource: false }).join('\n')
    expect(selftest).toContain('Rayons vus pour « tomate »')
    expect(selftest).not.toMatch(/Menu des rayons|Lien de rayon|Réponse « tomate »/)
  })

  it('la structure de la réponse « tomate » : chemin des produits, clés du premier niveau et d’un produit (rayon et famille avec leur valeur)', async () => {
    const { run } = diagnose()

    const { probes } = await run()
    const text = probeLines(probes).join('\n')

    expect(text).toContain(
      'Réponse « tomate », chemin des produits depuis le premier niveau : ?[] > lstProduits[]',
    )
    expect(text).toMatch(
      /Réponse « tomate », clés du premier niveau \(\d+, noms seulement\) : sNoPointLivraison, /,
    )
    expect(text).toMatch(
      /Réponse « tomate », clés d’un produit \(13, noms seulement sauf rayon et famille\) : iIdProduit, sLibelleLigne1, .*iIdRayon = 12, iIdFamille = 345/,
    )
    expect(text).toContain('Réponse « tomate », clés de rayon ou de filtre : iIdFamille (')
  })

  it('la correspondance : combien des rayons et familles de « tomate » ont un lien dans le menu, et la ligne de contrôle le dit', async () => {
    const { run } = diagnose()

    const { probes, results } = await run()
    const text = probeLines(probes).join('\n')

    expect(text).toContain('Rayons de « tomate » avec un lien dans le menu : 1 sur 1')
    expect(text).toContain('Familles de « tomate » avec un lien dans le menu : 1 sur 1')
    expect(results.find((result) => result.id === 'shelves')?.detail).toMatch(
      / ; liens du menu : 1\/1$/,
    )
  })

  it('un rayon des produits sans lien est nommé par son numéro ; une page sans lien de rayon le dit', async () => {
    const without12 = STORE_PAGE.replace('rayon-12-', 'rayon-13-')
    const { run } = diagnose(without12)

    const text = probeLines((await run()).probes).join('\n')

    expect(text).toContain(
      'Rayons de « tomate » avec un lien dans le menu : 0 sur 1 (sans lien : 12)',
    )

    const bare = diagnose('<body><a href="panier.aspx">Panier</a></body>')
    const bareText = probeLines((await bare.run()).probes).join('\n')
    expect(bareText).toContain(
      'Menu des rayons de la page : titre « Rayons » absent ; liens de la page : 1, dans le bloc du menu : 0 ; liens de rayon : 0 ; liens de famille : 0',
    )
    expect(bareText).toContain(
      'Rayons de « tomate » avec un lien dans le menu : aucun lien numéroté dans la page',
    )
  })

  it('les recherches d’essai sautées : la structure vient de la réponse « sel »', async () => {
    const { run } = diagnose(STORE_PAGE, (call) =>
      call.url.endsWith('TexteRecherche=sel') ? GOOD : { status: 403 },
    )

    const text = probeLines((await run()).probes).join('\n')

    expect(text).toContain('Réponse « sel », chemin des produits depuis le premier niveau')
  })

  it('un DOM qui ne se lit pas n’arrête rien', async () => {
    const fake = fakeSite(normal, {
      pageLinks: () => {
        throw new Error('DOM inaccessible')
      },
    })
    const adapter = new LeclercAdapter(fake.deps)

    expect(adapter.readAisleMenu()).toMatchObject({ menu: false, links: 0, aisles: [] })
    expect(adapter.describeLastReply()).toBeNull()
    await adapter.searchProducts('farine')
    expect(adapter.describeLastReply()?.shape?.aisle).toBe(12)
  })

  it('aucune valeur personnelle : ni ville, ni e-mail, ni numéro de magasin, ni libellé de produit', async () => {
    const hostile = `<body><nav><span>Rayons</span><ul>
      <li><a href="/magasin-000123-000123-Ville-Test/rayon-1-Ville-Test.aspx">Bonjour jean.dupont@exemple.fr</a></li>
      <li><a href="rayon-2-x.aspx?noPL=987654&amp;idRayon=2">Tél 0612345678</a></li>
      <li><a href="rayon-3-x.aspx">Ville-Test</a></li>
      <li><a href="compte.aspx">Jean Dupont</a></li>
      <li><a href="commande-555444.aspx">Ma commande</a></li>
    </ul></nav></body>`
    const { run } = diagnose(hostile)

    const { results, page: facts, probes } = await run()
    const report = reportOf('0.32.0', NOW, facts, results, probes)

    for (const secret of [
      'Ville-Test',
      'jean.dupont',
      'Jean Dupont',
      '0612345678',
      '987654',
      '555444',
      '000123',
      'Farine de blé',
    ]) {
      expect(report).not.toContain(secret)
      expect(JSON.stringify(probes)).not.toContain(secret)
    }
    expect(report).toContain('Lien de rayon 1 : (libellé écarté)')
    expect(report).toContain('?noPL&idRayon')
  })
})
