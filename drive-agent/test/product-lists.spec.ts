// Les listes de produits de la réponse de recherche (DRV-647, 0.38.0) : relevé réel du 2026-10-20, la réponse « tomate » a d'autres listes que
// `objContenu` (`objContenuMDD`, `objContenuGroupeVariantes`, `lstTrade`) et aucun produit frais n'était lu. L'agent lit TOUS les produits de la réponse
// (la liste principale d'abord), y compris un produit qui en contient d'autres ou un objet très grand, et le diagnostic dit ce que chaque liste contient.
// Données INVENTÉES.
import { describe, expect, it } from 'vitest'

import { probeLines, runChecks, type ChecksDeps } from '../src/diagnostic'
import { LeclercAdapter } from '../src/leclerc'
import { directLevel, extractProducts } from '../src/leclerc/embedded'
import { chipCoherent, productLists } from '../src/leclerc/facets'
import { fakeStorage, fakeWakeLock } from './flow-helpers'
import { fakeSite } from './leclerc-helpers'

const STORE = '/magasin-000123-000123'
const CITY = 'Ville-Test'
/** Les noms de famille dans `sUrlVoirRayon` ; les autres s'appellent « Famille N ». */
const NAMES: Record<number, string> = { 414: 'Legumes' }

const product = (id: number, label: string, aisle: number, family: number, extra = '') =>
  `{"iIdProduit":${id},"sLibelleLigne1":"${label}","sLibelleLigne2":"1 kg","nrPVUnitaireTTC":1.5,"iQteDisponible":3,"iIdRayon":${aisle},"iIdFamille":${family},"sUrlVoirRayon":"${STORE}-${CITY}/rayon-${family}-${NAMES[family] ?? `Famille-${family}`}.aspx?Filtres="${extra}}`
const element = (body: string) => `{"objElement":${body}}`

/** Une réponse inventée : la liste MDD AVANT la liste principale dans le texte, un groupe de variantes, des encarts sans produit. */
const REPLY = `<html><body><script>var etat = {
  "objContenuMDD":{"iNbElements":2,"lstElements":[${element(product(3, 'Tomates rondes MDD inventées', 41, 414))},${element(product(4, 'Courgettes MDD inventées', 41, 414))}]},
  "objContenu":{"lstElements":[${element(product(1, 'Sauce tomate inventée', 12, 120))},${element(product(2, 'Jus de tomate inventé', 15, 150))}]},
  "objContenuGroupeVariantes":{"lstGroupes":[${product(5, 'Tomates cerises inventées (groupe)', 41, 410, `,"lstVariantes":[${product(6, 'Tomates cerises 250 g inventées', 41, 410)}]`)}]},
  "lstTrade":[{"sTitre":"x"},{"sTitre":"y"}],
  "iNbTotalProduits":6
}</script></body></html>`

describe('la lecture des produits de toutes les listes de la réponse', () => {
  it('lit la liste principale d’abord, puis les autres (marque de distributeur, variantes), sans doublon', () => {
    const labels = extractProducts(REPLY).products.map((raw) => raw.label1)

    expect(labels).toEqual([
      'Sauce tomate inventée',
      'Jus de tomate inventé',
      'Tomates rondes MDD inventées',
      'Courgettes MDD inventées',
      'Tomates cerises inventées (groupe)',
      'Tomates cerises 250 g inventées',
    ])
  })

  it('un produit qui en contient d’autres (variantes) : ses champs directs seulement', () => {
    const [group] = extractProducts(REPLY).products.filter((raw) => raw.id === '5')

    expect(group).toMatchObject({
      label1: 'Tomates cerises inventées (groupe)',
      aisle: 41,
      family: 410,
    })
    expect(directLevel('{"a":1,"b":{"c":2},"d":[3,{"e":4}],"f":"x{y}"}')).toBe(
      '{"a":1,"b":{},"d":[],"f":"x{y}"}',
    )
  })

  it('un objet de produit plus grand que 6 000 caractères est lu', () => {
    const big = `<script>var e = {"objContenu":{"lstElements":[${element(
      product(7, 'Grand produit inventé', 41, 414, `,"sDescription":"${'x'.repeat(9000)}"`),
    )}]}}</script>`

    expect(extractProducts(big).products.map((raw) => raw.label1)).toEqual([
      'Grand produit inventé',
    ])
  })
})

