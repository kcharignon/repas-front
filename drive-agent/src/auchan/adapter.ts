import type { RetailerAdapter } from '../retailers/contract'
import { RetailerError } from '../retailers/errors'

/**
 * L'adaptateur d'Auchan, VIDE (DRV-727) : l'enseigne est déclarée au registre (hôte, noms, cadence) pour que le protocole, le web et l'application la
 * connaissent, mais rien n'est écrit pour parler à son site. Chaque méthode lève `CONTRACT_CHANGED` de cause `ADAPTER_NOT_WRITTEN` : un plan d'Auchan
 * qui arriverait quand même sur une page d'Auchan s'arrête au premier regard sur la page, sans une requête, avec ce code. Auchan est éteint
 * (`DRIVE_RETAILERS`) : le cas ne se présente pas aujourd'hui. DRV-717 (magasin, session, entrée), DRV-724 (recherche) et DRV-725 (panier) le remplissent.
 */
function notWritten(): never {
  throw new RetailerError('CONTRACT_CHANGED', null, 'ADAPTER_NOT_WRITTEN')
}

export class AuchanAdapter implements RetailerAdapter {
  readStore(): never {
    return notWritten()
  }
  searchProducts(): Promise<never> {
    return Promise.resolve().then(notWritten)
  }
  setCartQuantity(): Promise<never> {
    return Promise.resolve().then(notWritten)
  }
  readProductFromSearch(): Promise<never> {
    return Promise.resolve().then(notWritten)
  }
  cartQuantity(): never {
    return notWritten()
  }
  stats(): never {
    return notWritten()
  }
  pageCartTotal(): never {
    return notWritten()
  }
  readSession(): never {
    return notWritten()
  }
  readArrival(): never {
    return notWritten()
  }
  lastSearchFacts(): never {
    return notWritten()
  }
  exploreSearchVariants(): Promise<never> {
    return Promise.resolve().then(notWritten)
  }
  readEntry(): never {
    return notWritten()
  }
  followEntry(): Promise<never> {
    return Promise.resolve().then(notWritten)
  }
  readAisleMenu(): never {
    return notWritten()
  }
  describeLastReply(): never {
    return notWritten()
  }
  aisleChoices(): never {
    return notWritten()
  }
  aisleSamples(): never {
    return notWritten()
  }
  exploreFacets(): Promise<never> {
    return Promise.resolve().then(notWritten)
  }
  siteAisles(): never {
    return notWritten()
  }
  searchFiltered(): Promise<never> {
    return Promise.resolve().then(notWritten)
  }
  describeProductLists(): never {
    return notWritten()
  }
  validateSiteFilter(): Promise<never> {
    return Promise.resolve().then(notWritten)
  }
}
