// @vitest-environment node
// Ticket D de l'audit du 2026-10-18 (H7) : les formes dérivées d'un nom d'ingrédient que l'agent essaie, une par une, quand le moteur de
// Leclerc ne répond rien au nom tel qu'il est dans Repas. Fonction pure, aucune requête : l'ordre, les doublons, la borne de 4 et les
// cas limites (vide, un seul caractère, Unicode composé ou décomposé) se prouvent ici.
import { describe, expect, it } from 'vitest'

import { MAX_FALLBACKS, searchForms } from '../src/flow/search-forms'

describe('les formes dans l’ordre : minuscules sans accents, ligatures, pluriel, parenthèses et mots de liaison, premier mot', () => {
  it('« œuf » : « oeuf » (la ligature), puis « oeufs » (le pluriel) ; la forme sans accent est le nom lui-même, elle n’est pas rejouée', () => {
    expect(searchForms('œuf')).toEqual(['oeuf', 'oeufs'])
  })

  it('« Œuf » : la forme en minuscules d’abord, puis la ligature, puis le pluriel', () => {
    expect(searchForms('Œuf')).toEqual(['œuf', 'oeuf', 'oeufs'])
  })

  it('« æ » devient « ae »', () => {
    expect(searchForms('Cæcum')).toEqual(['cæcum', 'caecum', 'caecums'])
  })

  it('« tomates » : le singulier ; la forme en minuscules est le nom lui-même', () => {
    expect(searchForms('tomates')).toEqual(['tomate'])
  })

  it('« tomate » : le pluriel', () => {
    expect(searchForms('tomate')).toEqual(['tomates'])
  })

  it('« Tomates » : les minuscules d’abord, puis le singulier', () => {
    expect(searchForms('Tomates')).toEqual(['tomates', 'tomate'])
  })

  it('un « x » final se retire aussi (« choux » devient « chou »)', () => {
    expect(searchForms('choux')).toEqual(['chou'])
  })

  it('« pâtes (sèches) » : sans accents, puis sans la parenthèse (le pluriel ne touche pas un texte à parenthèses)', () => {
    expect(searchForms('pâtes (sèches)')).toEqual(['pates (seches)', 'pates'])
  })

  it('« crème fraîche épaisse » : sans accents, puis le premier mot seul (on n’ajoute pas de « s » à une expression)', () => {
    expect(searchForms('crème fraîche épaisse')).toEqual(['creme fraiche epaisse', 'creme'])
  })

  it('« herbes de Provence » : les quatre formes, dans l’ordre (minuscules, singulier du premier mot, sans « de », premier mot)', () => {
    expect(searchForms('herbes de Provence')).toEqual([
      'herbes de provence',
      'herbe de provence',
      'herbes provence',
      'herbes',
    ])
  })

  it('« huile d’olive » : l’apostrophe typographique devient droite, « d’ » tombe, le premier mot reste', () => {
    expect(searchForms('huile d’olive')).toEqual(["huile d'olive", 'huile olive', 'huile'])
  })

  it('« l’ail » : l’article élidé tombe', () => {
    expect(searchForms('l’ail')).toEqual(["l'ail", 'ail'])
  })

  it('le premier mot significatif passe les mots de liaison et les nombres', () => {
    expect(searchForms('2 tomates de la Drôme')).toEqual([
      '2 tomates de la drome',
      '2 tomates drome',
      'tomates',
    ])
  })

  it('les mots de liaison sont retirés quel que soit leur nombre', () => {
    expect(searchForms('Pâte à tartiner au chocolat')).toEqual([
      'pate a tartiner au chocolat',
      'pate tartiner chocolat',
      'pate',
    ])
  })

  it('aucun « s » n’est ajouté après un « z » (« riz »), et un mot de moins de trois lettres ne change pas', () => {
    expect(searchForms('riz')).toEqual([])
    expect(searchForms('bn')).toEqual([])
  })
})

