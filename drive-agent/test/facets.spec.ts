// La facette « Rayons » et la forme du filtre du site (DRV-647, agent 0.35.0, diagnostic seulement) : lecture de l'arbre des valeurs, valeur « fruits /
// légumes », forme du paramètre `Filtres`, adresse d'une recherche filtrée déduite SANS deviner, une seule requête de sondage, pagination et univers, rien
// de personnel. Données INVENTÉES, de la forme relevée sur le vrai site le 2026-10-20.
import { describe, expect, it } from 'vitest'

import { probeLines, runChecks, type ChecksDeps } from '../src/diagnostic'
import {
  aisleBloc,
  countKeys,
  filteredSearchPath,
  filterHrefsIn,
  filterLinks,
  filterLinkShapes,
  filterTemplate,
  freshValues,
  LeclercAdapter,
  readFacets,
  universes,
  valueShape,
} from '../src/leclerc'
import { fakeStorage, fakeWakeLock } from './flow-helpers'
import { fakeSite, PAGE, type Call, type Scripted } from './leclerc-helpers'

const CITY = 'Ville-Test'
const HOST = PAGE.hostname
const STORE = '/magasin-000123-000123'

const bloc = (id: number, label: string) =>
  `"objFiltreBloc":{"iIdBloc":${id},"neTypeBloc":1,"sLibelle":"${label}","fMultiSelection":true,"niNbAffichage":10,"iNbValeursMinimum":1}`
const value = (
  id: number,
  label: string,
  refs: number,
  children = '',
  withBloc = true,
  blocId = 4,
  blocLabel = 'Rayons',
) =>
  `{${withBloc ? `${bloc(blocId, blocLabel)},` : ''}"iIdBloc":${blocId},"iIdValeur":${id},"sIdValeurUrl":"${blocId}-${id}","sLibelle":"${label}","niNbReferences":${refs},"lstEnfants":[${children}],"fEstEnPromotion":false}`
const product = (id: number, label: string, aisle: number, family: number) =>
  `{"objElement":{"iIdProduit":${id},"sLibelleLigne1":"${label}","nrPVUnitaireTTC":1.5,"iQteDisponible":3,"iIdRayon":${aisle},"iIdFamille":${family},"eUnivers":1}}`

const FACETS = [
  value(
    543815,
    'Viandes Poissons',
    12,
    `${value(543814, 'Boucherie', 8, '', false)},${value(544317, 'Veau', 4, '', false)}`,
  ),
  value(543900, 'Fruits et légumes', 5, value(284351, 'Légumes fruits', 5, '', false)),
  value(543901, 'Épicerie salée', 30),
  value(7001, 'Marque inventée', 9, '', true, 2, 'Marques'),
].join(',')

/** Une réponse de recherche inventée : deux produits, la facette, la pagination ; et, si [links], les liens de la facette dans la page de résultats. */
const reply = (
  links = true,
  products = [
    product(1, 'Sauce tomate inventée', 284319, 288378),
    product(2, 'Tomates cerises inventées', 284323, 284351),
  ],
) =>
  `<html><body>${
    links
      ? `<nav><a href="recherche.aspx?TexteRecherche=tomate&amp;Filtres=4-543900">Fruits et légumes</a> <a href="${STORE}-${CITY}/recherche.aspx?TexteRecherche=tomate&amp;Filtres=4-543815">Viandes</a></nav>`
      : ''
  }<script>var etat = {"sNoPointLivraison":"123456","objContenu":{"lstElements":[${products.join(',')}]},"lstFiltres":[${FACETS}],"iNbResultats":180,"iNbPages":8,"fPageSuivante":true,"rTotalAPayerPanier":12.5,"iNbArticlesPanier":3}</script></body></html>`

