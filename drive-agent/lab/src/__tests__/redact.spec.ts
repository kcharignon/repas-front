import { describe, expect, it } from 'vitest'

import { hasCookie, isSensitiveKey, maskEmails, maskStore, shorten } from '../redact'
import {
  cartAddressNote,
  cartUrl,
  findDeliveryPoint,
  fragmentTargetUrl,
  isLeclercHost,
  parseStore,
  searchUrl,
  type StoreInfo,
} from '../store'

const CITY_PATH = '/magasin-123456-123456-Ville-Test/recherche.aspx'

const LOCATION = {
  origin: 'https://fd9-courses.example',
  host: 'fd9-courses.example',
  pathname: '/magasin-999111-999111/recherche.aspx',
}

describe('hasCookie', () => {
  it('dit seulement si le cookie existe', () => {
    expect(hasCookie('a=1; datadome=abc123; b=2', 'datadome')).toBe(true)
    expect(hasCookie('datadome=abc123', 'DataDome')).toBe(true)
    expect(hasCookie('a=1; b=2', 'datadome')).toBe(false)
    expect(hasCookie('', 'datadome')).toBe(false)
  })

  it('ne confond pas un cookie qui contient le nom avec lui', () => {
    expect(hasCookie('not-datadome=1; datadome2=2', 'datadome')).toBe(false)
  })

  it('renvoie un booléen, jamais la valeur', () => {
    const answer = hasCookie('datadome=valeur-secrete', 'datadome')

    expect(typeof answer).toBe('boolean')
    expect(String(answer)).not.toContain('secrete')
  })
})

describe('maskEmails et shorten', () => {
  it('masque les adresses e-mail', () => {
    expect(maskEmails('écris à prenom.nom@exemple.fr ou a@b.org !')).toBe(
      'écris à [adresse e-mail masquée] ou [adresse e-mail masquée] !',
    )
  })

  it('raccourcit sur une ligne', () => {
    expect(shorten('a\n  b   c')).toBe('a b c')
    expect(shorten('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`)
    expect(shorten(42)).toBe('42')
  })
})

describe('isSensitiveKey', () => {
  it.each([
    'Cookie',
    'sJeton',
    'accessToken',
    'sEmailClient',
    'sMotDePasse',
    'password',
    'sIdSession',
    'sPrenom',
    'sNom',
    'sNoPointLivraison',
  ])('reconnaît %s', (key) => {
    expect(isSensitiveKey(key)).toBe(true)
  })

  it.each(['iIdProduit', 'nrTotal', 'sNomEvenement', 'eTypeEvenement', 'sLibelleLigne1'])(
    'laisse %s',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false)
    },
  )
})

