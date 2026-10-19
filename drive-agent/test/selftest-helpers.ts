// Outils des tests du test automatique (DRV-318) : un magasin simulé (rayons, panier, pannes programmées) derrière `RetailerAdapter`.
// Données synthétiques seulement : magasin `123456`, produits `2000001` et suivants.
import {
  LeclercError,
  type Candidate,
  type CartResult,
  type RetailerAdapter,
  type SessionReading,
} from '../src/leclerc'
import { PASSAGE_WORDS } from '../src/selftest'
import { fakeStorage, fakeWakeLock } from './flow-helpers'

export const NOW = Date.UTC(2026, 9, 18, 14, 3, 27)

export interface Item {
  id: string
  label?: string
  price?: number
  stock?: number | null
}

/** Un rayon par mot : les produits dans l'ordre de la page. Les mots absents ne trouvent rien. */
export type Shelves = Record<string, Item[]>

/** Trois produits corrects par mot : le premier de chaque rayon est celui que le choix automatique prend. */
export function standardShelves(words: readonly string[]): Shelves {
  const shelves: Shelves = {}
  words.forEach((word, index) => {
    shelves[word] = [0, 1, 2].map((rank) => ({
      id: String(2_000_000 + index * 10 + rank),
      label: `${word} de test ${rank + 1}`,
      price: 129 + rank * 100,
      stock: 12,
    }))
  })
  return shelves
}

export interface ShopOptions {
  /** Ce qui est déjà au panier (produit, quantité), avant le test. */
  cart?: Record<string, number>
  /** Appelé avant chaque appel (`search <mot>`, `cart <id> <quantité>`) ; lever une erreur la fait sortir de l'appel. */
  before?: (call: string, index: number) => void
  /** Ce que le panier garde d'une demande (par défaut tout) : permet de simuler un retrait qui échoue. */
  keep?: (id: string, quantity: number) => number
  /** Le site ne dit pas le nombre d'articles ni le total (réponse sans ces champs). */
  silentCart?: boolean
  /** Le site porte le total du panier dans ses pages de recherche. */
  pageTotal?: boolean
  label?: string | null
  /** Le magasin de la page (par défaut un magasin inventé de numéro complet 123456). */
  store?: { id: string; host: string }
  /** Ce que la page dit de la connexion (par défaut : rien, état inconnu). */
  session?: SessionReading
}

export function shop(shelves: Shelves, options: ShopOptions = {}) {
  const cart = new Map(Object.entries(options.cart ?? {}))
  const prices = new Map<string, number>()
  const stocks = new Map<string, number | null>()
  for (const items of Object.values(shelves)) {
    for (const item of items) {
      prices.set(item.id, item.price ?? 100)
      stocks.set(item.id, item.stock === undefined ? 12 : item.stock)
    }
  }
  const calls: string[] = []
  const writes: { id: string; quantity: number }[] = []
  let pageTotal: number | null = null
  const items = () => [...cart.values()].reduce((sum, quantity) => sum + quantity, 0)
  const total = () =>
    [...cart.entries()].reduce((sum, [id, quantity]) => sum + quantity * (prices.get(id) ?? 100), 0)
  const enter = (call: string) => {
    calls.push(call)
    options.before?.(call, calls.length - 1)
  }
  const adapter: RetailerAdapter = {
    readStore: () => {
      const store = options.store ?? { id: '123456', host: 'fd0-courses.leclercdrive.fr' }
      return {
        ...store,
        baseUrl: `https://${store.host}/magasin-${store.id}-${store.id}`,
        label: options.label === undefined ? null : options.label,
      }
    },
    searchProducts(query) {
      enter(`search ${query}`)
      pageTotal = options.pageTotal === false ? null : total()
      const found: Candidate[] = (shelves[query] ?? []).map((item) => ({
        id: item.id,
        label: item.label ?? `Produit ${item.id}`,
        label2: null,
        price: item.price ?? 100,
        pricePerMeasure: null,
        promo: null,
        stock: stocks.get(item.id) ?? null,
        inCart: cart.get(item.id) ?? 0,
        imageUrl: null,
        content: { value: 1000, unit: 'g' },
        contentSource: 'label',
      }))
      return Promise.resolve(found)
    },
    readProductFromSearch: () => Promise.resolve(null),
    setCartQuantity(id, quantity): Promise<CartResult> {
      enter(`cart ${id} ${quantity}`)
      const stock = stocks.get(id)
      const sent = Math.min(quantity, stock ?? 99)
      const kept = options.keep ? options.keep(id, sent) : sent
      writes.push({ id, quantity })
      if (kept > 0) cart.set(id, kept)
      else cart.delete(id)
      return Promise.resolve({
        productId: id,
        requested: quantity,
        sent,
        obtained: kept,
        ok: kept === sent,
        items: options.silentCart ? null : items(),
        totalCents: options.silentCart ? null : total(),
        status: 200,
      })
    },
    pageCartTotal: () => pageTotal,
    cartQuantity: (id) => cart.get(id) ?? null,
    stats: () => ({
      requests: calls.length,
      errors: 0,
      blocks: 0,
      timeouts: 0,
      slow: 0,
      peakPauseMs: 0,
    }),
    readSession: () => options.session ?? { state: 'UNKNOWN', signs: [] },
    readArrival: () => ({
      address: '/',
      redirects: null,
      status: null,
      delivery: { read: false, sameAsAddress: null },
      cookies: null,
      searchBase: null,
    }),
    lastSearchFacts: () => null,
    exploreSearchVariants: () => Promise.resolve([]),
    readEntry: () => ({ kind: 'NONE' }),
    followEntry: () => Promise.resolve(),
  }
  return {
    adapter,
    calls,
    writes,
    cart: () => Object.fromEntries(cart),
    items,
    total,
  }
}

/** Un blocage du site : le code HTTP donné (un 429 par exemple). */
export const blocked = (status = 429) => new LeclercError('BLOCKED', status)

export function runDeps(adapter: RetailerAdapter) {
  let clock = NOW
  return {
    adapter,
    agentVersion: '0.6.0',
    storage: fakeStorage(),
    wakeLock: fakeWakeLock().wakeLock,
    originReplaced: null,
    // Chaque lecture de l'heure avance de 100 ms : les durées du rapport sont connues.
    now: () => (clock += 100),
  }
}

export const ALL_WORDS = [
  'farine',
  'sucre',
  'sel',
  'poivre',
  "huile d'olive",
  'beurre',
  'lait',
  'oeufs',
  'riz',
  'pâtes',
  'tomates',
  'bananes',
] as const

export { PASSAGE_WORDS }