describe('readFacets : les blocs de filtre et l’arbre de leurs valeurs', () => {
  it('lit les blocs, les valeurs de premier niveau et leurs enfants', () => {
    const tree = readFacets(reply())

    expect(tree.blocs).toEqual([
      { id: 4, label: 'Rayons', values: 3 },
      { id: 2, label: 'Marques', values: 1 },
    ])
    const rayons = aisleBloc(tree)
    expect(
      rayons?.values.map((one) => [one.id, one.label, one.references, one.children.length]),
    ).toEqual([
      [543815, 'Viandes Poissons', 12, 2],
      [543900, 'Fruits et légumes', 5, 1],
      [543901, 'Épicerie salée', 30, 0],
    ])
    expect(rayons?.values[0]?.children.map((child) => child.label)).toEqual(['Boucherie', 'Veau'])
    expect(rayons?.values[0]?.urlId).toBe('4-543815')
  })

  it('trouve la valeur « fruits / légumes », premier niveau d’abord', () => {
    const rayons = aisleBloc(readFacets(reply()))

    expect(
      freshValues(rayons?.values ?? []).map(({ value: one, depth }) => [one.label, depth]),
    ).toEqual([
      ['Fruits et légumes', 0],
      ['Légumes fruits', 1],
    ])
  })

  it('sans facette : aucun bloc', () => {
    expect(readFacets('<html>rien</html>')).toEqual({ blocs: [], values: [] })
    expect(aisleBloc(readFacets('<html>rien</html>'))).toBeNull()
  })
})

describe('la forme du paramètre « Filtres » et l’adresse d’une recherche filtrée', () => {
  const values = aisleBloc(readFacets(reply()))?.values ?? []
  const links = filterLinks(filterHrefsIn(reply()), HOST, `${STORE}-${CITY}/`)

  it('lit les liens à « Filtres » d’une réponse et dit leur forme, sans ville ni numéro', () => {
    expect(links).toHaveLength(2)
    expect(filterLinkShapes(links, CITY)).toEqual([
      { shape: '/magasin-N-N-V/recherche.aspx ?TexteRecherche&Filtres ; Filtres=N-N', count: 2 },
    ])
    expect(valueShape('4-543815', CITY)).toBe('N-N')
    expect(valueShape('', CITY)).toBe('(vide)')
    expect(valueShape('a@b', CITY)).toBe('(écartée)')
  })

  it('déduit l’adresse d’un lien de recherche filtrée de ce magasin, le jeton étant un sIdValeurUrl de la facette', () => {
    const template = filterTemplate(links, values, STORE)

    expect(template).toMatchObject({ token: '4-543900', kind: 'URL_ID' })
    const target = values[2]
    if (target === undefined || 'miss' in template) throw new Error('modèle attendu')
    expect(filteredSearchPath(template, target, 'tomate')).toBe(
      `${STORE}-${CITY}/recherche.aspx?TexteRecherche=tomate&Filtres=4-543901`,
    )
  })

  it.each([
    ['sans lien', [], 'NO_FILTER_LINK'],
    [
      'un lien qui n’est pas une recherche',
      [`${STORE}-${CITY}/rayon-288378-Sauces.aspx?Filtres=`],
      'NO_SEARCH_LINK',
    ],
    [
      'une recherche d’un autre magasin',
      ['/magasin-999-999-Ailleurs/recherche.aspx?TexteRecherche=x&Filtres=4-543900'],
      'OTHER_STORE',
    ],
    [
      'une valeur vide',
      [`${STORE}-${CITY}/recherche.aspx?TexteRecherche=x&Filtres=`],
      'EMPTY_FILTER',
    ],
    [
      'une valeur inconnue',
      [`${STORE}-${CITY}/recherche.aspx?TexteRecherche=x&Filtres=9-1`],
      'NO_KNOWN_VALUE',
    ],
  ])('ne devine jamais : %s', (_name, hrefs, miss) => {
    expect(filterTemplate(filterLinks(hrefs, HOST, `${STORE}-${CITY}/`), values, STORE)).toEqual({
      miss,
    })
  })
})

