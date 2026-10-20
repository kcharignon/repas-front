// Le libellé des groupes de la rangée (DRV-647) d'après la mesure réelle du 2026-10-20 : jamais un texte de lien (« Voir le rayon »), le libellé au niveau
// (rayon ou famille) où son identifiant correspond, le repli, et ce que le diagnostic en montre. Données INVENTÉES, de la forme mesurée.
import { describe, expect, it } from 'vitest'

import { probeLines, runChecks, type ChecksDeps } from '../src/diagnostic'
import {
  aisleChoices,
  facetLabels,
  facetObjects,
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
import { extractProducts } from '../src/leclerc/embedded'
import { fakeStorage, fakeWakeLock } from './flow-helpers'
import { fakeSite, type Call, type Scripted } from './leclerc-helpers'

const CITY = 'Ville-Test'

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
    ['un texte de lien', 'Voir le rayon'],
    ['un texte de lien en capitales', 'VOIR LE RAYON'],
    ['« Voir tout »', 'Voir tout'],
    ['« Tout voir »', 'Tout voir'],
    ['« Voir la famille »', 'voir-la-famille'],
    ['un mot seul', 'Rayon'],
    ['un code', '40'],
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

describe('aisleChoices : jamais un texte de lien, le libellé au niveau où son identifiant correspond', () => {
  /** Un produit au rayon [aisle] et à la famille [family], avec les textes que le vrai site joint (« Voir le rayon » partout, mesure du 2026-10-20). */
  const item = (aisle: number, family: number, texts: Partial<AisleTexts> = {}): Candidate =>
    ({
      aisle,
      family,
      aisleTexts: { navigate: 'Voir le rayon', url: null, category: '40', ...texts },
    }) as Candidate

  it('la forme réelle : sLibelleUrlNaviguerRayon « Voir le rayon » partout, sUrlVoirRayon au numéro de la FAMILLE : filtre par famille, nommée par l’adresse', () => {
    const candidates = [
      item(284319, 288378, {
        url: '/magasin-1-1-Ville-Test/rayon-288378-Bouillons-Fonds-et-Sauces.aspx',
      }),
      item(284319, 288378, {
        url: '/magasin-1-1-Ville-Test/rayon-288378-Bouillons-Fonds-et-Sauces.aspx',
      }),
      item(284319, 284421, { url: 'rayon-284421-Tomates-pelees-et-concassees.aspx' }),
      item(315989, 284422, {}),
    ]

    const grouping = aisleChoices(candidates, { city: CITY })

    expect(grouping).toEqual({
      level: 'FAMILLE',
      key: 'family',
      coverage: { RAYON: 0, FAMILLE: 3 },
      choices: [
        { id: 288378, label: 'Bouillons Fonds et Sauces', count: 2, source: 'URL' },
        { id: 284421, label: 'Tomates pelees et concassees', count: 1, source: 'URL' },
        { id: 284422, label: null, count: 1, source: null },
      ],
    })
    expect(JSON.stringify(grouping)).not.toMatch(/Voir le rayon|"40"/)
  })

  it('un objFiltreBloc dont iIdBloc est le rayon du produit : filtre par rayon, nommé par son sLibelle, avant l’adresse', () => {
    const candidates = [
      item(41, 410, {
        filter: { label: 'Fruits et légumes', block: 41, type: 1, path: 'ELEMENT' },
        url: 'rayon-410-Tomates.aspx',
      }),
      item(41, 411, {
        filter: { label: 'Fruits et légumes', block: 41, type: 1, path: 'ELEMENT' },
      }),
      item(7, 71, { filter: { label: 'Conserves', block: 7, type: 1, path: 'ELEMENT' } }),
    ]

    expect(aisleChoices(candidates, { city: CITY })).toMatchObject({
      level: 'RAYON',
      key: 'aisle',
      choices: [
        { id: 41, label: 'Fruits et légumes', count: 2, source: 'FILTER' },
        { id: 7, label: 'Conserves', count: 1, source: 'FILTER' },
      ],
    })
  })

  it('un sLibelle d’objFiltreBloc au numéro sans rapport vaut au niveau où il est cohérent (ici la famille)', () => {
    const loose = (label: string) => ({ label, block: 999, type: 2, path: 'PRODUCT' as const })
    const candidates = [
      item(41, 410, { filter: loose('Tomates rondes') }),
      item(41, 410, { filter: loose('Tomates rondes') }),
      item(41, 411, { filter: loose('Tomates cerises') }),
      item(41, 411, { filter: loose('Tomates cerises') }),
    ]

    expect(aisleChoices(candidates, { city: CITY })).toMatchObject({
      level: 'FAMILLE',
      choices: [
        { id: 410, label: 'Tomates rondes', source: 'FILTER' },
        { id: 411, label: 'Tomates cerises', source: 'FILTER' },
      ],
    })
  })

  it('un même libellé pour tous les groupes ne nomme rien : repli partout', () => {
    const block = { label: 'Marques', block: 5, type: 3, path: 'ELEMENT' as const }
    const candidates = [
      item(41, 410, { filter: { ...block, block: 41 } }),
      item(7, 71, { filter: { ...block, block: 7 } }),
    ]

    const grouping = aisleChoices(candidates, { city: CITY })

    expect(grouping.choices.map((choice) => choice.label)).toEqual([null, null])
    expect(grouping.level).toBe('RAYON')
  })

  it('une adresse dont le numéro n’est ni le rayon ni la famille du produit est ignorée', () => {
    const grouping = aisleChoices(
      [item(41, 410, { url: 'rayon-123-Ailleurs.aspx' }), item(7, 71)],
      { city: CITY },
    )

    expect(grouping).toMatchObject({ level: 'RAYON', coverage: { RAYON: 0, FAMILLE: 0 } })
    expect(grouping.choices.every((choice) => choice.label === null)).toBe(true)
  })

  it('un objet de filtre hors des produits nomme le groupe dont il porte l’identifiant', () => {
    const grouping = aisleChoices([item(41, 410), item(41, 410), item(7, 71)], {
      city: CITY,
      reply: new Map([[410, ['Tomates fraîches']]]),
    })

    expect(grouping).toMatchObject({
      level: 'FAMILLE',
      choices: [
        { id: 410, label: 'Tomates fraîches', count: 2, source: 'FACET' },
        { id: 71, label: null },
      ],
    })
  })

  it('du plus fourni au moins fourni ; plusieurs libellés pour un groupe : le plus fréquent', () => {
    const at = (url: string) => ({ url })
    const grouping = aisleChoices(
      [
        item(1, 7, at('rayon-7-Conserves.aspx')),
        item(1, 8, at('rayon-8-Legumes.aspx')),
        item(1, 8, at('rayon-8-Legumes-frais.aspx')),
        item(1, 8, at('rayon-8-Legumes-frais.aspx')),
      ],
      { city: CITY },
    )

    expect(grouping.choices).toEqual([
      { id: 8, label: 'Legumes frais', count: 3, source: 'URL' },
      { id: 7, label: 'Conserves', count: 1, source: 'URL' },
    ])
  })
})

describe('l’objFiltreBloc d’un produit : dans le produit ou dans l’élément qui l’englobe', () => {
  it('lit son libellé, son identifiant, son type et son chemin', () => {
    const page = `<script>var e = {"objContenu":{"lstElements":[
      {"objElement":{"iIdProduit":1,"sLibelleLigne1":"Pain inventé","iIdRayon":3,"iIdFamille":30},"objFiltreBloc":{"iIdBloc":3,"neTypeBloc":1,"sLibelle":"Boulangerie"}},
      {"objElement":{"iIdProduit":2,"sLibelleLigne1":"Lait inventé","iIdRayon":4,"iIdFamille":40,"objFiltreBloc":{"iIdBloc":40,"neTypeBloc":2,"sLibelle":"Lait"}}},
      {"objElement":{"iIdProduit":3,"sLibelleLigne1":"Sel inventé","iIdRayon":5,"iIdFamille":50}}
    ]}}</script>`

    const [pain, lait, sel] = extractProducts(page).products

    expect(pain?.aisleTexts?.filter).toEqual({
      label: 'Boulangerie',
      block: 3,
      type: 1,
      path: 'ELEMENT',
    })
    expect(lait?.aisleTexts?.filter).toEqual({ label: 'Lait', block: 40, type: 2, path: 'PRODUCT' })
    expect(sel?.aisleTexts).toBeUndefined()
    expect(facetObjects(page, 8)).toEqual([])
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

describe('le diagnostic dit le niveau, le libellé de chaque groupe et sa source, et des produits échantillons (DRV-647)', () => {
  const productJson = (id: number, aisle: number, family: number, extra: string) =>
    `{"iIdProduit":${id},"sLibelleLigne1":"Produit inventé ${id}","nrPVUnitaireTTC":1.5,"iQteDisponible":3,"iIdRayon":${aisle},"iIdFamille":${family},"sLibelleUrlNaviguerRayon":"Voir le rayon","sCategorie":"40"${extra}}`
  const url = (family: number, name: string) =>
    `,"sUrlVoirRayon":"/magasin-000123-000123-Ville-Test/rayon-${family}-${name}.aspx?Filtres="`
  const REPLY = `<html><body><script>var etat = {"sNoPointLivraison":"123456","objContenu":{"lstElements":[
    {"objElement":${productJson(1, 284319, 288378, url(288378, 'Bouillons-Fonds-et-Sauces'))},"objFiltreBloc":{"iIdBloc":3,"neTypeBloc":2,"sLibelle":"Marques","fMultiSelection":true,"niNbAffichage":5,"iNbValeursMinimum":1}},
    {"objElement":${productJson(2, 284319, 288378, url(288378, 'Bouillons-Fonds-et-Sauces'))}},
    {"objElement":${productJson(3, 284319, 284421, url(284421, 'Tomates-pelees'))}},
    {"objElement":${productJson(4, 315989, 284422, '')}}
  ]},"lstFiltres":[{"iIdValeur":284422,"sLibelle":"Tomates fraîches","objFiltreBloc":{"iIdBloc":1,"sLibelle":"Rayons"}}]}</script></body></html>`

  async function report(): Promise<{ text: string; calls: number }> {
    const reply: (call: Call) => Scripted = () => ({ body: REPLY })
    const fake = fakeSite(reply)
    const deps: ChecksDeps = {
      adapter: new LeclercAdapter(fake.deps),
      agentVersion: '0.34.0',
      storage: fakeStorage(),
      wakeLock: fakeWakeLock().wakeLock,
      originReplaced: null,
    }
    const { probes } = await runChecks(deps, () => undefined)
    return { text: probeLines(probes).join('\n'), calls: fake.calls.length }
  }

  it('le niveau retenu et pourquoi, puis chaque groupe avec son libellé et sa source ; jamais « Voir le rayon » comme libellé', async () => {
    const { text, calls } = await report()

    expect(text).toContain(
      'Niveau du filtre pour « tomate » : famille (produits nommés : 0 au niveau rayon, 4 au niveau famille, sur 4)',
    )
    expect(text).toContain(
      'Libellé de la famille 288378 (2 produits) : « Bouillons Fonds et Sauces » (source : sUrlVoirRayon)',
    )
    expect(text).toContain(
      'Libellé de la famille 284422 (1 produit) : « Tomates fraîches » (source : objet de filtre de la réponse ou de la page)',
    )
    expect(text).toContain('Niveau du filtre pour « courgette »')
    expect(text).not.toMatch(/: « Voir le rayon » \(source/)
    // Cinq recherches, plus les formes de « Filtres » essayées sur la facette (0.37.0) : (ii) et (iii), la valeur n'ayant pas de sIdValeurUrl.
    expect(calls).toBe(7)
  })

  it('un produit échantillon par paire (rayon, famille) distincte, avec objFiltreBloc, sUrlVoirRayon et sCategorie rendus sûrs', async () => {
    const { text } = await report()
    const samples = text
      .split('\n')
      .filter((line) => line.includes('Produit échantillon de « tomate »'))

    expect(samples).toHaveLength(3)
    expect(samples[0]).toContain(
      'Produit échantillon de « tomate » : iIdRayon=284319 iIdFamille=288378 ; objFiltreBloc : (chemin dans l’élément qui englobe le produit) sLibelle=« Marques », iIdBloc=3, neTypeBloc=2 ; sUrlVoirRayon : id=288378 (famille) nom=« Bouillons-Fonds-et-Sauces » ; sCategorie=« 40 »',
    )
    expect(samples[2]).toContain('objFiltreBloc : absent ; sUrlVoirRayon : absent')
    expect(
      text.split('\n').filter((line) => line.includes('Produit échantillon de « courgette »')),
    ).toHaveLength(3)
    expect(text).toContain(
      'Objet de filtre 1 de la réponse « tomate » : 3 clés : iIdValeur, sLibelle, objFiltreBloc{} ; identifiants : iIdValeur=284422 ; libellé : « Tomates fraîches » ; bloc : « Rayons »',
    )
    for (const secret of ['000123', 'Ville-Test', '123456']) {
      expect(text).not.toContain(secret)
    }
  })
})
