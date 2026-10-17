import { beforeEach, describe, expect, it } from 'vitest'

import { makeFragment } from '../fragment'
import { metaPolicies, probeLines } from '../probe'
import type { PageWindow } from '../env'

/** Une fenêtre de test : le `window` de jsdom avec une adresse, des cookies et un navigateur inventés. */
function windowAt(
  url: string,
  options: { cookie?: string; wakeLock?: boolean; framed?: boolean } = {},
): PageWindow {
  const { origin, host, pathname, hash } = new URL(url)
  const doc = document
  Object.defineProperty(doc, 'cookie', { value: options.cookie ?? '', configurable: true })
  const navigator = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Telephone Test) Chrome/130.0',
    ...(options.wakeLock === false ? {} : { wakeLock: {} }),
  }
  return {
    location: { origin, host, pathname, hash },
    navigator,
    screen: { width: 412, height: 915 },
    innerWidth: 412,
    innerHeight: 780,
    devicePixelRatio: 2.6,
    isSecureContext: true,
    document: doc,
    top: options.framed ? ({} as Window) : undefined,
  } as unknown as PageWindow
}

function pageWithTop(win: PageWindow): PageWindow {
  if (win.top === undefined) Object.defineProperty(win, 'top', { value: win })
  return win
}

describe('probeLines', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = '<p>Page</p>'
  })

  it('décrit l’hôte, le magasin et l’environnement', () => {
    // Given
    const win = pageWithTop(
      windowAt('https://fd9-courses.leclercdrive.fr/magasin-999111-999111/accueil.aspx'),
    )

    // When
    const { lines, store } = probeLines(win)
    const text = lines.join('\n')

    // Then
    expect(store?.id).toBe('999111')
    expect(text).toContain('Hôte : fd9-courses.leclercdrive.fr')
    expect(text).toContain('Hôte de Leclerc Drive : oui')
    expect(text).toContain('Chemin : /magasin-999111-999111/accueil.aspx')
    expect(text).toContain(
      "Magasin lu dans l'adresse : 999111 (début d'adresse : magasin-999111-999111)",
    )
    expect(text).toContain(
      'Agent utilisateur : Mozilla/5.0 (Linux; Android 14; Telephone Test) Chrome/130.0',
    )
    expect(text).toContain('Écran : 412 x 915 ; fenêtre : 412 x 780 ; ratio : 2.6')
    expect(text).toContain('Contexte sécurisé (https) : oui')
    expect(text).toContain('Wake Lock (écran allumé) disponible : oui')
    expect(text).toContain('Page dans un cadre : non')
    expect(text).toContain("Fragment du banc dans l'adresse : aucun")
  })

  it('ne dit du cookie datadome que s’il est visible, jamais sa valeur', () => {
    const present = probeLines(
      pageWithTop(
        windowAt('https://h.example/magasin-1-1/', {
          cookie: 'datadome=valeur-secrete-xyz; autre=1',
        }),
      ),
    ).lines.join('\n')
    const absent = probeLines(
      pageWithTop(windowAt('https://h.example/magasin-1-1/', { cookie: 'autre=1' })),
    ).lines.join('\n')

    expect(present).toContain('Cookie « datadome » visible par la page : oui')
    expect(absent).toContain('Cookie « datadome » visible par la page : non')
    expect(present).not.toContain('valeur-secrete-xyz')
    expect(present).not.toContain('autre')
  })

  it('lit le point de livraison de la page quand il s’y trouve', () => {
    document.body.innerHTML = '<script>var c = {"sNoPointLivraison":"555222"}</script>'

    const text = probeLines(
      pageWithTop(windowAt('https://h.example/magasin-999111-999111/')),
    ).lines.join('\n')

    expect(text).toContain('Point de livraison (sNoPointLivraison) trouvé dans la page : 555222')
  })

  it('dit quand la page n’est pas une page de magasin et quand le Wake Lock manque', () => {
    const { lines, store } = probeLines(
      pageWithTop(windowAt('https://kantin.eu/liste', { wakeLock: false })),
    )
    const text = lines.join('\n')

    expect(store).toBeNull()
    expect(text).toContain('Hôte de Leclerc Drive : non')
    expect(text).toContain("Magasin lu dans l'adresse : aucun")
    expect(text).toContain('Wake Lock (écran allumé) disponible : non')
  })

  it('dit quand la page est dans un cadre', () => {
    const text = probeLines(
      windowAt('https://h.example/magasin-1-1/', { framed: true }),
    ).lines.join('\n')

    expect(text).toContain('Page dans un cadre : oui')
  })

  it('rapporte la politique de sécurité d’une balise meta, sinon dit qu’il n’y en a pas', () => {
    expect(
      probeLines(pageWithTop(windowAt('https://h.example/magasin-1-1/'))).lines.join('\n'),
    ).toContain('Politique de sécurité dans une balise <meta http-equiv> : aucune.')

    document.head.innerHTML =
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'"><meta http-equiv="refresh" content="30">'
    const text = probeLines(pageWithTop(windowAt('https://h.example/magasin-1-1/'))).lines.join(
      '\n',
    )

    expect(text).toContain(
      "Politique de sécurité (balise meta 1) : default-src 'self'; script-src 'self'",
    )
    expect(text).not.toContain('refresh')
  })

  it('relit le fragment du banc arrivé dans l’adresse', () => {
    const win = pageWithTop(windowAt(`https://kantin.eu/#lab=${makeFragment(6144)}`))

    expect(probeLines(win).lines.join('\n')).toContain(
      "Fragment du banc dans l'adresse : 6144 caractères reçus, contenu intact",
    )
  })
})

describe('metaPolicies', () => {
  it('liste les politiques déclarées, quelle que soit la casse', () => {
    document.head.innerHTML = '<meta http-equiv="content-security-policy" content="img-src *">'

    expect(metaPolicies(document)).toEqual(['img-src *'])
  })
})