describe('productLists : ce que chaque liste contient (diagnostic)', () => {
  it('dit chaque liste : clés, produits vus et lus, rayons, familles nommées, libellés, légumes ou fruits ; et la somme face au total', () => {
    const report = productLists(REPLY, CITY, (label) => label)

    expect(report.total).toBe(6)
    expect(report.sum).toBe(6)
    expect(
      report.lists.map((list) => [list.name, list.occurrences, list.products, list.fresh]),
    ).toEqual([
      ['objContenuMDD', 2, 2, true],
      ['objContenu', 2, 2, false],
      ['objContenuGroupeVariantes', 2, 2, false],
      ['lstTrade', 0, 0, false],
    ])
    const mdd = report.lists[0]
    expect(mdd?.keys.map((key) => key.name)).toEqual(['iNbElements', 'lstElements'])
    expect(mdd?.aisles).toEqual([{ id: 41, count: 2 }])
    expect(mdd?.families).toEqual([{ id: 414, label: 'Legumes', count: 2 }])
    expect(mdd?.labels).toEqual([
      'Tomates rondes MDD inventées 1 kg',
      'Courgettes MDD inventées 1 kg',
    ])
    expect(report.lists[3]).toMatchObject({ kind: 'LIST', size: 2 })
  })
})

describe('chipCoherent : le résultat d’un rayon touché est-il celui de CE rayon', () => {
  it.each([
    [
      'la moitié des produits dans ses enfants',
      11,
      19,
      ['Légumes', 'Jus de fruits et légumes frais'],
      ['LEGUMES', 'Sodas', 'Legumes', 'Laits'],
      true,
    ],
    ['un nombre proche de ses références', 18, 19, [], [], true],
    [
      'le sirop et le lait (relevé réel)',
      11,
      19,
      ['Légumes', 'Jus de fruits et légumes frais'],
      ['Sodas', 'Laits', 'Les chats', 'Jus de fruits et legumes frais'],
      false,
    ],
    ['aucun produit', 0, 19, [], [], false],
  ])('%s', (_name, products, references, childLabels, groupLabels, expected) => {
    expect(chipCoherent({ products, references, childLabels, groupLabels })).toBe(expected)
  })
})

describe('le diagnostic dit les listes de produits de « tomate » et « courgette » (DRV-647, 0.38.0)', () => {
  it('une ligne par liste et ses libellés, la somme face au total ; rien de personnel', async () => {
    const fake = fakeSite(() => ({ body: REPLY }))
    const deps: ChecksDeps = {
      adapter: new LeclercAdapter(fake.deps),
      agentVersion: '0.38.0',
      storage: fakeStorage(),
      wakeLock: fakeWakeLock().wakeLock,
      originReplaced: null,
    }

    const { probes } = await runChecks(deps, () => undefined)
    const text = probeLines(probes).join('\n')

    expect(text).toContain(
      'Listes de produits de la réponse « tomate » : iNbTotalProduits=6, produits lus dans les listes : 6 ; facette « fruits / légumes » : absente',
    )
    expect(text).toContain(
      'Liste objContenuMDD (« tomate ») : objet, clés : iNbElements, lstElements[2] ; iIdProduit vus : 2, produits lus : 2 (non lus : 0 objet trop grand, 0 sans libellé) ; rayons : 41:2 ; familles : « Legumes » (2) ; légumes ou fruits : oui',
    )
    expect(text).toContain(
      'Libellés de la liste objContenuMDD (« tomate ») : « Tomates rondes MDD inventées 1 kg » ; « Courgettes MDD inventées 1 kg »',
    )
    expect(text).toContain('Listes de produits de la réponse « courgette »')
    expect(text).not.toContain('Listes de produits de la réponse « pomme »')
    for (const secret of ['000123', CITY]) expect(text).not.toContain(secret)
  })
})
