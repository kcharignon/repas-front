// Le chemin AVEC la ville d'un magasin, tiré de la page (recette réelle du 2026-10-18 : la recherche répond HTTP 400 depuis l'accueil du magasin atteint
// par « Commencer mes courses », et réussit depuis la page de résultats du site, dont l'adresse a la ville). L'agent lit ce chemin dans la page : l'action
// du formulaire de recherche du site en premier, à défaut le premier lien qui commence par `/magasin-<id>-<id>-`. Pages INVENTÉES, aucun réseau.
import { describe, expect, it } from 'vitest'

import { findCityPath, findSearchBase, findSearchFormPath } from '../src/leclerc/store'

const CART = '/magasin-000123-000123'
const CITY = '/magasin-000123-000123-Ville-Test'

describe('le formulaire de recherche du site', () => {
  it.each([
    [
      'une action en chemin absolu',
      `<form method="get" action="${CITY}/recherche.aspx"><input name="TexteRecherche"></form>`,
    ],
    [
      'une action avec son hôte',
      `<form action="https://fd0-courses.leclercdrive.fr${CITY}/recherche.aspx"></form>`,
    ],
    ['une action avec des paramètres', `<form action='${CITY}/recherche.aspx?x=1#y'></form>`],
    [
      'une action écrite avant d’autres attributs',
      `<form id="f" class="c" ACTION="${CITY}/Recherche.aspx" method="get">`,
    ],
  ])('lit le chemin avec la ville dans %s', (_name, html) => {
    expect(findSearchFormPath(html, CART)).toBe(CITY)
  })

  it.each([
    ['sans ville', `<form action="${CART}/recherche.aspx">`],
    ['d’un autre magasin', '<form action="/magasin-999000-999000-Ailleurs/recherche.aspx">'],
    ['relative', '<form action="recherche.aspx">'],
    ['vers une autre page', `<form action="${CITY}/connexion.aspx">`],
    ['absente', '<form method="get">'],
  ])('ignore une action %s', (_name, html) => {
    expect(findSearchFormPath(html, CART)).toBeNull()
  })

  it('prend le premier formulaire qui convient', () => {
    const html = `<form action="/ailleurs"></form><form action="${CITY}/recherche.aspx"></form><form action="${CART}-Autre/recherche.aspx"></form>`

    expect(findSearchFormPath(html, CART)).toBe(CITY)
  })
})

describe('le premier lien de la page qui porte la ville', () => {
  it.each([
    ['un lien', `<a href="${CITY}/accueil.aspx">Accueil</a>`],
    ['un lien entre apostrophes', `<a href='${CITY}/'>Accueil</a>`],
    ['un lien avec des paramètres', `<a href="${CITY}?x=1">x</a>`],
    ['un lien avec son hôte', `<a href="https://fd0-courses.leclercdrive.fr${CITY}/rayon">x</a>`],
    ['un chemin dans un script', `<script>var u = "${CITY}/panier.aspx";</script>`],
  ])('lit le chemin avec la ville dans %s', (_name, html) => {
    expect(findCityPath(html, CART)).toBe(CITY)
  })

  it('prend le premier', () => {
    expect(findCityPath(`<a href="${CART}-Premiere/x"><a href="${CART}-Seconde/y">`, CART)).toBe(
      `${CART}-Premiere`,
    )
  })

  it.each([
    ['aucun lien', '<a href="/autre">x</a>'],
    ['un lien sans ville', `<a href="${CART}/accueil.aspx">x</a>`],
    ['un lien d’un autre magasin', '<a href="/magasin-999000-999000-Ailleurs/x">x</a>'],
    ['un lien relatif', '<a href="accueil.aspx">x</a>'],
    ['une ville qui contient des caractères qui n’en sont pas', `<a href="${CART}-a&quot;b">x</a>`],
  ])('ne trouve rien dans %s', (_name, html) => {
    expect(findCityPath(html, CART)).toBeNull()
  })

  it('refuse un préfixe qui n’est pas celui d’un magasin (rien n’entre dans l’expression)', () => {
    expect(findCityPath('<a href="/magasin-1-1-V">', '/magasin-1-1-.*')).toBeNull()
    expect(findCityPath('<a href="/x">', '')).toBeNull()
  })
})

describe('le chemin de recherche du site : le formulaire d’abord, puis un lien', () => {
  it('le formulaire gagne sur un lien qui précède', () => {
    const html = `<a href="${CART}-Lien/x">x</a><form action="${CITY}/recherche.aspx"></form>`

    expect(findSearchBase(html, CART)).toEqual({ path: CITY, source: 'FORM' })
  })

  it('sans formulaire, le premier lien', () => {
    expect(findSearchBase(`<a href="${CITY}/x">x</a>`, CART)).toEqual({
      path: CITY,
      source: 'LINK',
    })
  })

  it('rien : null', () => {
    expect(findSearchBase('<p>rien</p>', CART)).toBeNull()
  })
})
