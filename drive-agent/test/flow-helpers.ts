// Outils des tests de l'orchestrateur (DRV-305) : une interface, un adaptateur et un stockage simulés, des plans inventés.
// Données synthétiques seulement : magasin `000123`, produits `1000001` et suivants.
import {
  validateResult,
  type PlanLine,
  type PlanMessage,
  type PlanProduct,
  type ProductRef,
  type ResultMessage,
  type SetupResultMessage,
} from '../protocol'
import { Flow, type FlowDeps, type StorageLike } from '../src/flow'
import { countAisles } from '../src/leclerc'
import type {
  Candidate,
  CartResult,
  Content,
  PricePerMeasure,
  EntryReading,
  RequestStats,
  RetailerAdapter,
  SessionReading,
} from '../src/leclerc'
import type { ProgressPatch, ScreenAnswer, ScreenName, ScreenProps, Ui } from '../src/ui'

export const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'
export const STORE = { id: '000123', host: 'fd0-courses.leclercdrive.fr' }

/** Une page sans menu des rayons (DRV-647) : ce que les adaptateurs simulés rendent. */
export const NO_MENU: ReturnType<RetailerAdapter['readAisleMenu']> = {
  menu: false,
  links: 0,
  menuLinks: 0,
  aisles: [],
  aisleCount: 0,
  families: 0,
  aisleIds: [],
  familyIds: [],
  shapes: [],
  vocabulary: [],
}

// —— Les plans ————————————————————————————————————————————————————————————————————————————————————————————————————————————————

export const product = (
  id: string,
  packs: number | null = 1,
  label = `Produit de test ${id}`,
): PlanProduct => ({
  id,
  label,
  packs,
  packsStatus: packs === null ? null : 'COMPUTED',
})

export const known = (
  slug: string,
  products: PlanProduct[],
  rejected: ProductRef[] = [],
): PlanLine => ({
  ingredientSlug: slug,
  name: slug.charAt(0).toUpperCase() + slug.slice(1),
  status: 'KNOWN',
  products,
  rejected,
  searchQuery: slug,
})

export const fresh = (slug: string): PlanLine => ({
  ingredientSlug: slug,
  name: slug.charAt(0).toUpperCase() + slug.slice(1),
  status: 'NEW',
  products: [],
  rejected: [],
  searchQuery: slug,
})

export const home = (slug: string): PlanLine => ({
  ingredientSlug: slug,
  name: slug,
  status: 'HAVE_AT_HOME',
})
export const skip = (slug: string): PlanLine => ({
  ingredientSlug: slug,
  name: slug,
  status: 'SKIP',
})

export function plan(lines: PlanLine[], runId = RUN_ID): PlanMessage {
  return {
    v: 1,
    type: 'plan',
    runId,
    retailer: 'leclerc',
    store: { ...STORE },
    returnPath: '/drive/retour',
    lines,
  }
}

// —— L'interface ——————————————————————————————————————————————————————————————————————————————————————————————————————————————

type Scripts = {
  [K in ScreenName]?: (props: ScreenProps<K>) => ScreenAnswer<K> | Promise<ScreenAnswer<K>>
}

/** Les réponses d'un utilisateur qui confirme tout, sauf ce que le test écrit à la place. */
const DEFAULT_SCRIPTS: Scripts = {
  summary: () => 'start',
  resume: () => 'resume',
  quantity: (props) => props.packs ?? 1,
  error: () => 'close',
  end: () => 'return',
}

export function fakeUi(scripts: Scripts = {}) {
  const shown: { screen: ScreenName; props: unknown }[] = []
  const updates: ProgressPatch[] = []
  const stops: (() => void)[] = []
  const closed = { count: 0 }
  const ui: Ui = {
    show(screen, props) {
      shown.push({ screen, props })
      // Un bandeau sans bouton (DRV-625) : sa promesse ne se résout jamais.
      if (screen === 'entry') return new Promise(() => undefined)
      if (screen === 'progress') {
        return new Promise((resolve) => stops.push(() => resolve('stop' as never)))
      }
      const script = (scripts[screen] ?? DEFAULT_SCRIPTS[screen]) as
        ((props: unknown) => unknown) | undefined
      if (!script) return Promise.reject(new Error(`Écran « ${screen} » non prévu par le test`))
      return Promise.resolve(script(props)) as never
    },
    update: (patch) => void updates.push(patch),
    close: () => void (closed.count += 1),
  }
  return {
    ui,
    shown,
    updates,
    closed,
    /** « Arrêter » touché sur l'écran de progression affiché en dernier. */
    pressStop: () => stops.at(-1)?.(),
    screens: () => shown.map((item) => item.screen),
    propsOf: <K extends ScreenName>(screen: K) =>
      shown.filter((item) => item.screen === screen).map((item) => item.props as ScreenProps<K>),
  }
}

