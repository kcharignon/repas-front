// L'entrée dans le magasin (DRV-625) : le lien « Commencer mes courses » et le lien du panier, lus dans le texte de la page, sans requête.
// Le lien n'est suivi que s'il mène à une page de magasin du plan ; le rapport du diagnostic ne dit que des formes. Données inventées.
import { describe, expect, it, vi } from 'vitest'

import { ENTRY_WAIT_MS, entryFacts, LeclercAdapter, readEntry } from '../src/leclerc'
import { fakeSite, type Scripted } from './leclerc-helpers'

const HOME = { hostname: 'www.leclercdrive.fr', pathname: '/', protocol: 'https:', port: '' }
const STORE_ID = '000123'
const START = (href: string) => `<a class="btn" href="${href}">Commencer mes courses</a>`

describe('readEntry : le lien « Commencer mes courses »', () => {
  it.each([
    [
      'une adresse complète sur l’hôte du magasin',
      'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/',
    ],
    ['une adresse sans schéma', '//fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/'],
    ['une adresse relative à l’enseigne', '/magasin-000123-000123-Ville-Test/'],
    ['une adresse sans ville', 'https://fd0-courses.leclercdrive.fr/magasin-000123-000123/'],
    [
      'une adresse avec une entité HTML',
      'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/?a=1&amp;b=2',
    ],
  ])('suit %s', (_name, href) => {
    const reading = readEntry(START(href), HOME, STORE_ID)

    expect(reading).toMatchObject({
      kind: 'LINK',
      url: expect.stringMatching(/^https:\/\/[a-z0-9.-]+\.leclercdrive\.fr\/magasin-000123-000123/),
    })
  })

  it('trouve le lien même enveloppé, avec un point ou une flèche, ou dans un aria-label', () => {
    const href = 'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/'
    for (const html of [
      `<a href="${href}"><span>Commencer</span> mes   courses</a>`,
      `<a href="${href}">Commencer mes courses →</a>`,
      `<a href="${href}" aria-label="Commencer mes courses"><img alt=""></a>`,
      `<a href='${href}'>COMMENCER MES COURSES.</a>`,
    ]) {
      expect(readEntry(html, HOME, STORE_ID).kind).toBe('LINK')
    }
  })

  it('NONE : pas de lien (visiteur, page inattendue), un script ou un commentaire n’en fait pas un', () => {
    expect(readEntry('<p>Se connecter</p>', HOME, STORE_ID)).toEqual({ kind: 'NONE' })
    expect(
      readEntry(
        `<script>var a = '${START('/magasin-000123-000123-V/')}'</script><!-- ${START('/x')} -->`,
        HOME,
        STORE_ID,
      ),
    ).toEqual({ kind: 'NONE' })
  })

  it.each([
    ['un autre magasin', 'https://fd0-courses.leclercdrive.fr/magasin-999111-999111-Ville-Test/'],
    ['un autre site', 'https://exemple.invalid/magasin-000123-000123-Ville-Test/'],
    [
      'un hôte qui ressemble à Leclerc',
      'https://fd0-courses.leclercdrive.fr.exemple.invalid/magasin-000123-000123-Ville-Test/',
    ],
    ['le site mobile', 'https://m-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/'],
    ['une page qui n’est pas celle d’un magasin', 'https://fd0-courses.leclercdrive.fr/'],
    [
      'une adresse non sécurisée',
      'http://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/',
    ],
    [
      'un port inattendu',
      'https://fd0-courses.leclercdrive.fr:8443/magasin-000123-000123-Ville-Test/',
    ],
    [
      'un identifiant dans l’adresse',
      'https://nom:secret@fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/',
    ],
    ['un script', 'javascript:alert(1)'],
    ['rien', '#'],
    ['une barre oblique inverse', '/\\exemple.invalid/magasin-000123-000123-V/'],
  ])('REFUSED : %s', (_name, href) => {
    expect(readEntry(START(href), HOME, STORE_ID)).toEqual({ kind: 'REFUSED' })
  })

  it('REFUSED : un bouton sans adresse', () => {
    expect(readEntry('<a>Commencer mes courses</a>', HOME, STORE_ID)).toEqual({ kind: 'REFUSED' })
  })

  it('CHALLENGE : la page d’un défi de l’anti-robot, même avec un lien', () => {
    const page = `${START('/magasin-000123-000123-Ville-Test/')}<iframe src="https://geo.captcha-delivery.com/x"></iframe>`

    expect(readEntry(page, HOME, STORE_ID)).toEqual({ kind: 'CHALLENGE' })
  })

  it('un script de la page qui cite le service anti-robot n’est pas un défi', () => {
    const page = `<script src="https://ct.captcha-delivery.com/c.js"></script>${START('/magasin-000123-000123-Ville-Test/')}`

    expect(readEntry(page, HOME, STORE_ID).kind).toBe('LINK')
  })

  it('garde le schéma et le port de la page (faux site de test en HTTP)', () => {
    const page = { hostname: 'www.leclercdrive.fr', pathname: '/', protocol: 'http:', port: '8099' }
    const html = START('//fd0-courses.leclercdrive.fr:8099/magasin-000123-000123-Ville-Test/')

    expect(readEntry(html, page, STORE_ID)).toEqual({
      kind: 'LINK',
      url: 'http://fd0-courses.leclercdrive.fr:8099/magasin-000123-000123-Ville-Test/',
    })
  })
})

