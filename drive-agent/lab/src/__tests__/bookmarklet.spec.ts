// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { fromBookmarklet, SCHEME, toBookmarklet } from '../../bookmarklet'

describe('toBookmarklet', () => {
  it('commence par javascript: et finit par void 0, pour ne pas remplacer la page', () => {
    const url = toBookmarklet('(function(){alert(1)})();')

    expect(url.startsWith(SCHEME)).toBe(true)
    expect(fromBookmarklet(url)).toBe('(function(){alert(1)})();void 0')
  })

  it('redonne exactement le code, accents, guillemets, retours à la ligne et pourcentages compris', () => {
    // Given : tout ce qui pose problème dans une adresse
    const code = `var a = "é % # ? & + = ; , / \\ < > 'x' \`y\` \n\t {}[]|^$@!~*()"; var texte = 'Crème brûlée €'`

    // When
    const url = toBookmarklet(code)

    // Then
    expect(fromBookmarklet(url)).toBe(`${code};void 0`)
  })

  it('échappe ce qui casserait une adresse ou un message', () => {
    const url = toBookmarklet('a #b c "d" `e` \\f <g> %h\ni')
    const body = url.slice(SCHEME.length)

    for (const forbidden of ['#', '"', '\\', '<', '>', '\n', '\t'])
      expect(body).not.toContain(forbidden)
    expect(body).toContain('%25h')
  })

  it('reste compact : espaces, apostrophes inversées, points d’interrogation et caractères courants ne sont pas échappés', () => {
    const body = toBookmarklet('(function(){var a=[1,2];return a[0]+b.c&&d||e?`f`:g})()').slice(
      SCHEME.length,
    )

    expect(body).toBe('(function(){var a=[1,2];return a[0]+b.c&&d||e?`f`:g})();void 0')
  })

  it('ne commence pas par deux barres obliques (ce serait lu comme un hôte)', () => {
    expect(toBookmarklet('//commentaire\nvar x').slice(SCHEME.length).startsWith('//')).toBe(false)
  })

  it('ne garde pas de point-virgule en double à la fin', () => {
    expect(fromBookmarklet(toBookmarklet('f();;'))).toBe('f();void 0')
  })
})

describe('fromBookmarklet', () => {
  it('refuse une adresse qui n’est pas javascript:', () => {
    expect(() => fromBookmarklet('https://exemple.test')).toThrow('Pas une adresse javascript:')
  })
})