// —— L'adaptateur —————————————————————————————————————————————————————————————————————————————————————————————————————————————

export interface ShelfItem {
  stock?: number | null
  price?: number | null
  perMeasure?: PricePerMeasure | null
  label?: string
  label2?: string | null
  content?: Content | null
  promo?: number | null
  /** Ce que le panier garde d'une demande de `quantity` (par défaut tout). */
  obtained?: (quantity: number) => number
  /** Ce que la réponse du panier dit de la disponibilité du produit (DRV-644) ; absent : rien. */
  cartFacts?: { stock: number | null; availability: number | null }
  /** La quantité déjà au panier que la recherche lit (par défaut 0 : le site la donne toujours) ; `null` : illisible. */
  inCart?: number | null
  /** L'adresse de la photo, déjà validée par l'adaptateur (par défaut : aucune). */
  image?: string | null
  /** La fiche dit « Bientôt disponible » (DRV-635). */
  comingSoon?: boolean
  /** Le rayon et la famille du produit chez l'enseigne (DRV-642) ; par défaut : non lus. */
  aisle?: number | null
  family?: number | null
}

export function candidate(id: string, item: ShelfItem = {}): Candidate {
  return {
    id,
    label: item.label ?? `Produit de test ${id}`,
    label2: item.label2 ?? null,
    price: item.price ?? null,
    pricePerMeasure: item.perMeasure ?? null,
    promo: item.promo ?? null,
    stock: item.stock === undefined ? 10 : item.stock,
    inCart: item.inCart === undefined ? 0 : item.inCart,
    imageUrl: item.image ?? null,
    availability: null,
    comingSoon: item.comingSoon ?? false,
    aisle: item.aisle ?? null,
    family: item.family ?? null,
    content: item.content ?? null,
    contentSource: item.content ? 'label' : null,
  }
}

/**
 * Un rayon simulé : seuls les produits de `shelf` sont retrouvés par la recherche. `before` est appelé avant chaque requête
 * (`search <id>`, `cart <id> <quantité>`) et peut lancer une erreur ou ne jamais rendre la main.
 */
