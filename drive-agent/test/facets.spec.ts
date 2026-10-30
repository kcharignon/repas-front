// @vitest-environment node
// La facette « Rayons » et la forme du filtre du site (DRV-647, agent 0.35.0, diagnostic seulement) : lecture de l'arbre des valeurs, valeur « fruits /
// légumes », forme du paramètre `Filtres`, adresse d'une recherche filtrée déduite SANS deviner, une seule requête de sondage, pagination et univers, rien
// de personnel. Données INVENTÉES, de la forme relevée sur le vrai site le 2026-10-20.
import { LECLERC } from './retailer-fixtures'
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

describe('le diagnostic essaie jusqu’à trois formes de « Filtres » et retient la première COHÉRENTE (DRV-647, 0.37.0)', () => {
  /** La réponse sans filtre : celle de `reply`, avec un total annoncé de 177 produits. */
  const UNFILTERED = reply(true).replace(
    '"iNbResultats":180',
    '"iNbResultats":180,"iNbTotalProduits":177',
  )
  /** Une réponse filtrée : [total] annoncé, des produits dont la famille est nommée (ou non) par `sUrlVoirRayon`. */
  const filteredReply = (total: number, families: readonly (readonly [number, string | null])[]) =>
    `<html><body><script>var etat = {"objContenu":{"lstElements":[${families
      .map(
        ([family, name], index) =>
          `{"objElement":{"iIdProduit":${9000 + index},"sLibelleLigne1":"Article inventé ${index}","nrPVUnitaireTTC":2,"iQteDisponible":3,"iIdRayon":284323,"iIdFamille":${family}${
            name === null
              ? ''
              : `,"sUrlVoirRayon":"${STORE}-${CITY}/rayon-${family}-${name}.aspx?Filtres="`
          }}}`,
      )
      .join(',')}]},"iNbTotalProduits":${total}}</script></body></html>`
  /** Une réponse filtrée INCOHÉRENTE, comme celle du vrai site le 2026-10-20 : moins de produits, le même total, des groupes sans rapport. */
  const INCOHERENT = filteredReply(177, [
    [301, 'Sodas-et-Boissons-aux-fruits'],
    [302, 'Laits-et-Oeufs'],
    [303, 'Les-chats'],
  ])

  async function report(filtered: (call: Call) => Scripted, unfiltered = UNFILTERED) {
    const answer = (call: Call): Scripted =>
      call.url.includes('Filtres=') ? filtered(call) : { body: unfiltered }
    const fake = fakeSite(answer)
    const deps: ChecksDeps = {
      adapter: new LeclercAdapter(fake.deps),
      agentVersion: '0.37.0',
      storage: fakeStorage(),
      wakeLock: fakeWakeLock().wakeLock,
      originReplaced: null,
      retailer: LECLERC,
    }
    const { probes } = await runChecks(deps, () => undefined)
    return {
      text: probeLines(probes).join('\n'),
      filters: fake.calls.map((call) => call.url).filter((url) => url.includes('Filtres=')),
      calls: fake.calls,
    }
  }

  it('les blocs, les rayons du filtre, la valeur fraîche, la correspondance des produits, la forme des liens (0.35.0)', async () => {
    const { text } = await report(() => ({ body: INCOHERENT }))

    expect(text).toContain(
      'Bloc de filtre 4 « Rayons » de la réponse « tomate » : 3 valeurs de premier niveau',
    )
    expect(text).toContain(
      'Rayon du filtre « Viandes Poissons » : iIdValeur=543815, niNbReferences=12, 2 enfants ; sIdValeurUrl (forme)=« N-N », contient iIdValeur : oui ; enfants : « Boucherie », « Veau »',
    )
    expect(text).toContain(
      'Correspondance avec la facette d’un produit de « tomate » : iIdRayon=284323 → aucune correspondance ; iIdFamille=284351 → correspond à la valeur 284351 « Légumes fruits » (enfant)',
    )
    expect(text).toContain('Liens à « Filtres » (réponse « tomate ») : 2')
  })

  it('une réponse incohérente (moins de produits, même total, autres groupes) est REFUSÉE ; aucune forme valide : trois formes au plus, puis « aucune »', async () => {
    const { text, filters } = await report(() => ({ body: INCOHERENT }))

    // (i) sIdValeurUrl « 4-543815 » ; (ii) iIdBloc-iIdValeur est la même : sautée ; (iii) iIdValeur-iIdBloc.
    expect(filters).toEqual([
      `${STORE}/recherche.aspx?TexteRecherche=tomate&Filtres=4-543815`,
      `${STORE}/recherche.aspx?TexteRecherche=tomate&Filtres=543815-4`,
    ])
    expect(text).toContain(
      'Forme essayée (i) Filtres=<sIdValeurUrl> (forme N-N) sur « Viandes Poissons » : HTTP 200, iNbTotalProduits 177 → 177 (niNbReferences 12), 3 produits, part dans les enfants attendus : 0 % ; verdict : invalide (le total ne correspond pas et les groupes ne sont pas ceux des enfants)',
    )
    expect(text).toContain('Groupe de la forme essayée : « Sodas et Boissons aux fruits » (1)')
    expect(text).toContain('Forme essayée (iii) Filtres=<iIdValeur-iIdBloc> (forme N-N)')
    expect(text).toContain('Forme retenue : aucune (la rangée de l’écran reste celle des familles)')
    expect(text).toContain(
      'Aucune forme valide : voir plus haut les formes des liens à « Filtres »',
    )
  })

  it('le total qui change et s’approche de niNbReferences : la forme est valide, et l’essai s’arrête là', async () => {
    const { text, filters } = await report(() => ({ body: filteredReply(12, [[543814, null]]) }))

    // La forme (i) valide ; puis la valeur « fruits / légumes » sondée avec elle (0.38.0).
    expect(filters.map((url) => url.split('Filtres=')[1])).toEqual(['4-543815', '4-543900'])
    expect(text).toContain(
      'HTTP 200, iNbTotalProduits 177 → 12 (niNbReferences 12), 1 produits, part dans les enfants attendus : 0 % ; verdict : valide (le total change et s’approche du nombre de références)',
    )
    expect(text).toContain('Forme retenue : (i) Filtres=<sIdValeurUrl>')
  })

  it('au moins 80 % des produits dans les enfants attendus (sans accents ni casse) : valide, même si le total ne change pas', async () => {
    const { text } = await report(() => ({
      body: filteredReply(177, [
        [543814, 'BOUCHERIE'],
        [544317, 'Veau'],
        [544317, 'Veau'],
        [543814, 'Boucherie'],
        [999, 'Autre'],
      ]),
    }))

    expect(text).toContain(
      'part dans les enfants attendus : 80 % ; verdict : valide (au moins 80 % des produits sont dans les enfants attendus)',
    )
  })

  it('seule la forme (ii) iIdBloc-iIdValeur filtre : elle est retenue après l’échec de (i)', async () => {
    const odd = UNFILTERED.replace('"sIdValeurUrl":"4-543815"', '"sIdValeurUrl":"9-543815"')
    const { text, filters } = await report(
      (call) => ({
        body: call.url.endsWith('Filtres=4-543815')
          ? filteredReply(11, [[543814, 'Boucherie']])
          : INCOHERENT,
      }),
      odd,
    )

    expect(filters.map((url) => url.split('Filtres=')[1])).toEqual(['9-543815', '4-543815'])
    expect(text).toContain('Forme retenue : (ii) Filtres=<iIdBloc-iIdValeur>')
  })

  it('des réponses HTTP 404 : chaque forme est essayée, trois requêtes au plus, aucune retenue', async () => {
    const odd = UNFILTERED.replace('"sIdValeurUrl":"4-543815"', '"sIdValeurUrl":"9-543815"')
    const { text, filters } = await report(
      () => ({ status: 404, body: '<html>introuvable</html>' }),
      odd,
    )

    expect(filters).toHaveLength(3)
    expect(text).toContain('verdict : invalide (réponse HTTP autre que 200)')
    expect(text).toContain('Forme retenue : aucune')
  })

  it('la pagination, les univers, et rien de personnel', async () => {
    const { text } = await report(() => ({ body: INCOHERENT }))

    expect(text).toContain('fPageSuivante=true (×1)')
    for (const secret of ['000123', CITY, '123456', '12.5']) expect(text).not.toContain(secret)
    expect(text).not.toMatch(/Panier=/)
  })
})
