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
import type {
  Candidate,
  CartResult,
  Content,
  PricePerMeasure,
  RetailerAdapter,
} from '../src/leclerc'
import type { ProgressPatch, ScreenAnswer, ScreenName, ScreenProps, Ui } from '../src/ui'

export const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'
export const STORE = { id: '000123', host: 'fd0-courses.leclercdrive.fr' }

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
    inCart: null,
    thumbnailUrl: null,
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
    /** Ce que la recherche d'un mot rend : des identifiants du rayon, dans l'ordre. Un mot absent ne trouve rien. */
    found?: Record<string, string[]>
  } = {},
) {
  const calls: string[] = []
  const writes: { id: string; quantity: number }[] = []
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
    async readProductFromSearch(_query, id) {
      calls.push(`search ${id}`)
      await options.before?.(`search ${id}`)
      const item = shelf[id]
      return item ? candidate(id, item) : null
    },
    pageCartTotal: () => null,
    async setCartQuantity(id, quantity): Promise<CartResult> {
      calls.push(`cart ${id} ${quantity}`)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      try {
        await options.before?.(`cart ${id} ${quantity}`)
        await Promise.resolve()
        writes.push({ id, quantity })
        const obtained = shelf[id]?.obtained?.(quantity) ?? quantity
        return {
          productId: id,
          requested: quantity,
          sent: quantity,
          obtained,
          ok: obtained === quantity,
          items: null,
          totalCents: null,
          status: 200,
        }
      } finally {
        inFlight -= 1
      }
    },
  }
  return { adapter, calls, writes, maxInFlight: () => peak }
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