describe('les bornes', () => {
  it('un nom vide, d’espaces ou d’un seul caractère n’a aucune forme (rien de sensé à essayer)', () => {
    expect(searchForms('')).toEqual([])
    expect(searchForms('   ')).toEqual([])
    expect(searchForms('a')).toEqual([])
    expect(searchForms('É')).toEqual([])
    expect(searchForms('œ')).toEqual([])
    expect(searchForms(' é ')).toEqual([])
  })

  it('deux caractères : jamais de forme plus courte que deux caractères', () => {
    expect(searchForms('Éo')).toEqual(['eo'])
    for (const form of searchForms('Éo')) expect(Array.from(form).length).toBeGreaterThanOrEqual(2)
  })

  it('un nom fait seulement de mots de liaison ou de parenthèses n’a pas de forme vide', () => {
    expect(searchForms('de la')).toEqual([])
    expect(searchForms('(bio)')).toEqual([])
  })

  it('jamais plus de quatre formes : avec cinq différentes, c’est le pluriel qui saute', () => {
    // minuscules, ligature, pluriel, sans « de », premier mot : cinq formes
    expect(searchForms('Œufs de poule')).toEqual([
      'œufs de poule',
      'oeufs de poule',
      'oeufs poule',
      'oeufs',
    ])
    expect(MAX_FALLBACKS).toBe(4)
  })

  it('un nom très long reste borné à quatre formes, sans doublon, sans le nom lui-même', () => {
    const name = 'Œufs frais de la ferme du Plateau (élevés en plein air, calibre moyen) à la coque'
    const forms = searchForms(name)

    expect(forms.length).toBeLessThanOrEqual(MAX_FALLBACKS)
    expect(new Set(forms).size).toBe(forms.length)
    expect(forms).not.toContain(name)
  })

  it('les espaces en trop, au bord ou au milieu, ne font ni forme ni doublon', () => {
    expect(searchForms('  tomates  ')).toEqual(['tomate'])
    expect(searchForms('crème   fraîche')).toEqual(['creme fraiche', 'creme'])
  })

  it('un texte sans lettre (un nombre) n’a pas de forme', () => {
    expect(searchForms('12')).toEqual([])
    expect(searchForms('123456')).toEqual([])
  })
})

describe('Unicode : composé (NFC) ou décomposé (NFD), le résultat est le même', () => {
  const composed = [
    'crème fraîche',
    'Épices',
    'pâtes (sèches)',
    'œuf',
    'Œufs de poule',
    'huile d’olive',
    'haricots verts',
  ]

  it.each(composed)('« %s » : mêmes formes quelle que soit la normalisation', (name) => {
    const nfc = name.normalize('NFC')
    const nfd = name.normalize('NFD')

    expect(searchForms(nfd)).toEqual(searchForms(nfc))
    expect(searchForms(nfd)).not.toEqual([])
  })

  it('un « é » décomposé (e + accent) tombe comme un « é » composé', () => {
    expect(searchForms('crème')).toEqual(['creme', 'cremes'])
    expect(searchForms('Pâte')).toEqual(['pate', 'pates'])
  })

  it('un nom décomposé identique à sa forme sans accent n’a pas de forme de plus (le nom lui-même n’est pas rejoué)', () => {
    // « tomate » en ASCII : la forme sans accent est le nom
    expect(searchForms('tomate'.normalize('NFD'))).toEqual(['tomates'])
  })

  it('aucune forme ne garde un accent ni une marque combinante', () => {
    for (const name of composed) {
      for (const form of searchForms(name)) expect(form).not.toMatch(/[̀-ͯ]|[àâäçéèêëîïôöùûüÿ]/)
    }
  })
})

describe('invariants, sur des noms de toute sorte', () => {
  const names = [
    'œuf',
    'tomates',
    'pâtes (sèches)',
    'crème fraîche épaisse',
    'herbes de Provence',
    'Pommes de terre',
    'Beurre demi-sel',
    'Lait demi-écrémé UHT',
    "Jus d'orange",
    'Pain de mie (complet)',
    'a',
    '',
    'bn',
    'betternut',
    '<img src=x onerror=alert(1)>',
    '100 % pur jus & fruits',
  ]

  it.each(names)(
    '« %s » : au plus quatre formes, distinctes, jamais le nom, jamais courtes ni vides',
    (name) => {
      const forms = searchForms(name)

      expect(forms.length).toBeLessThanOrEqual(MAX_FALLBACKS)
      expect(new Set(forms).size).toBe(forms.length)
      expect(forms).not.toContain(name.trim())
      for (const form of forms) {
        expect(Array.from(form).length).toBeGreaterThanOrEqual(2)
        expect(form).toBe(form.trim())
        expect(form).not.toMatch(/\s{2,}/)
      }
    },
  )
})
