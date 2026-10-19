// DRV-635 : les formes de requête d'un produit habituel. Relevé sur le vrai site (2026-10-19, « Oeufs C'est Qui Le Patron Plein Air x6 ») : « c'est » et
// « cest » le retrouvent, « c est » (l'apostrophe remplacée par une espace) ne trouve RIEN. Les signes se RETIRENT donc, ils ne se remplacent jamais par une
// espace ; le libellé tel quel est toujours la première requête (c'est `lookUpKnownProduct` qui la fait : ces formes viennent après) ; cinq requêtes au plus.
import { describe, expect, it } from 'vitest'

import { MAX_PRODUCT_FORMS, productSearchForms } from '../src/flow/search-forms'

describe('les formes d’un libellé de produit', () => {
  it.each([
    // [libellé, formes attendues]
    [
      "Oeufs C'est Qui Le Patron Plein Air x6",
      ['oeufs cest qui le patron plein air x6', 'oeufs cest qui patron plein air', 'oeufs patron'],
    ],
    [
      'Oeufs C’est Qui Le Patron Plein Air x6',
      [
        "oeufs c'est qui le patron plein air x6",
        'oeufs cest qui le patron plein air x6',
        'oeufs cest qui patron plein air',
        'oeufs patron',
      ],
    ],
    [
      "Céréales fourrées P'tit Fermier Chocolat noisette 450 g",
      [
        "cereales fourrees p'tit fermier chocolat noisette 450 g",
        'cereales fourrees ptit fermier chocolat noisette 450 g',
        'cereales fourrees ptit fermier chocolat noisette',
        'cereales fourrees',
      ],
    ],
    ['Chocolat-noisette & caramel', ['chocolatnoisette caramel']],
    ['Sauce 1/2 pomme-tomate 1,5 l', ['sauce 12 pommetomate 1,5 l', 'sauce pommetomate']],
    ['Biscuits 50% cacao', ['biscuits 50 cacao', 'biscuits cacao']],
    [
      'Pâtes (sèches) Barilla 500 g',
      ['pates (seches) barilla 500 g', 'pates seches barilla 500 g', 'pates barilla'],
    ],
    ['Œufs frais', ['oeufs frais']],
    ['Lait 1 L', ['lait']],
    [
      'Huile d’olive vierge extra',
      [
        "huile d'olive vierge extra",
        'huile dolive vierge extra',
        'huile olive vierge extra',
        'huile vierge',
      ],
    ],
  ])('%s', (label, forms) => {
    expect(productSearchForms(label)).toEqual(forms)
  })

  it('l’apostrophe est gardée dans la première forme et retirée dans la suivante, jamais remplacée par une espace', () => {
    for (const label of ["Gâteaux C'est Nous Pépites", 'Gâteaux C’est Nous Pépites']) {
      const forms = productSearchForms(label)

      expect(forms.some((form) => form.includes('c est'))).toBe(false)
      expect(forms).toContain('gateaux cest nous pepites')
    }
  })

  it('les signes (tiret, barre oblique, « & », « % », parenthèses, apostrophes) se retirent sans espace en échange', () => {
    const forms = productSearchForms("Pain-de-mie 1/2 & 5% d'amour (bio)")

    expect(forms.length).toBeGreaterThan(0)
    for (const form of forms.slice(1)) expect(form).not.toMatch(/[-/&%()'’]/)
    expect(forms).toContain('paindemie 12 5 damour bio')
  })

  it('un séparateur décimal entre deux chiffres reste (« 1,5 l »), ailleurs il se retire', () => {
    expect(productSearchForms('Eau 1,5 L. Source, pure')).toContain('eau 1,5 l source pure')
  })

  it('les accents et les ligatures tombent, les majuscules aussi', () => {
    expect(productSearchForms('ŒUFS Élevés en Plein-Air')[0]).toBe('oeufs eleves en plein-air')
  })

  it('une forme qui ne diffère du libellé que par la casse n’est pas rejouée (le site ne distingue pas)', () => {
    expect(productSearchForms('sel fin')).toEqual([])
    expect(productSearchForms('Sel Fin')).toEqual([])
  })

  it('les nombres et les quantités seuls ne sont pas des mots-clés', () => {
    const forms = productSearchForms('Yaourt nature 8 x 125 g')

    expect(forms.at(-1)).toBe('yaourt nature')
    expect(forms.join(' ')).not.toMatch(/\bx\b.*\bx\b/)
  })

  it('les mots-clés sont les deux plus longs mots, dans l’ordre du libellé (« marque + mot principal »)', () => {
    const forms = productSearchForms('Pâtes Barilla Spaghetti Complets 500 g')

    expect(forms.at(-1)).toBe('spaghetti complets')
  })

  it('un libellé très court, vide ou d’un seul caractère n’a aucune forme', () => {
    expect(productSearchForms('')).toEqual([])
    expect(productSearchForms('   ')).toEqual([])
    expect(productSearchForms('A')).toEqual([])
    expect(productSearchForms('Sel')).toEqual([])
  })

  it('jamais plus de 4 formes, jamais deux fois la même, jamais le libellé lui-même ni une forme vide', () => {
    const labels = [
      "Céréales fourrées P'tit Fermier Chocolat noisette 450 g",
      'Œufs C’est (bio) & Local 50% d’amour 1/2 – x6',
      'Huile d’olive vierge extra Jardin Inventé 75 cl',
      'x',
      '%%%',
      '1 2 3',
    ]
    for (const label of labels) {
      const forms = productSearchForms(label)

      expect(forms.length).toBeLessThanOrEqual(MAX_PRODUCT_FORMS)
      expect(new Set(forms).size).toBe(forms.length)
      expect(forms).not.toContain(label)
      for (const form of forms) expect(Array.from(form).length).toBeGreaterThanOrEqual(2)
    }
    expect(MAX_PRODUCT_FORMS).toBe(4)
  })

  it('le résultat est le même que le libellé soit composé (NFC) ou décomposé (NFD)', () => {
    const label = "Céréales fourrées P'tit Fermier"

    expect(productSearchForms(label.normalize('NFD'))).toEqual(
      productSearchForms(label.normalize('NFC')),
    )
  })
})
