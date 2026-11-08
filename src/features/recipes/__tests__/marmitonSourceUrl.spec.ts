// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { marmitonSourceUrl } from '@/features/recipes/marmitonSourceUrl'

const valid = 'https://www.marmiton.org/recettes/recette_tarte-au-citron-meringuee_22082.aspx'

describe('marmitonSourceUrl', () => {
  it("rend l'adresse d'une recette de Marmiton telle quelle", () => {
    expect(marmitonSourceUrl(valid)).toBe(valid)
  })

  it.each([
    ['rien', null],
    ['absente', undefined],
    ['pas un texte', 42],
    ['vide', ''],
    ['javascript:', 'javascript:alert(1)'],
    ['http', valid.replace('https', 'http')],
    ['un autre site', 'https://www.example.org/recettes/recette_tarte_22082.aspx'],
    ['le domaine qui commence par celui de Marmiton', 'https://www.marmiton.org.evil.com/'],
    [
      'le domaine qui commence par celui de Marmiton, chemin valide',
      'https://www.marmiton.org.evil.com/recettes/recette_tarte_22082.aspx',
    ],
    ['des identifiants devant', valid.replace('https://', 'https://www.marmiton.org@evil.com/#')],
    ['un nom d’utilisateur', valid.replace('https://', 'https://moi:mdp@')],
    ['un port', valid.replace('.org', '.org:8443')],
    ['une requête', `${valid}?utm=1`],
    ['un fragment', `${valid}#avis`],
    ['sans le www', valid.replace('www.', '')],
    ['un autre chemin', 'https://www.marmiton.org/recettes/index.aspx'],
    ['un identifiant qui n’est pas un nombre', valid.replace('22082', 'abc')],
    ['des espaces autour', ` ${valid} `],
  ])('ne rend rien pour %s', (_label, value) => {
    expect(marmitonSourceUrl(value)).toBeNull()
  })
})
