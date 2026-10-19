// Les photos des produits dans l'écran de choix et dans « Toujours prendre ce produit ? » (DRV-633). jsdom, sans réseau : on lit les balises créées,
// leurs attributs et ce qui se passe quand l'image ne charge pas.
import { afterEach, describe, expect, it } from 'vitest'

import { createUi, renderPicker, type PickerItem, type UiHandle } from '../src/ui'
import { MAX_PHOTOS } from '../src/ui/picker'
import { photoFrame } from '../src/ui/photo'

const GOOD = 'https://photos-test.leclercdrive.fr/image.ashx?id=11&use=l&cat=p'
const HOSTILE_LABEL = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>'

afterEach(() => {
  document.body.innerHTML = ''
})

const item = (n: number, extra: Partial<PickerItem> = {}): PickerItem => ({
  id: String(2000000 + n),
  name: `Produit de test ${n}`,
  label2: null,
  details: ['500 g', '2,58 €'],
  promo: null,
  explain: '500 g par produit : 2 produits.',
  state: 'ok',
  photo: `https://photos-test.leclercdrive.fr/image.ashx?id=${n}&use=l&cat=p`,
  ...extra,
})

function picker(items: PickerItem[]): HTMLElement {
  const zone = document.body.appendChild(document.createElement('div'))
  renderPicker(
    zone,
    {
      need: null,
      replaces: null,
      gone: [],
      checked: new Set(),
      query: 'poivre',
      items,
      notice: null,
    },
    { choose: () => undefined, search: () => undefined, never: () => undefined },
  )
  return zone
}

const rowsOf = (zone: HTMLElement) => [...zone.querySelectorAll<HTMLElement>('li.candidate')]
const imagesOf = (zone: HTMLElement) => [...zone.querySelectorAll('img')]