describe('parseStore et adresses', () => {
  it('lit le magasin dans l’adresse', () => {
    expect(parseStore(LOCATION)).toEqual({
      host: 'fd9-courses.example',
      origin: 'https://fd9-courses.example',
      id: '999111',
      second: '999111',
      basePath: '/magasin-999111-999111',
      secondId: '999111',
      city: null,
      cartPath: '/magasin-999111-999111',
    })
  })

  it('sépare le nom de ville du panier : deux nombres, puis un suffixe facultatif', () => {
    const store = parseStore({ ...LOCATION, pathname: CITY_PATH }) as StoreInfo

    expect(store).toMatchObject({
      id: '123456',
      second: '123456-Ville-Test',
      secondId: '123456',
      city: 'Ville-Test',
      basePath: '/magasin-123456-123456-Ville-Test',
      cartPath: '/magasin-123456-123456',
    })
    expect(cartUrl(store)).toBe(
      'https://fd9-courses.example/magasin-123456-123456/panier.aspx?op=1',
    )
    expect(cartAddressNote(store)).toBe('Adresse du panier : sans suffixe de ville')
  })

  it('garde l’adresse des pages de recherche avec le nom de ville', () => {
    const store = parseStore({ ...LOCATION, pathname: CITY_PATH }) as StoreInfo

    expect(searchUrl(store, 'farine')).toBe(
      'https://fd9-courses.example/magasin-123456-123456-Ville-Test/recherche.aspx?TexteRecherche=farine',
    )
  })

  it('garde deux identifiants différents dans l’adresse du panier', () => {
    const store = parseStore({
      ...LOCATION,
      pathname: '/magasin-123456-654321-Ville-Test/recherche.aspx',
    }) as StoreInfo

    expect(store.secondId).toBe('654321')
    expect(cartUrl(store)).toContain('/magasin-123456-654321/panier.aspx?op=1')
  })

  it('n’invente rien quand la page n’a pas de nom de ville', () => {
    const store = parseStore({ ...LOCATION, pathname: '/magasin-123456-123456/recherche.aspx' })

    expect(store).toMatchObject({ city: null, cartPath: '/magasin-123456-123456' })
  })

  it('garde le segment complet et le dit quand la forme n’est pas « deux nombres »', () => {
    const store = parseStore({
      ...LOCATION,
      pathname: '/magasin-123456-Ville-Test/recherche.aspx',
    }) as StoreInfo

    expect(store).toMatchObject({ secondId: null, city: null })
    expect(cartUrl(store)).toBe(
      'https://fd9-courses.example/magasin-123456-Ville-Test/panier.aspx?op=1',
    )
    expect(cartAddressNote(store)).toBe('Adresse du panier : segment complet (forme inattendue)')
  })

  it('accepte un nom de ville décoratif à la place du second identifiant', () => {
    const store = parseStore({
      ...LOCATION,
      pathname: '/magasin-999111-Ville-Inventee/accueil.aspx',
    })

    expect(store?.second).toBe('Ville-Inventee')
    expect(store?.basePath).toBe('/magasin-999111-Ville-Inventee')
  })

  it.each(['/', '/accueil.aspx', '/magasin-abc-def/', '/autre/magasin-1-2/'])(
    'ne reconnaît pas %s',
    (pathname) => {
      expect(parseStore({ ...LOCATION, pathname })).toBeNull()
    },
  )

  it('construit les adresses du magasin sur l’hôte courant', () => {
    const store = parseStore(LOCATION) as StoreInfo

    expect(searchUrl(store, 'huile d’olive & sel')).toBe(
      'https://fd9-courses.example/magasin-999111-999111/recherche.aspx?TexteRecherche=huile%20d%E2%80%99olive%20%26%20sel',
    )
    expect(cartUrl(store)).toBe(
      'https://fd9-courses.example/magasin-999111-999111/panier.aspx?op=1',
    )
    expect(fragmentTargetUrl(store, 'abc')).toBe(
      'https://fd9-courses.example/magasin-999111-999111/recherche.aspx?TexteRecherche=farine#lab=abc',
    )
  })

  it('lit le point de livraison dans la page, à défaut dans l’adresse', () => {
    const store = parseStore(LOCATION) as StoreInfo

    expect(findDeliveryPoint('{"sNoPointLivraison":"555222"}', store)).toEqual({
      value: '555222',
      from: 'page',
    })
    expect(findDeliveryPoint("var x = {sNoPointLivraison: '555222'}", store).value).toBe('555222')
    expect(findDeliveryPoint('<html></html>', store)).toEqual({ value: '999111', from: 'adresse' })
  })

  it('reconnaît les hôtes de Leclerc Drive', () => {
    expect(isLeclercHost('fd9-courses.leclercdrive.fr')).toBe(true)
    expect(isLeclercHost('www.leclercdrive.fr:443')).toBe(true)
    expect(isLeclercHost('leclercdrive.fr.example.org')).toBe(false)
    expect(isLeclercHost('kantin.eu')).toBe(false)
  })
})

