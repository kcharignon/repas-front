// Le libellé des rayons du site (DRV-647, étape 1) : l'ordre des sources, l'humanisation, ce qui est écarté, le repli, et ce que le diagnostic en
// montre. Les valeurs réelles n'ont jamais été vues : chaque forme plausible est éprouvée. Données INVENTÉES.
import { describe, expect, it } from 'vitest'

import { probeLines, runChecks, type ChecksDeps } from '../src/diagnostic'
import {
  aisleChoices,
  facetLabels,
  humanize,
  labelFromUrl,
  LeclercAdapter,
  namedObjectKeys,
  plausibleLabel,
  shownAisleText,
  shownAisleUrl,
  type AisleTexts,
  type Candidate,
} from '../src/leclerc'
import { fakeStorage, fakeWakeLock } from './flow-helpers'
import { fakeSite, PAGE, type Call, type Scripted } from './leclerc-helpers'

const CITY = 'Ville-Test'

const product = (aisle: number | null, texts: Partial<AisleTexts> = {}): Candidate =>
  ({
    aisle,
    ...(Object.keys(texts).length > 0 && {
      aisleTexts: { navigate: null, url: null, category: null, ...texts },
    }),
  }) as Candidate

describe('humanize et plausibleLabel : un texte du site rendu lisible, ou écarté', () => {
  it.each([
    ['fruits-et-legumes', 'Fruits et legumes'],
    ['fruits_et_légumes', 'Fruits et légumes'],
    ['FRUITS ET LÉGUMES', 'Fruits et légumes'],
    ['Crèmerie%20et%20fromages', 'Crèmerie et fromages'],
    ['  épicerie   salée ', 'Épicerie salée'],
  ])('« %s » devient « %s »', (raw, label) => {
    expect(humanize(raw)).toBe(label)
    expect(plausibleLabel(raw, CITY)).toBe(label)
  })

  it.each([
    ['une adresse', '/magasin-123456-123456-Ville-Test/rayon-284319-fruits.aspx'],
    ['une adresse complète', 'https://fd0-courses.leclercdrive.fr/x'],
    ['un nombre long', 'Rayon 284319'],
    ['un e-mail', 'jean.dupont@exemple.fr'],
    ['la ville', 'Promotions de Ville Test'],
    ['un seul signe', '-'],
    ['vide', '   '],
  ])('écarte %s', (_name, raw) => {
    expect(plausibleLabel(raw, CITY)).toBeNull()
  })

  it('borne un libellé à 40 caractères', () => {
    expect(humanize('a'.repeat(80))).toHaveLength(40)
  })

  it('lit le nom du rayon dans une adresse `rayon-N-<nom>.aspx`', () => {
    expect(
      labelFromUrl('/magasin-1-1-Ville-Test/rayon-284319-fruits-et-legumes.aspx?Filtres=1', CITY),
    ).toBe('Fruits et legumes')
    expect(labelFromUrl('rayons_12_epicerie-salee', CITY)).toBe('Epicerie salee')
    expect(labelFromUrl('/magasin-1-1-Ville-Test/rayon-5-Ville-Test.aspx', CITY)).toBeNull()
    expect(labelFromUrl('/magasin-1-1/accueil.aspx', CITY)).toBeNull()
    expect(labelFromUrl(null, CITY)).toBeNull()
  })
})