describe('la photo d’une fiche', () => {
  it('est une balise img créée par le DOM : adresse, texte alternatif = libellé, chargement différé, 80 px, à gauche du texte', () => {
    const zone = picker([item(1)])

    const [row] = rowsOf(zone)
    const image = row?.querySelector('img')
    expect(image?.getAttribute('src')).toBe(
      'https://photos-test.leclercdrive.fr/image.ashx?id=1&use=l&cat=p',
    )
    expect(image?.getAttribute('alt')).toBe('Produit de test 1')
    expect(image?.getAttribute('loading')).toBe('lazy')
    expect(image?.getAttribute('decoding')).toBe('async')
    expect(image?.getAttribute('width')).toBe('80')
    // Aucun réglage spécial : la requête est celle d'une image de la page elle-même.
    for (const name of ['referrerpolicy', 'crossorigin', 'srcset', 'sizes', 'fetchpriority']) {
      expect([name, image?.hasAttribute(name)]).toEqual([name, false])
    }
    // La photo précède le texte dans la ligne ; le bouton « Choisir » reste sous la fiche, sur toute sa largeur.
    const media = row?.querySelector('.media')
    expect(media?.firstElementChild?.classList.contains('photo')).toBe(true)
    expect(media?.lastElementChild?.classList.contains('text')).toBe(true)
    expect(row?.lastElementChild?.tagName).toBe('BUTTON')
  })

  it('le libellé hostile n’est que du texte : dans le texte alternatif comme dans la fiche', () => {
    const zone = picker([item(1, { name: HOSTILE_LABEL })])

    const image = zone.querySelector('img')
    expect(image?.getAttribute('alt')).toBe(HOSTILE_LABEL)
    expect(zone.querySelectorAll('img')).toHaveLength(1)
    expect(zone.querySelector('script')).toBeNull()
    expect(zone.querySelector('.name')?.textContent).toBe(HOSTILE_LABEL)
    expect((window as unknown as { pwned?: unknown }).pwned).toBeUndefined()
  })

  it('une image qui ne charge pas disparaît sans laisser de cadre, d’icône ni de message ; le choix reste possible', () => {
    const zone = picker([item(1), item(2)])
    const [first] = imagesOf(zone)

    first?.dispatchEvent(new Event('error'))

    const [row] = rowsOf(zone)
    expect(row?.querySelector('img')).toBeNull()
    expect(row?.querySelector('.photo')).toBeNull()
    expect(row?.textContent).toContain('Produit de test 1')
    expect(row?.querySelector('button')?.disabled).toBe(false)
    // Les autres fiches gardent la leur.
    expect(imagesOf(zone)).toHaveLength(1)
    expect(zone.querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(true)
  })

  it.each([
    ['sans photo', undefined],
    ['sans photo (null)', null],
    ['une adresse d’un autre hôte', 'https://images.autre-site.invalid/a.jpg'],
    ['une adresse javascript:', 'javascript:alert(1)'],
    ['une adresse data:', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['une adresse http', 'http://photos-test.leclercdrive.fr/a.jpg'],
    ['une adresse avec identifiant', 'https://user@photos-test.leclercdrive.fr/a.jpg'],
    ['une adresse avec port', 'https://photos-test.leclercdrive.fr:8443/a.jpg'],
    ['une adresse relative (jamais résolue ici)', '/images/a.jpg'],
  ] as const)('%s : la fiche reste en texte, sans balise img', (_name, photo) => {
    const zone = picker([item(1, { photo })])

    const [row] = rowsOf(zone)
    expect(row?.querySelector('img')).toBeNull()
    expect(row?.querySelector('.photo')).toBeNull()
    expect(row?.textContent).toContain('Produit de test 1')
  })

  it('le picker revérifie l’adresse même si l’appelant la croit sûre', () => {
    const zone = picker([item(1, { photo: 'https://leclercdrive.fr.autre-site.invalid/a.jpg' })])

    expect(imagesOf(zone)).toHaveLength(0)
  })
})

describe('au plus 12 photos', () => {
  it('seuls les 12 premiers produits ont leur photo, les suivants restent en texte', () => {
    const zone = picker(Array.from({ length: 15 }, (_, index) => item(index + 1)))

    expect(MAX_PHOTOS).toBe(12)
    expect(rowsOf(zone)).toHaveLength(15)
    expect(imagesOf(zone)).toHaveLength(12)
    const withPhoto = rowsOf(zone).map((row) => row.querySelector('img') !== null)
    expect(withPhoto.slice(0, 12).every(Boolean)).toBe(true)
    expect(withPhoto.slice(12).some(Boolean)).toBe(false)
  })

  it('une nouvelle liste (autre recherche) remplace les photos, toujours 12 au plus', () => {
    const zone = document.body.appendChild(document.createElement('div'))
    const shown = renderPicker(
      zone,
      {
        need: null,
        replaces: null,
        gone: [],
        checked: new Set(),
        query: 'a',
        items: [item(1)],
        notice: null,
      },
      { choose: () => undefined, search: () => undefined, never: () => undefined },
    )

    shown.results(
      'b',
      Array.from({ length: 14 }, (_, index) => item(index + 100)),
      null,
    )

    expect(imagesOf(zone)).toHaveLength(12)
  })
})

describe('photoFrame', () => {
  it('rend null pour une adresse refusée (aucun nœud, aucune erreur)', () => {
    expect(photoFrame('javascript:alert(1)', 'x')).toBeNull()
    expect(photoFrame(undefined, 'x')).toBeNull()
  })

  it('pose l’écouteur d’erreur avant l’adresse et ne met aucun gestionnaire en attribut', () => {
    const frame = photoFrame(GOOD, 'Poivre')
    const image = frame?.querySelector('img')

    expect(frame?.className).toBe('photo')
    expect(image?.getAttributeNames().filter((name) => name.startsWith('on'))).toEqual([])
    expect(frame?.outerHTML).not.toContain('onerror')
  })
})

describe('« Toujours prendre ce produit ? »', () => {
  let ui: UiHandle | null = null
  afterEach(() => {
    ui?.close()
    ui = null
  })
  const shadow = () => (ui?.host?.shadowRoot ?? null) as ShadowRoot

  it('montre la photo du produit choisi à côté de son libellé', () => {
    ui = createUi({ mode: 'open' })
    void ui.show('placement', {
      ingredient: 'Farine',
      productLabel: 'Farine de test 1 kg',
      photo: GOOD,
    })

    const image = shadow().querySelector('.media img')
    expect(image?.getAttribute('src')).toBe(GOOD)
    expect(image?.getAttribute('alt')).toBe('Farine de test 1 kg')
    expect(shadow().querySelector('.media .text')?.textContent).toContain('Farine de test 1 kg')
  })

  it.each([
    undefined,
    null,
    'https://images.autre-site.invalid/a.jpg',
    'data:image/png;base64,AA==',
  ])('sans photo ou avec une adresse refusée (%s) : la question reste en texte', (photo) => {
    ui = createUi({ mode: 'open' })
    void ui.show('placement', { ingredient: 'Farine', productLabel: 'Farine de test 1 kg', photo })

    expect(shadow().querySelector('img')).toBeNull()
    expect(shadow().querySelector('h1')?.textContent).toBe('Toujours prendre ce produit ?')
  })
})