export function fakeAdapter(
  shelf: Record<string, ShelfItem> = {},
  options: {
    /** Appelé avant chaque requête : `search <id>`, `find <mot>`, `cart <id> <quantité>`. */
    before?: (call: string) => void | Promise<void>
    store?: () => ReturnType<RetailerAdapter['readStore']>
    /** Ce que la page dit de la connexion de l'utilisateur (par défaut : rien, état inconnu). */
    session?: SessionReading
    /** Ce que la recherche d'un mot rend : des identifiants du rayon, dans l'ordre. Un mot absent ne trouve rien. */
    found?: Record<string, string[]>
    /** La recherche d'un produit connu par son libellé : vrai si le moteur le retrouve sous cette requête (par défaut : toujours, s'il est au rayon). */
    sees?: (query: string, id: string) => boolean
    /** Ce que la dernière réponse du panier disait déjà, par identifiant de produit (ensuite : ce que chaque écriture y a laissé). */
    lastCart?: Record<string, number>
    /** Les compteurs de l'adaptateur (par défaut : une requête par appel, rien d'autre). */
    stats?: () => RequestStats
    /** Ce que l'accueil de l'enseigne laisse suivre (DRV-625, par défaut : pas de lien « Commencer mes courses »). */
    entry?: EntryReading
    /** Appelé quand l'agent suit le lien ; peut ne jamais rendre la main (la page a quitté le script). */
    onFollow?: () => void | Promise<void>
    /** Le libellé de chaque rayon (DRV-647) ; un rayon absent n'a pas de libellé lisible. */
    aisleLabels?: Record<number, string>
  } = {},
) {
  const calls: string[] = []
  const cartReply = new Map<string, number>(Object.entries(options.lastCart ?? {}))
  /** Les recherches d'un produit connu par son libellé : la requête et l'identifiant voulu. */
  const searched: { query: string; id: string }[] = []
  const writes: { id: string; quantity: number }[] = []
  const follows = { count: 0 }
  let inFlight = 0
  let peak = 0
  const adapter: RetailerAdapter = {
    readStore:
      options.store ??
      (() => ({
        ...STORE,
        baseUrl: `https://${STORE.host}/magasin-${STORE.id}-${STORE.id}`,
        label: null,
      })),
    async searchProducts(query) {
      calls.push(`find ${query}`)
      await options.before?.(`find ${query}`)
      return (options.found?.[query] ?? []).map((id) => candidate(id, shelf[id]))
    },
    async readProductFromSearch(query, id) {
      calls.push(`search ${id}`)
      searched.push({ query, id })
      await options.before?.(`search ${id}`)
      const item = shelf[id]
      return item && (options.sees?.(query, id) ?? true) ? candidate(id, item) : null
    },
    pageCartTotal: () => null,
    stats:
      options.stats ??
      (() => ({
        requests: calls.length,
        errors: 0,
        blocks: 0,
        timeouts: 0,
        slow: 0,
        peakPauseMs: 0,
      })),
    cartQuantity: (id) => cartReply.get(id) ?? null,
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
    readEntry: () => options.entry ?? { kind: 'NONE' },
    async followEntry() {
      follows.count += 1
      await options.onFollow?.()
    },
    exploreSearchVariants: () => Promise.resolve([]),
    readAisleMenu: () => NO_MENU,
    describeLastReply: () => null,
    aisleChoices: (candidates) =>
      countAisles(candidates).map(({ id, count }) => {
        const label = options.aisleLabels?.[id] ?? null
        return { id, count, label, source: label === null ? null : 'NAVIGATE' }
      }),
    async setCartQuantity(id, quantity): Promise<CartResult> {
      calls.push(`cart ${id} ${quantity}`)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      try {
        await options.before?.(`cart ${id} ${quantity}`)
        await Promise.resolve()
        writes.push({ id, quantity })
        const obtained = shelf[id]?.obtained?.(quantity) ?? quantity
        cartReply.set(id, obtained)
        return {
          productId: id,
          requested: quantity,
          sent: quantity,
          obtained,
          ok: obtained === quantity,
          items: null,
          totalCents: null,
          ...(shelf[id]?.cartFacts && { product: shelf[id]?.cartFacts }),
          status: 200,
        }
      } finally {
        inFlight -= 1
      }
    },
  }
  return { adapter, calls, searched, writes, follows, maxInFlight: () => peak }
}

// —— Le stockage, le verrou d'écran, le flux ————————————————————————————————————————————————————————————————————————————————

export function fakeStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get length() {
      return data.size
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

export function fakeWakeLock(options: { refuse?: boolean } = {}) {
  const state = { requested: 0, released: 0 }
  return {
    state,
    wakeLock: {
      request: () => {
        state.requested += 1
        if (options.refuse) return Promise.reject(new DOMException('refusé', 'NotAllowedError'))
        return Promise.resolve({
          release: () => {
            state.released += 1
            return Promise.resolve()
          },
        })
      },
    },
  }
}

/** Un orchestrateur et l'horloge fausse : chaque lecture de l'heure avance d'une seconde. */
export function makeFlow(parts: Partial<FlowDeps> & Pick<FlowDeps, 'ui'>) {
  const sent: ResultMessage[] = []
  const setups: SetupResultMessage[] = []
  let clock = 1_000_000
  const deps: FlowDeps = {
    adapter: fakeAdapter().adapter,
    send: (message) => void (message.type === 'result' ? sent.push(message) : setups.push(message)),
    storage: null,
    wakeLock: null,
    now: () => (clock += 1000),
    agentVersion: '0.2.0',
    canReturn: true,
    ...parts,
  }
  return { flow: new Flow(deps), sent, setups }
}

/** Le résultat envoyé doit être conforme au protocole : le même validateur que Repas. */
export function expectConform(message: ResultMessage | undefined): ResultMessage {
  if (!message) throw new Error('Aucun résultat envoyé')
  validateResult(JSON.parse(JSON.stringify(message)))
  return message
}

/** Une vraie rupture (DRV-635) : la fiche dit stock 0 ET le panier ne garde rien. Seul ce produit est « plus disponible ». */
export const OUT_OF_STOCK: ShelfItem = { stock: 0, obtained: () => 0 }