describe('entryFacts : les deux sondes du diagnostic, des formes seulement', () => {
  it('le lien « Commencer mes courses » : présent, la forme de son adresse, où elle mène', () => {
    const facts = entryFacts(
      START('https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/'),
      HOME,
    )

    expect(facts.start).toEqual({ present: true, shape: '/magasin-N-N-V/', where: 'LECLERC_HOST' })
    expect(facts.basket).toEqual({ present: false, shape: null, where: null })
  })

  it('le lien du panier : par son adresse ou par son libellé', () => {
    const byAddress = entryFacts(
      '<a href="/magasin-000123-000123-Ville-Test/panier.aspx?x=1">Voir</a>',
      HOME,
    )
    const byLabel = entryFacts('<a href="https://autre.invalid/p?a=1">Mon panier (3)</a>', HOME)

    expect(byAddress.basket).toEqual({
      present: true,
      shape: '/magasin-N-N-V/panier.aspx',
      where: 'RELATIVE',
    })
    expect(byLabel.basket).toEqual({ present: true, shape: '/…', where: 'OTHER_SITE' })
  })

  it('un bouton sans adresse est présent, sans forme', () => {
    expect(entryFacts('<a>Commencer mes courses</a>', HOME).start).toEqual({
      present: true,
      shape: null,
      where: null,
    })
  })

  it('même hôte que la page', () => {
    const page = { ...HOME, hostname: 'fd0-courses.leclercdrive.fr' }

    expect(
      entryFacts(START('https://fd0-courses.leclercdrive.fr/magasin-000123-000123-V/'), page).start
        .where,
    ).toBe('SAME_HOST')
  })

  it('ne dit ni numéro, ni ville, ni nom de dossier, ni libellé : une page hostile', () => {
    const page = `<a href="https://fd0-courses.leclercdrive.fr/magasin-000123-000456-Saint-Exemple-sur-Mer/Rue-Du-Secret-12/accueil.aspx?token=SECRET">Commencer mes courses</a>
      <a href="/Jean-Dupont-0612345678/panier.aspx?c=COOKIE">Mon panier</a>`

    const text = JSON.stringify(entryFacts(page, HOME))

    for (const secret of [
      '000123',
      '000456',
      'Saint',
      'Exemple',
      'Secret',
      'SECRET',
      'Dupont',
      '0612345678',
      'COOKIE',
      'token',
      'fd0',
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(JSON.parse(text)).toEqual({
      start: { present: true, shape: '/magasin-N-N-V/…/…', where: 'LECLERC_HOST' },
      basket: { present: true, shape: '/…/…', where: 'RELATIVE' },
    })
  })
})

describe('LeclercAdapter : suivre le lien', () => {
  const page = (html: string, navigate = vi.fn<(url: string) => void>()) => {
    const site = fakeSite(() => ({ body: 'x' }) satisfies Scripted, {
      location: HOME,
      pageText: () => html,
      navigate,
    })
    return { site, navigate, adapter: new LeclercAdapter(site.deps) }
  }
  const GOOD = START('https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/')

  it('suit l’adresse vérifiée après une pause entière, puis attend que la page parte', async () => {
    const { adapter, navigate, site } = page(GOOD)
    expect(adapter.readEntry({ id: STORE_ID }).kind).toBe('LINK')

    await adapter.followEntry()

    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/',
    )
    // Une pause de la cadence (800 ms au moins), puis le temps laissé à la page pour partir
    expect(site.sleeps[0]).toBeGreaterThanOrEqual(800)
    expect(site.sleeps.at(-1)).toBe(ENTRY_WAIT_MS)
    expect(site.calls).toEqual([])
  })

  it('ne suit rien sans lien vérifié, ni deux fois le même', async () => {
    const refused = page(START('https://exemple.invalid/magasin-000123-000123-V/'))
    expect(refused.adapter.readEntry({ id: STORE_ID }).kind).toBe('REFUSED')
    await refused.adapter.followEntry()
    expect(refused.navigate).not.toHaveBeenCalled()

    const once = page(GOOD)
    once.adapter.readEntry({ id: STORE_ID })
    await once.adapter.followEntry()
    await once.adapter.followEntry()
    expect(once.navigate).toHaveBeenCalledOnce()
  })

  it('le diagnostic lit les deux sondes, sans requête', () => {
    const { adapter, site } = page(
      `${GOOD}<a href="/magasin-000123-000123-Ville-Test/panier.aspx">Panier</a>`,
    )

    expect(adapter.readArrival().entry).toEqual({
      start: { present: true, shape: '/magasin-N-N-V/', where: 'LECLERC_HOST' },
      basket: { present: true, shape: '/magasin-N-N-V/panier.aspx', where: 'RELATIVE' },
    })
    expect(site.calls).toEqual([])
  })
})
