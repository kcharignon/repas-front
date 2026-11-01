// @vitest-environment node
// La forme de la requête de recherche (priorité maximale de la recette réelle du 2026-10-18 : `GET …/recherche.aspx?TexteRecherche=sel` répond
// HTTP 400 sur une vraie page de magasin, alors que le banc d'essai du matin, le même GET, passait). Ces tests figent la requête courante,
// celle du banc d'essai (retiré le 2026-10-19, dans l'historique Git : chemin de la page AVEC la ville, `Accept: text/html,
// application/xhtml+xml`, `credentials: same-origin`), et les variantes de repli essayées sur un 400. Aucun réseau.
import { describe, expect, it } from 'vitest'

import {
  applicable,
  buildSearch,
  FALLBACK_ORDER,
  DESKTOP_VARIANTS,
  type SearchContext,
} from '../src/leclerc/search-request'

const CITY: SearchContext = {
  pagePath: '/magasin-000123-000123-Ville-Test',
  cartPath: '/magasin-000123-000123',
  pathname: '/magasin-000123-000123-Ville-Test/accueil.aspx',
  linkPath: null,
}

describe('la requête courante : celle du banc d’essai qui a marché', () => {
  it('GET du chemin de la page (avec la ville) puis recherche.aspx?TexteRecherche=<mot>, avec Accept html', () => {
    expect(buildSearch('a', CITY, 'farine')).toEqual({
      url: '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=farine',
      init: { method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } },
    })
  })

  it('encode le mot comme le banc d’essai (encodeURIComponent)', () => {
    expect(buildSearch('a', CITY, "huile d'olive").url).toBe(
      "/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=huile%20d'olive",
    )
    expect(buildSearch('a', CITY, 'pâtes & œufs').url).toBe(
      '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=p%C3%A2tes%20%26%20%C5%93ufs',
    )
  })

  it('une page sans ville donne un chemin sans ville', () => {
    const noCity = { ...CITY, pagePath: '/magasin-000123-000123' }
    expect(buildSearch('a', noCity, 'sel').url).toBe(
      '/magasin-000123-000123/recherche.aspx?TexteRecherche=sel',
    )
  })

  it('est une adresse de l’hôte de la page : un chemin qui commence par un seul « / »', () => {
    for (const id of DESKTOP_VARIANTS) {
      const { url } = buildSearch(id, { ...CITY, linkPath: '/magasin-000123-000123-Autre' }, 'sel')
      expect(url).toMatch(/^\/(?![/\\])/)
      expect(url).not.toMatch(/^[a-z]+:/i)
    }
  })
})

describe('les variantes, une par différence possible avec la requête qui marchait', () => {
  it('b : le même GET, sans aucun en-tête personnalisé (fetch par défaut)', () => {
    expect(buildSearch('b', CITY, 'sel')).toEqual({
      url: '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=sel',
      init: { method: 'GET' },
    })
  })

  it('c : avec Accept: */*', () => {
    expect(buildSearch('c', CITY, 'sel')).toEqual({
      url: '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=sel',
      init: { method: 'GET', headers: { Accept: '*/*' } },
    })
  })

  it('e1 : le chemin SANS suffixe de ville (celui du panier)', () => {
    expect(buildSearch('e1', CITY, 'sel')).toEqual({
      url: '/magasin-000123-000123/recherche.aspx?TexteRecherche=sel',
      init: { method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } },
    })
  })

  it('e2 : l’adresse relative recherche.aspx?… résolue contre le dossier de la page courante', () => {
    expect(buildSearch('e2', CITY, 'sel').url).toBe(
      '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=sel',
    )
    expect(
      buildSearch(
        'e2',
        { ...CITY, pathname: '/magasin-000123-000123-Ville-Test/rayon/x.aspx' },
        'sel',
      ).url,
    ).toBe('/magasin-000123-000123-Ville-Test/rayon/recherche.aspx?TexteRecherche=sel')
    expect(
      buildSearch('e2', { ...CITY, pathname: '/magasin-000123-000123-Ville-Test' }, 'sel').url,
    ).toBe('/recherche.aspx?TexteRecherche=sel')
  })

  // Hypothèse 1 de l'analyse de la recette réelle : la page d'ouverture n'a pas de suffixe de ville, le site le fournit dans les liens de la page.
  it('g : le chemin AVEC la ville, tiré du premier lien de la page, quand l’adresse de la page n’a pas de ville', () => {
    const noCity: SearchContext = {
      pagePath: '/magasin-000123-000123',
      cartPath: '/magasin-000123-000123',
      pathname: '/magasin-000123-000123/',
      linkPath: '/magasin-000123-000123-Ville-Test',
    }

    expect(buildSearch('g', noCity, 'sel')).toEqual({
      url: '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=sel',
      init: { method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } },
    })
    expect(applicable('g', noCity)).toBe(true)
  })

  it('g n’a de sens que si la page porte un lien avec la ville différent de son adresse', () => {
    expect(applicable('g', CITY)).toBe(false)
    expect(applicable('g', { ...CITY, linkPath: CITY.pagePath })).toBe(false)
    for (const id of DESKTOP_VARIANTS.filter((v) => v !== 'g'))
      expect(applicable(id, CITY)).toBe(true)
  })

  it('h : sans cache (cache no-store)', () => {
    expect(buildSearch('h', CITY, 'sel')).toEqual({
      url: '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=sel',
      init: {
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
        cache: 'no-store',
      },
    })
  })

  it('f : sans l’en-tête Referer (referrerPolicy no-referrer)', () => {
    expect(buildSearch('f', CITY, 'sel')).toEqual({
      url: '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=sel',
      init: {
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
        referrerPolicy: 'no-referrer',
      },
    })
  })

  it('aucune variante n’écrit : toujours GET, jamais de corps', () => {
    for (const id of DESKTOP_VARIANTS) {
      const { init } = buildSearch(id, CITY, 'sel')
      expect(init.method).toBe('GET')
      expect(init.body).toBeUndefined()
    }
  })

  it('la requête essaie d’abord le chemin avec la ville tiré de la page (g, s’il y en a un), puis la requête courante, puis chaque variante une fois (c, identique à b sur le réseau, n’est que sondée)', () => {
    expect(FALLBACK_ORDER).toEqual(['g', 'a', 'b', 'e1', 'e2', 'f', 'h'])
    expect(new Set(FALLBACK_ORDER).size).toBe(FALLBACK_ORDER.length)
    expect([...FALLBACK_ORDER, 'c'].sort()).toEqual([...DESKTOP_VARIANTS].sort())
  })
})