describe('la pagination et les univers : des nombres et des oui/non, jamais un montant du panier', () => {
  it('rapporte les clés de page, de total et de nombre, sans le panier', () => {
    const keys = countKeys(reply())

    expect(keys.map((key) => key.name)).toEqual(
      expect.arrayContaining(['iNbResultats', 'iNbPages', 'fPageSuivante', 'niNbReferences']),
    )
    expect(keys.find((key) => key.name === 'iNbResultats')).toEqual({
      name: 'iNbResultats',
      values: [180],
      count: 1,
    })
    expect(keys.find((key) => key.name === 'fPageSuivante')?.values).toEqual([true])
    expect(keys.some((key) => /Panier/.test(key.name))).toBe(false)
    expect(universes(reply())).toEqual([{ value: 1, count: 2 }])
  })
})

describe('le diagnostic dit la facette « Rayons », la forme du filtre et sonde UNE recherche filtrée (DRV-647, 0.35.0)', () => {
  const FILTERED = reply(false, [product(9, 'Tomates grappe fraîches inventées', 284323, 284351)])

  async function report(
    withLinks: boolean,
    filtered: (call: Call) => Scripted = () => ({ body: FILTERED }),
    unfiltered = reply(withLinks),
  ) {
    const answer = (call: Call): Scripted =>
      call.url.includes('Filtres=') ? filtered(call) : { body: unfiltered }
    const fake = fakeSite(answer)
    const deps: ChecksDeps = {
      adapter: new LeclercAdapter(fake.deps),
      agentVersion: '0.35.0',
      storage: fakeStorage(),
      wakeLock: fakeWakeLock().wakeLock,
      originReplaced: null,
    }
    const { probes } = await runChecks(deps, () => undefined)
    return { text: probeLines(probes).join('\n'), calls: fake.calls }
  }

  it('les blocs, les rayons du filtre, la valeur fraîche, la correspondance des produits, la forme des liens', async () => {
    const { text } = await report(true)

    expect(text).toContain(
      'Bloc de filtre 4 « Rayons » de la réponse « tomate » : 3 valeurs de premier niveau',
    )
    expect(text).toContain(
      'Bloc de filtre 2 « Marques » de la réponse « tomate » : 1 valeur de premier niveau',
    )
    expect(text).toContain(
      'Rayon du filtre « Viandes Poissons » : iIdValeur=543815, niNbReferences=12, 2 enfants ; sIdValeurUrl (forme)=« N-N », contient iIdValeur : oui ; enfants : « Boucherie », « Veau »',
    )
    expect(text).toContain(
      'Valeur « fruits / légumes / marché frais » de la facette : « Fruits et légumes » (iIdValeur=543900, niNbReferences=5, premier niveau) ; « Légumes fruits » (iIdValeur=284351, niNbReferences=5, enfant)',
    )
    expect(text).toContain(
      'Correspondance avec la facette d’un produit de « tomate » : iIdRayon=284323 → aucune correspondance ; iIdFamille=284351 → correspond à la valeur 284351 « Légumes fruits » (enfant)',
    )
    expect(text).toContain('Liens à « Filtres » (réponse « tomate ») : 2')
    expect(text).toContain(
      'Forme d’un lien à « Filtres » (réponse « tomate », ×2) : /magasin-N-N-V/recherche.aspx ?TexteRecherche&Filtres ; Filtres=N-N',
    )
    expect(text).toContain('Liens à « Filtres » (page) : 0')
  })

  it('une seule recherche filtrée (0.36.0), sur la valeur « fruits / légumes », par son sIdValeurUrl, au chemin du magasin sans ville, après celle de « tomate »', async () => {
    const { text, calls } = await report(true)

    const urls = calls.map((call) => call.url)
    expect(urls).toHaveLength(6)
    expect(urls[3]).toBe(`${STORE}/recherche.aspx?TexteRecherche=tomate&Filtres=4-543900`)
    expect(urls.filter((url) => url.includes('Filtres='))).toHaveLength(1)
    expect(calls[3]?.init.method).toBe('GET')
    expect(text).toContain(
      'Recherche « tomate » filtrée sur « Fruits et légumes » (iIdValeur=543900), Filtres=<sIdValeurUrl> (forme N-N) : HTTP 200, iNbTotalProduits=?, 1 produits lus, groupes au niveau rayon ; premier produit : « Tomates grappe fraîches inventées » (frais : oui) ; verdict : filtrée (moins de produits, pas les mêmes)',
    )
    expect(text).toContain('Groupe de la recherche filtrée 284323 (1 produit) : (sans libellé)')
    expect(text).toContain(
      'Forme finale de l’adresse filtrée : /magasin-N-N/recherche.aspx ?TexteRecherche&Filtres ; Filtres=N-N',
    )
  })

  it('une première forme qui ne filtre pas (les mêmes produits) : UNE seconde avec iIdBloc-iIdValeur, puis rien de plus', async () => {
    const odd = reply(true).replace('"sIdValeurUrl":"4-543900"', '"sIdValeurUrl":"9-543900"')
    const { text, calls } = await report(
      true,
      (call) => ({ body: call.url.endsWith('Filtres=9-543900') ? odd : FILTERED }),
      odd,
    )

    const filtered = calls.map((call) => call.url).filter((url) => url.includes('Filtres='))
    expect(filtered).toEqual([
      `${STORE}/recherche.aspx?TexteRecherche=tomate&Filtres=9-543900`,
      `${STORE}/recherche.aspx?TexteRecherche=tomate&Filtres=4-543900`,
    ])
    expect(text).toContain(
      'Filtres=<sIdValeurUrl> (forme N-N) : HTTP 200, iNbTotalProduits=?, 2 produits lus',
    )
    expect(text).toContain('verdict : les mêmes produits que sans filtre')
    expect(text).toContain('Filtres=<iIdBloc-iIdValeur> (forme N-N) : HTTP 200')
    expect(text).toContain('verdict : filtrée (moins de produits, pas les mêmes)')
  })

  it('une réponse HTTP 404 puis une seconde forme identique : une seule tentative, et le verdict', async () => {
    const { text, calls } = await report(true, () => ({
      status: 404,
      body: '<html>introuvable</html>',
    }))

    expect(calls.filter((call) => call.url.includes('Filtres='))).toHaveLength(1)
    expect(text).toContain('verdict : réponse HTTP autre que 200')
  })

  it('un sIdValeurUrl qui n’a pas la forme N-N : aucune requête filtrée, et le rapport dit pourquoi', async () => {
    const odd = reply(true).replace('"sIdValeurUrl":"4-543900"', '"sIdValeurUrl":"fruits"')
    const { text, calls } = await report(true, () => ({ body: FILTERED }), odd)

    expect(calls).toHaveLength(5)
    expect(text).toContain(
      'Recherche « tomate » filtrée : non faite (le sIdValeurUrl de la valeur n’a pas la forme N-N)',
    )
  })

  it('la pagination, les univers, et rien de personnel', async () => {
    const { text } = await report(true)

    expect(text).toMatch(
      /Clés de pagination \(réponse « tomate », nombres et oui\/non seulement\) : .*iNbResultats=180 \(×1\)/,
    )
    expect(text).toContain('fPageSuivante=true (×1)')
    expect(text).toContain('eUnivers (réponse « tomate ») : 1 ×2')
    for (const secret of ['000123', CITY, '123456', '12.5']) expect(text).not.toContain(secret)
    // Les clés du panier ne sont jamais des clés de pagination : leur nom peut paraître ailleurs (comme tout nom de clé), jamais leur valeur.
    expect(text).not.toMatch(/Panier=/)
  })
})
