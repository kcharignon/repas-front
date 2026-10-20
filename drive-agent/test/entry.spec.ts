// L'entrée dans le magasin (DRV-625) : le lien « Commencer mes courses » et le lien du panier, lus dans le texte de la page, sans requête.
// Le lien n'est suivi que s'il mène à une page de magasin du plan ; le rapport du diagnostic ne dit que des formes. Données inventées.
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ENTRY_WAIT_MS,
  entryFacts,
  findStartButton,
  LeclercAdapter,
  readEntry,
} from '../src/leclerc'
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
    ['une adresse de messagerie', 'mailto:moi@exemple.invalid'],
    ['une page de données', 'data:text/html,x'],
    ['une barre oblique inverse', '/\\exemple.invalid/magasin-000123-000123-V/'],
  ])('REFUSED : %s', (_name, href) => {
    expect(readEntry(START(href), HOME, STORE_ID)).toEqual({ kind: 'REFUSED' })
  })

  it.each([
    ['un lien sans adresse', '<a class="btn">Commencer mes courses</a>'],
    ['une adresse vide', '<a href="">Commencer mes courses</a>'],
    ['une ancre', '<a href="#">Commencer mes courses</a>'],
    ['un script', '<a href="javascript:void(0)">Commencer mes courses</a>'],
    ['un script en majuscules', '<a href="JavaScript:__doPostBack(1)">Commencer mes courses</a>'],
    ['un vrai bouton', '<button type="button" class="btn">Commencer mes courses</button>'],
    ['un bouton de formulaire', '<input type="submit" value="Commencer mes courses">'],
    [
      'un bouton à l’étiquette d’accessibilité',
      '<a role="button" aria-label="Commencer mes courses"><i></i></a>',
    ],
  ])('BUTTON : %s (le bouton du vrai site n’a pas d’adresse)', (_name, html) => {
    expect(readEntry(html, HOME, STORE_ID)).toEqual({ kind: 'BUTTON' })
  })

  it('BUTTON : sans lien à suivre, quelle que soit l’adresse que le script porte', () => {
    const html =
      '<a onclick="location=\'https://exemple.invalid/magasin-000123-000123-V/\'">Commencer mes courses</a>'

    expect(readEntry(html, HOME, STORE_ID)).toEqual({ kind: 'BUTTON' })
  })

  it('NONE : un bouton d’un autre libellé, un champ de texte, un libellé qui est une phrase', () => {
    for (const html of [
      '<button>Continuer</button>',
      '<input type="text" value="Commencer mes courses">',
      `<button>${'Commencer mes courses '.repeat(5)}</button>`,
    ]) {
      expect(readEntry(html, HOME, STORE_ID)).toEqual({ kind: 'NONE' })
    }
  })

  it('CHALLENGE : la page d’un défi de l’anti-robot, même avec un bouton', () => {
    const page = `<a role="button">Commencer mes courses</a><iframe src="https://geo.captcha-delivery.com/x"></iframe>`

    expect(readEntry(page, HOME, STORE_ID)).toEqual({ kind: 'CHALLENGE' })
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

describe('readEntry : « choisir mon magasin » (aller droit à l’accueil du magasin du plan)', () => {
  const STORE = 'https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/'
  const link = (href: string, label = 'Mon magasin') => `<a href="${href}">${label}</a>`

  it('suit un lien vers l’accueil du magasin du plan, même sans « Commencer mes courses »', () => {
    expect(readEntry(link(STORE), HOME, STORE_ID)).toEqual({ kind: 'LINK', url: STORE })
    expect(readEntry(link('/magasin-000123-000456-Autre-Ville'), HOME, STORE_ID)).toEqual({
      kind: 'LINK',
      url: 'https://www.leclercdrive.fr/magasin-000123-000456-Autre-Ville',
    })
  })

  it.each([
    [
      'un autre magasin',
      link('https://fd0-courses.leclercdrive.fr/magasin-000002-000002-Ville-Test/'),
    ],
    [
      'un magasin sans ville (page 404 du vrai site)',
      link('https://fd0-courses.leclercdrive.fr/magasin-000123-000123/'),
    ],
    ['une page du magasin qui n’est pas son accueil', link(`${STORE}panier.aspx`)],
    ['une adresse avec paramètres', link(`${STORE}?x=1`)],
    ['un autre site', link('https://exemple.invalid/magasin-000123-000123-Ville-Test/')],
    ['le site mobile', link('https://m-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/')],
    [
      'une adresse avec identifiant',
      link('https://u:p@fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/'),
    ],
    [
      'un script',
      '<script>var a = "<a href=\'/magasin-000123-000123-Ville-Test/\'>x</a>"</script>',
    ],
  ])('ne suit pas %s', (_name, html) => {
    expect(readEntry(html, HOME, STORE_ID)).toEqual({ kind: 'NONE' })
  })

  it('« Commencer mes courses » garde la priorité sur un lien de magasin', () => {
    const html = `${link(STORE)}<a>Commencer mes courses</a>`

    expect(readEntry(html, HOME, STORE_ID)).toEqual({ kind: 'BUTTON' })
  })
})

describe('entryFacts : les deux sondes du diagnostic, des formes seulement', () => {
  it('le lien « Commencer mes courses » : présent, la forme de son adresse, où elle mène ; pas un bouton', () => {
    const facts = entryFacts(
      START('https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/'),
      HOME,
    )

    expect(facts.start).toEqual({ present: true, shape: '/magasin-N-N-V/', where: 'LECLERC_HOST' })
    expect(facts.clickable).toBe(false)
  })

  it('un bouton sans adresse est présent, sans forme, et cliquable', () => {
    for (const html of [
      '<a>Commencer mes courses</a>',
      '<a href="javascript:go()">Commencer mes courses</a>',
      '<button>Commencer mes courses</button>',
    ]) {
      expect(entryFacts(html, HOME)).toEqual({
        start: { present: true, shape: null, where: null },
        clickable: true,
      })
    }
  })

  it('absent : ni présent, ni cliquable', () => {
    expect(entryFacts('<p>Se connecter</p>', HOME)).toEqual({
      start: { present: false, shape: null, where: null },
      clickable: false,
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
      <a href="/Jean-Dupont-0612345678/panier.aspx?c=COOKIE">Mon panier</a>
      <button onclick="go('/Marie-Martin-0698765432')">Mon compte COOKIE</button>`

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
      clickable: false,
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

  it('le diagnostic lit « Commencer mes courses », sans requête', () => {
    const { adapter, site } = page(GOOD)

    expect(adapter.readArrival().entry).toEqual({
      start: { present: true, shape: '/magasin-N-N-V/', where: 'LECLERC_HOST' },
      clickable: false,
    })
    expect(site.calls).toEqual([])
  })
})

describe('LeclercAdapter : un bouton que seul le DOM montre', () => {
  it('le texte de la page n’en montre pas, le DOM oui : BUTTON, cliqué comme les autres', async () => {
    const click = vi.fn<() => void>()
    const site = fakeSite(() => ({ body: 'x' }) satisfies Scripted, {
      location: HOME,
      pageText: () => '<p>Bonjour</p>',
      startButton: () => ({ click }),
    })
    const adapter = new LeclercAdapter(site.deps)

    expect(adapter.readEntry({ id: STORE_ID })).toEqual({ kind: 'BUTTON' })
    await adapter.followEntry()

    expect(click).toHaveBeenCalledOnce()
    expect(site.sleeps.at(-1)).toBe(ENTRY_WAIT_MS)
    expect(ENTRY_WAIT_MS).toBeLessThanOrEqual(3_000)
    expect(site.calls).toEqual([])
  })

  it('ni le texte ni le DOM : NONE', () => {
    const site = fakeSite(() => ({ body: 'x' }) satisfies Scripted, {
      location: HOME,
      pageText: () => '<p>Bonjour</p>',
      startButton: () => null,
    })

    expect(new LeclercAdapter(site.deps).readEntry({ id: STORE_ID })).toEqual({ kind: 'NONE' })
  })
})

describe('LeclercAdapter : cliquer le bouton (DRV-629)', () => {
  const BUTTON = '<a class="btn" role="button">Commencer mes courses</a>'
  const page = (
    html: string,
    startButton: (() => { click: () => void } | null) | undefined,
    navigate = vi.fn<(url: string) => void>(),
  ) => {
    const site = fakeSite(() => ({ body: 'x' }) satisfies Scripted, {
      location: HOME,
      pageText: () => html,
      navigate,
      ...(startButton && { startButton }),
    })
    return { site, navigate, adapter: new LeclercAdapter(site.deps) }
  }

  it('clique le bouton après une pause entière, puis attend que la page parte', async () => {
    const click = vi.fn<() => void>()
    const { adapter, site, navigate } = page(BUTTON, () => ({ click }))
    expect(adapter.readEntry({ id: STORE_ID })).toEqual({ kind: 'BUTTON' })

    await adapter.followEntry()

    expect(click).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
    expect(site.sleeps[0]).toBeGreaterThanOrEqual(800)
    expect(site.sleeps.at(-1)).toBe(ENTRY_WAIT_MS)
    expect(site.calls).toEqual([])
  })

  it('ne clique jamais deux fois le même bouton', async () => {
    const click = vi.fn<() => void>()
    const { adapter } = page(BUTTON, () => ({ click }))
    adapter.readEntry({ id: STORE_ID })

    await adapter.followEntry()
    await adapter.followEntry()

    expect(click).toHaveBeenCalledOnce()
  })

  it('REFUSED : le texte dit « bouton » mais le DOM n’en donne pas un à toucher (ou ne sait pas)', async () => {
    for (const startButton of [() => null, undefined]) {
      const { adapter, site } = page(BUTTON, startButton)

      expect(adapter.readEntry({ id: STORE_ID })).toEqual({ kind: 'REFUSED' })
      await adapter.followEntry()

      expect(site.sleeps).toEqual([])
    }
  })

  it('REFUSED : le DOM qui lève une erreur n’arrête rien', () => {
    const { adapter } = page(BUTTON, () => {
      throw new Error('DOM illisible')
    })

    expect(adapter.readEntry({ id: STORE_ID })).toEqual({ kind: 'REFUSED' })
  })

  it('un lien vérifié reste suivi par son adresse, pas cliqué', async () => {
    const click = vi.fn<() => void>()
    const { adapter, navigate } = page(
      START('https://fd0-courses.leclercdrive.fr/magasin-000123-000123-Ville-Test/'),
      () => ({ click }),
    )
    expect(adapter.readEntry({ id: STORE_ID }).kind).toBe('LINK')

    await adapter.followEntry()

    expect(navigate).toHaveBeenCalledOnce()
    expect(click).not.toHaveBeenCalled()
  })

  it('le diagnostic : cliquable oui quand le DOM donne le bouton, non sinon', () => {
    const yes = page(BUTTON, () => ({ click: () => undefined }))
    const no = page(BUTTON, () => null)

    expect(yes.adapter.readArrival().entry).toEqual({
      start: { present: true, shape: null, where: null },
      clickable: true,
    })
    expect(no.adapter.readArrival().entry?.clickable).toBe(false)
    expect(yes.site.calls).toEqual([])
  })
})

describe('findStartButton : le bouton dans le DOM', () => {
  const dom = (html: string) => {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.append(root)
    return root
  }
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it.each([
    ['un lien sans adresse', '<a id="b">Commencer mes courses</a>'],
    ['une ancre', '<a id="b" href="#">Commencer mes courses</a>'],
    ['un script', '<a id="b" href="javascript:void(0)">Commencer mes courses</a>'],
    ['un bouton', '<button id="b" type="button"><span>Commencer</span> mes courses →</button>'],
    ['un bouton de formulaire', '<input id="b" type="submit" value="COMMENCER MES COURSES">'],
    [
      'un élément à rôle de bouton',
      '<div id="b" role="button" title="Commencer mes courses"></div>',
    ],
  ])('trouve %s et le clique', (_name, html) => {
    const root = dom(html)
    const clicks = vi.fn<() => void>()
    root.querySelector('#b')?.addEventListener('click', clicks)

    const button = findStartButton(root)
    button?.click()

    expect(button).not.toBeNull()
    expect(clicks).toHaveBeenCalledOnce()
  })

  it('ne trouve ni un vrai lien, ni un bouton désactivé, ni un autre libellé, ni une phrase', () => {
    for (const html of [
      '<a href="https://fd0-courses.leclercdrive.fr/magasin-000123-000123-V/">Commencer mes courses</a>',
      '<a href="/magasin-000123-000123-V/">Commencer mes courses</a>',
      '<button disabled>Commencer mes courses</button>',
      '<button aria-disabled="true">Commencer mes courses</button>',
      '<button>Continuer</button>',
      `<div role="button">${'Commencer mes courses '.repeat(4)}</div>`,
      '<span>Commencer mes courses</span>',
      '',
    ]) {
      expect(findStartButton(dom(html))).toBeNull()
      document.body.innerHTML = ''
    }
  })

  it.each([
    ['un div à gestionnaire de clic', '<div id="b" onclick="void 0">Commencer mes courses</div>'],
    ['un span qui prend le focus', '<span id="b" tabindex="0">Commencer mes courses</span>'],
    [
      'un élément au curseur « main »',
      '<p id="b" style="cursor:pointer">Commencer mes courses</p>',
    ],
  ])('trouve %s, faute de lien ou de bouton, et le clique', (_name, html) => {
    const root = dom(html)
    const clicks = vi.fn<() => void>()
    root.querySelector('#b')?.addEventListener('click', clicks)

    findStartButton(root)?.click()

    expect(clicks).toHaveBeenCalledOnce()
  })

  it('touche l’élément le plus profond, jamais son conteneur, et jamais un élément sans signe de clic', () => {
    const root = dom(
      '<div id="o" onclick="void 0"><span id="b" style="cursor:pointer">Commencer mes courses</span></div>',
    )
    const clicked: string[] = []
    for (const id of ['o', 'b']) {
      root.querySelector(`#${id}`)?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) clicked.push(id)
      })
    }

    findStartButton(root)?.click()

    expect(clicked).toEqual(['b'])
    document.body.innerHTML = ''
    expect(
      findStartButton(dom('<div><span>Commencer mes courses</span><p>Autre chose</p></div>')),
    ).toBeNull()
  })

  it('de plusieurs, préfère celui qui est affiché', () => {
    const root = dom(
      '<a id="cache">Commencer mes courses</a><a id="visible">Commencer mes courses</a>',
    )
    const clicked: string[] = []
    for (const id of ['cache', 'visible']) {
      const element = root.querySelector<HTMLElement>(`#${id}`)
      element?.addEventListener('click', () => clicked.push(id))
      // jsdom ne mesure rien : on dit lequel est affiché
      if (element)
        element.getClientRects = () => (id === 'visible' ? [{}] : []) as unknown as DOMRectList
    }

    findStartButton(root)?.click()

    expect(clicked).toEqual(['visible'])
  })
})
