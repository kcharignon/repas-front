import { describe, expect, it } from 'vitest'

import { hasCookie, isSensitiveKey, maskEmails, maskStore, shorten } from '../redact'
import {
  cartUrl,
  findDeliveryPoint,
  fragmentTargetUrl,
  isLeclercHost,
  parseStore,
  searchUrl,
  type StoreInfo,
} from '../store'

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
    })
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
      pathname: '/magasin-999111-Rez%C3%A9/accueil.aspx',
    }) as StoreInfo

    expect(
      maskStore('/magasin-999111-Rez%C3%A9/accueil.aspx et magasin-999111-Rezé', withCity),
    ).toBe('/magasin-[masqué]/accueil.aspx et magasin-[masqué]')
  })

  it('masque les adresses e-mail même sans magasin', () => {
    expect(maskStore('a@b.fr', null)).toBe('[adresse e-mail masquée]')
  })

  it('laisse un segment mal encodé tel quel au lieu de planter', () => {
    const odd = parseStore({ ...LOCATION, pathname: '/magasin-999111-%E0%A4%A/x' }) as StoreInfo

    expect(maskStore('/magasin-999111-%E0%A4%A/x', odd)).toBe('/magasin-[masqué]/x')
  })
})
