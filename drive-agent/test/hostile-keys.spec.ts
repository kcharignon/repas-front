// Revue de sécurité du drive : une donnée venue de la page de l'enseigne ou du plan (un nom d'unité, une entité HTML, un identifiant
// d'ingrédient) ne doit jamais retrouver un attribut hérité de `Object.prototype` (`constructor`, `__proto__`). Valeurs INVENTÉES.
import { describe, expect, it } from 'vitest'

import { toCandidate } from '../src/leclerc/candidate'
import { contentFromStructured, parseContent } from '../src/leclerc/content'
import { decodeEntities, extractProducts } from '../src/leclerc/embedded'
import { fakeAdapter, fakeUi, fresh, home, known, makeFlow, plan, product } from './flow-helpers'
import { expectConform } from './flow-helpers'

/** Les noms que `Object.prototype` fournit à tout objet : en minuscules, ceux que la page peut écrire dans une unité. */
const INHERITED = ['constructor', '__proto__', 'hasownproperty', 'tostring', 'valueof']

describe('un nom d’unité venu de la page', () => {
  it.each(INHERITED)('« %s » n’est pas une unité : le contenu net reste inconnu', (name) => {
    // Given : un produit dont le champ structuré porte un nom hérité à la place d'une unité
    const fields = { unitMeasure: name, unitContent: 5, totalContent: null, totalUnit: null }
    const total = { unitMeasure: null, unitContent: null, totalContent: 2, totalUnit: name }

    // When / Then : `null` plutôt qu'une valeur fausse (jamais `{ value: NaN, unit: undefined }`)
    expect(contentFromStructured(fields)).toBeNull()
    expect(contentFromStructured(total)).toBeNull()
  })

  it('laisse le libellé et les prix donner le contenu quand l’unité structurée est inconnue', () => {
    // Given : une unité structurée absurde, mais un libellé lisible
    const structured = {
      unitMeasure: 'constructor',
      unitContent: 5,
      totalContent: 2,
      totalUnit: 'constructor',
    }

    // When
    const found = parseContent('500 g', null, { price: null, text: null }, structured)

    // Then
    expect(found).toEqual({ content: { value: 500, unit: 'g' }, source: 'label' })
  })

  it('un produit de la page avec une unité héritée n’a pas de contenu NaN', () => {
    // Given
    const page =
      '{"iIdProduit":123,"sLibelleLigne1":"Farine T55","nrPVUnitaireTTC":1.5,"sUniteMesureTotale":"constructor","nrContenanceTotale":2}'

    // When
    const [candidate] = extractProducts(page).products.map(toCandidate)

    // Then
    expect(candidate?.content).toBeNull()
  })
})

describe('une entité HTML venue de la page', () => {
  it.each(INHERITED)('« &%s; » n’est pas une entité : le texte reste tel quel', (name) => {
    expect(decodeEntities(`A &${name}; B`)).toBe(`A &${name}; B`)
  })

  it('décode toujours les entités connues', () => {
    expect(decodeEntities('Lait &amp; c&#339;ur &lt;b&gt; &quot;1 L&quot;')).toBe(
      'Lait & cœur <b> "1 L"',
    )
  })
})

describe('un identifiant d’ingrédient qui est aussi un nom hérité', () => {
  it('« constructor » est mis au panier et rendu comme n’importe quel autre ingrédient', async () => {
    // Given : le plan nomme un ingrédient « constructor » (un slug valide : lettres minuscules)
    const { adapter, writes } = fakeAdapter({ '1000001': {}, '1000002': {} })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(
      plan([
        known('constructor', [product('1000001', 1)]),
        known('farine', [product('1000002', 2)]),
      ]),
    )

    // Then : les deux produits sont au panier et le résultat, conforme, porte les deux lignes
    expect(writes).toEqual([
      { id: '1000001', quantity: 1 },
      { id: '1000002', quantity: 2 },
    ])
    expect(screens.screens()).toEqual(['summary', 'progress', 'end'])
    const result = expectConform(sent[0])
    expect(result.outcome).toBe('completed')
    expect(result.lines.map((line) => [line.ingredientSlug, line.outcome])).toEqual([
      ['constructor', 'ADDED'],
      ['farine', 'ADDED'],
    ])
  })

  it('« constructor » à choisir (nouvel ingrédient) attend la phase B au lieu d’être sauté', async () => {
    // Given : un ingrédient nouveau et un autre « j'en ai toujours », tous deux à nom hérité possible
    const { adapter } = fakeAdapter()
    const screens = fakeUi()
    const { flow, sent } = makeFlow({
      ui: screens.ui,
      adapter,
      phaseB: ({ pending, record }) => {
        for (const { line } of pending)
          record({ ingredientSlug: line.ingredientSlug, outcome: 'SKIPPED' })
        return Promise.resolve('done')
      },
    })

    // When
    await flow.start(plan([fresh('constructor'), home('farine')]))

    // Then
    const result = expectConform(sent[0])
    expect(result.lines.map((line) => [line.ingredientSlug, line.outcome])).toEqual([
      ['constructor', 'SKIPPED'],
      ['farine', 'HAVE_AT_HOME'],
    ])
  })
})