describe('maskStore', () => {
  const store = parseStore(LOCATION) as StoreInfo

  it('masque le début d’adresse et les numéros du magasin', () => {
    const text =
      'Chemin : /magasin-999111-999111/recherche.aspx\nMagasin : 999111 (point 999111)\nProduit 1999111 et 99911'

    expect(maskStore(text, store)).toBe(
      'Chemin : /magasin-[masqué]/recherche.aspx\nMagasin : [n° magasin] (point [n° magasin])\nProduit 1999111 et 99911',
    )
  })

  it('masque aussi un nom de ville de l’adresse, brut ou décodé', () => {
    const withCity = parseStore({
      ...LOCATION,
      pathname: '/magasin-999111-Vil%C3%A9/accueil.aspx',
    }) as StoreInfo

    expect(
      maskStore('/magasin-999111-Vil%C3%A9/accueil.aspx et magasin-999111-Vilé', withCity),
    ).toBe('/magasin-[masqué]/accueil.aspx et magasin-[masqué]')
  })

  it('masque le segment complet, le segment court du panier et le nom de ville seul', () => {
    const withCity = parseStore({ ...LOCATION, pathname: CITY_PATH }) as StoreInfo
    const text = [
      'Chemin : /magasin-123456-123456-Ville-Test/recherche.aspx',
      'Panier : /magasin-123456-123456/panier.aspx?op=1',
      'Ville : Ville-Test, ville-test',
      'Point : 123456',
    ].join('\n')

    const masked = maskStore(text, withCity)

    expect(masked).toBe(
      [
        'Chemin : /magasin-[masqué]/recherche.aspx',
        'Panier : /magasin-[masqué]/panier.aspx?op=1',
        'Ville : [ville], [ville]',
        'Point : [n° magasin]',
      ].join('\n'),
    )
    expect(masked).not.toMatch(/Ville-Test|123456/i)
  })

  it('masque le nom de ville encodé, et un second identifiant différent du premier', () => {
    const withCity = parseStore({
      ...LOCATION,
      pathname: '/magasin-123456-654321-Vil%C3%A9/recherche.aspx',
    }) as StoreInfo

    expect(maskStore('Vilé et Vil%C3%A9, magasin 654321 et 123456', withCity)).toBe(
      '[ville] et [ville], magasin [n° magasin] et [n° magasin]',
    )
  })

  it('ne masque pas seul un nom de ville de moins de trois lettres', () => {
    const tiny = parseStore({
      ...LOCATION,
      pathname: '/magasin-123456-123456-Ab/recherche.aspx',
    }) as StoreInfo

    expect(maskStore('Ab /magasin-123456-123456-Ab/x', tiny)).toBe('Ab /magasin-[masqué]/x')
  })

  it('masque aussi les numéros supplémentaires demandés, par exemple le point de livraison', () => {
    const withCity = parseStore({ ...LOCATION, pathname: CITY_PATH }) as StoreInfo

    expect(maskStore('sIdUnique=Panier654321 ; point 654321 ; 6543210', withCity, ['654321'])).toBe(
      'sIdUnique=Panier[n° magasin] ; point [n° magasin] ; 6543210',
    )
    expect(maskStore('Panier123', withCity, ['123'])).toBe('Panier123')
  })

  it('masque un numéro écrit sans ses zéros de tête', () => {
    const padded = parseStore({
      ...LOCATION,
      pathname: '/magasin-001234-001234-Ville-Test/recherche.aspx',
    }) as StoreInfo

    expect(maskStore('sIdUnique=Panier1234 et Panier001234', padded)).toBe(
      'sIdUnique=Panier[n° magasin] et Panier[n° magasin]',
    )
  })

  it('masque les adresses e-mail même sans magasin', () => {
    expect(maskStore('a@b.fr', null)).toBe('[adresse e-mail masquée]')
  })

  it('laisse un segment mal encodé tel quel au lieu de planter', () => {
    const odd = parseStore({ ...LOCATION, pathname: '/magasin-999111-%E0%A4%A/x' }) as StoreInfo

    expect(maskStore('/magasin-999111-%E0%A4%A/x', odd)).toBe('/magasin-[masqué]/x')
  })
})