describe('aisleChoices : la première source qui donne un texte plausible l’emporte', () => {
  it('sLibelleUrlNaviguerRayon, puis sUrlVoirRayon, puis sCategorie, puis un objet de rayon de la réponse, de la page, sinon rien', () => {
    const candidates = [
      product(1, { navigate: 'Fruits et légumes', url: 'rayon-1-autre.aspx', category: 'Frais' }),
      product(2, {
        navigate: '/x?y=1',
        url: '/magasin-1-1-Ville-Test/rayon-2-boissons-sans-alcool.aspx',
      }),
      product(3, { category: 'Épicerie salée' }),
      product(4),
      product(5),
      product(6),
      product(null),
    ]

    const choices = aisleChoices(candidates, {
      city: CITY,
      reply: new Map([[4, ['Surgelés']]]),
      page: new Map([
        [4, ['Ignoré']],
        [5, ['Bébé']],
      ]),
    })

    expect(choices).toEqual([
      { id: 1, label: 'Fruits et légumes', count: 1, source: 'NAVIGATE' },
      { id: 2, label: 'Boissons sans alcool', count: 1, source: 'URL' },
      { id: 3, label: 'Épicerie salée', count: 1, source: 'CATEGORY' },
      { id: 4, label: 'Surgelés', count: 1, source: 'REPLY' },
      { id: 5, label: 'Bébé', count: 1, source: 'PAGE' },
      { id: 6, label: null, count: 1, source: null },
    ])
  })

  it('une adresse dans sLibelleUrlNaviguerRayon donne le nom du rayon qu’elle porte', () => {
    const [choice] = aisleChoices(
      [product(9, { navigate: '/magasin-1-1-Ville-Test/rayon-9-cremerie.aspx' })],
      { city: CITY },
    )
    expect(choice).toMatchObject({ label: 'Cremerie', source: 'NAVIGATE' })
  })

  it('du plus fourni au moins fourni ; plusieurs libellés pour un rayon : le plus fréquent', () => {
    const choices = aisleChoices(
      [
        product(7, { navigate: 'Conserves' }),
        product(8, { navigate: 'Légumes' }),
        product(8, { navigate: 'Légumes frais' }),
        product(8, { navigate: 'Légumes frais' }),
      ],
      { city: CITY },
    )

    expect(choices).toEqual([
      { id: 8, label: 'Légumes frais', count: 3, source: 'NAVIGATE' },
      { id: 7, label: 'Conserves', count: 1, source: 'NAVIGATE' },
    ])
  })

  it('un libellé écarté laisse la source suivante répondre', () => {
    const [choice] = aisleChoices(
      [product(3, { navigate: 'Offre 123456', category: 'Boulangerie' })],
      { city: CITY },
    )
    expect(choice).toMatchObject({ label: 'Boulangerie', source: 'CATEGORY' })
  })
})

describe('facetLabels et namedObjectKeys : les objets de rayon hors des produits', () => {
  const REPLY = `<script>var etat = {"objContenu":{"lstElements":[
    {"objElement":{"iIdProduit":1,"iIdRayon":41,"sLibelle":"Tomates rondes"}},
    {"objElement":{"iIdProduit":2,"iIdRayon":60,"objRayon":{"iIdRayon":60,"sLibelle":"Surgelés"}}}
  ]},"lstFiltres":[{"objFiltreBloc":{"iIdRayon":15,"sLibelleRayon":"Jus et boissons","iNb":3}},{"objFiltreBloc":{"iIdRayon":41,"sLibelle":"Fruits et légumes"}}]}</script>`

  it('lit le libellé d’un objet de rayon, jamais celui d’un produit', () => {
    const labels = facetLabels(REPLY)

    expect(labels.get(15)).toEqual(['Jus et boissons'])
    expect(labels.get(41)).toEqual(['Fruits et légumes'])
    expect(labels.get(60)).toEqual(['Surgelés'])
  })

  it('les NOMS des clés d’un objFiltreBloc, et d’une liste par son premier élément', () => {
    expect(namedObjectKeys(REPLY, 'objFiltreBloc')).toEqual({
      kind: 'OBJECT',
      keys: [
        { name: 'iIdRayon', kind: 'VALUE' },
        { name: 'sLibelleRayon', kind: 'VALUE' },
        { name: 'iNb', kind: 'VALUE' },
      ],
      total: 3,
    })
    expect(namedObjectKeys(REPLY, 'lstFiltres')).toMatchObject({ kind: 'LIST', size: 2, total: 1 })
    expect(namedObjectKeys(REPLY, 'objNavigationRayonFamille')).toBeNull()
    expect(JSON.stringify(namedObjectKeys(REPLY, 'objFiltreBloc'))).not.toContain('Jus')
  })
})

describe('ce que le diagnostic montre des textes du rayon : rien de personnel', () => {
  it('une adresse : le chemin, le magasin en N, la ville en V, les noms de paramètres', () => {
    expect(
      shownAisleUrl(
        'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/rayon-284319-Fruits-et-legumes.aspx?Filtres=987654&x=1',
        CITY,
      ),
    ).toEqual({
      kind: 'TEXT',
      text: '/magasin-N-N-V/rayon-284319-Fruits-et-legumes.aspx ?Filtres&x',
    })
    expect(shownAisleUrl('/a/b@c', CITY)).toEqual({ kind: 'HIDDEN' })
    expect(shownAisleUrl(null, CITY)).toEqual({ kind: 'ABSENT' })
  })

  it('un texte : nettoyé, nombres longs en N, ville en V, borné ; un e-mail est écarté ; une adresse est montrée comme une adresse', () => {
    expect(shownAisleText('Fruits et légumes', CITY)).toEqual({
      kind: 'TEXT',
      text: 'Fruits et légumes',
    })
    expect(shownAisleText('Offre 1234567 Ville-Test', CITY)).toEqual({
      kind: 'TEXT',
      text: 'Offre N V',
    })
    expect(shownAisleText('a@b.fr', CITY)).toEqual({ kind: 'HIDDEN' })
    expect(shownAisleText('/magasin-000123-000123/rayon-1-x.aspx', CITY)).toEqual({
      kind: 'TEXT',
      text: '/magasin-N-N/rayon-1-x.aspx',
    })
    expect(shownAisleText('x'.repeat(200), CITY)).toMatchObject({ kind: 'TEXT' })
  })
})

