// La fiche d'un produit (DRV-652) : la même pour la liste de choix et l'écran « Vérifie la quantité ». Ce qui manque n'est jamais écrit.
import { describe, expect, it } from 'vitest'

import { cardOf } from '../src/flow/card'
import { candidate } from './flow-helpers'

describe('cardOf', () => {
  it('le nom, la seconde ligne, le contenu, le prix, le prix au kilo et la photo', () => {
    const card = cardOf(
      candidate('1', {
        label: 'Tomates cerises mélangées',
        label2: 'Barquette',
        content: { value: 400, unit: 'g' },
        price: 258,
        perMeasure: { cents: 645, unit: 'kg' },
        image: 'https://photos-test.leclercdrive.fr/image.ashx?id=1&use=l&cat=p',
      }),
    )

    expect(card).toEqual({
      name: 'Tomates cerises mélangées',
      label2: 'Barquette',
      details: ['400 g', '2,58 €', '6,45 € / kg'],
      photo: 'https://photos-test.leclercdrive.fr/image.ashx?id=1&use=l&cat=p',
    })
  })

  it('sans prix, sans contenu, sans photo : rien d’inventé', () => {
    expect(cardOf(candidate('2', { label: 'Produit', price: null }))).toEqual({
      name: 'Produit',
      label2: null,
      details: [],
      photo: null,
    })
  })

  it('une seconde ligne qui redit le contenu est retirée (« 400g » et « 400 g » se valent)', () => {
    const card = cardOf(
      candidate('3', { label: 'Tomates', label2: '400g', content: { value: 400, unit: 'g' } }),
    )

    expect(card.label2).toBeNull()
    expect(card.details).toEqual(['400 g'])
  })

  it('un libellé fait d’invisibles devient « Produit <numéro> », jamais un nom vide ni un caractère caché', () => {
    const card = cardOf(candidate('4', { label: '​­', label2: '​' }))

    expect(card.name).not.toBe('')
    expect(card.name).not.toMatch(/[​­]/)
    expect(card.label2).toBeNull()
  })
})