describe('le diagnostic dit le libellé de chaque rayon et sa source (DRV-647, étape 1)', () => {
  const productJson = (id: number, aisle: number, extra: string) =>
    `{"iIdProduit":${id},"sLibelleLigne1":"Produit inventé ${id}","nrPVUnitaireTTC":1.5,"iQteDisponible":3,"iIdRayon":${aisle},"iIdFamille":${aisle * 10}${extra}}`
  const REPLY = `<html><body><script>var etat = {"sNoPointLivraison":"123456","objContenu":{"lstElements":[
    ${productJson(1, 284319, ',"sLibelleUrlNaviguerRayon":"fruits-et-legumes","sUrlVoirRayon":"/magasin-000123-000123-Ville-Test/rayon-284319-fruits-et-legumes.aspx","sCategorie":"Frais"')},
    ${productJson(2, 284319, ',"sLibelleUrlNaviguerRayon":"fruits-et-legumes"')},
    ${productJson(3, 315989, ',"sUrlVoirRayon":"rayon-315989-conserves.aspx"')},
    ${productJson(4, 284311, '')}
  ]},"lstFiltres":[{"objFiltreBloc":{"iIdRayon":284311,"sLibelle":"Sauces","iNbProduits":1}}]}</script></body></html>`
  const PAGE_TEXT =
    '<script>var p = {"sNoPointLivraison":"555123","objNavigationRayonFamille":{"lstRayons":[{"iIdRayon":1,"sLibelle":"A"}],"iVersion":2}}</script>'

  async function report(): Promise<{ text: string; calls: number }> {
    const reply: (call: Call) => Scripted = () => ({ body: REPLY })
    const fake = fakeSite(reply, { pageText: () => PAGE_TEXT })
    const deps: ChecksDeps = {
      adapter: new LeclercAdapter(fake.deps),
      agentVersion: '0.33.0',
      storage: fakeStorage(),
      wakeLock: fakeWakeLock().wakeLock,
      originReplaced: null,
    }
    const { probes } = await runChecks(deps, () => undefined)
    return { text: probeLines(probes).join('\n'), calls: fake.calls.length }
  }

  it('une ligne par rayon le plus fourni de « tomate », avec le libellé résolu et sa source, ou le repli', async () => {
    const { text, calls } = await report()

    expect(text).toContain(
      'Libellé du rayon 284319 (2 produits) : « Fruits et legumes » (source : sLibelleUrlNaviguerRayon)',
    )
    expect(text).toContain(
      'Libellé du rayon 315989 (1 produit) : « Conserves » (source : sUrlVoirRayon)',
    )
    expect(text).toContain(
      'Libellé du rayon 284311 (1 produit) : « Sauces » (source : objet de rayon de la réponse)',
    )
    // Aucune requête de plus que l'étape 0 : cinq recherches.
    expect(calls).toBe(5)
  })

  it('les valeurs des textes du rayon du premier produit, rendues sûres, et les NOMS des clés des objets de filtre et de navigation', async () => {
    const { text } = await report()

    expect(text).toContain(
      'Premier produit de « tomate », sLibelleUrlNaviguerRayon : « fruits-et-legumes »',
    )
    expect(text).toContain(
      'Premier produit de « tomate », sUrlVoirRayon : « /magasin-N-N-V/rayon-284319-fruits-et-legumes.aspx »',
    )
    expect(text).toContain('Premier produit de « tomate », sCategorie : « Frais »')
    expect(text).toContain(
      'Clés de objFiltreBloc (réponse « tomate », noms seulement) : objet ; 3 clés : iIdRayon, sLibelle, iNbProduits',
    )
    expect(text).toContain(
      'Clés de objNavigationRayonFamille (page, noms seulement) : objet ; 2 clés : lstRayons[1], iVersion',
    )
    for (const secret of ['000123', 'Ville-Test', '123456', '555123', 'Produit inventé']) {
      expect(text).not.toContain(secret)
    }
  })

  it('le repli « Rayon 1 » quand aucun texte n’est lisible', async () => {
    const fake = fakeSite(() => ({ body: REPLY.replace(/"sLibelle":"Sauces",/, '') }))
    const adapter = new LeclercAdapter(fake.deps)
    const found = await adapter.searchProducts('tomate')

    expect(adapter.aisleChoices(found).at(-1)).toEqual({
      id: 284311,
      label: null,
      count: 1,
      source: null,
    })
    expect(PAGE.pathname).toContain(CITY)
  })
})
