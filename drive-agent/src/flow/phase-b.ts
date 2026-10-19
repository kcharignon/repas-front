// Phase B (DRV-306, variante P2 retenue à G1) : pour chaque ligne à choisir, l'agent cherche le nom de l'ingrédient, affiche les produits
// dans l'écran de choix, et l'utilisateur en choisit un. L'agent ne choisit jamais seul : l'ajout au panier vient d'un bouton « Choisir ».
//   ligne -> recherche -> liste (choisir | chercher autre chose | passer | passer les suivants | j'en ai toujours | annuler)
//         -> [quantité à vérifier] -> [« toujours ce produit ? »] -> panier -> issue `CHOSEN`
// Jamais un produit refusé (grisé, non sélectionnable), jamais plus que le stock (l'adaptateur plafonne), requêtes en série.
import {
  LIMITS,
  type ChosenLine,
  type Placement,
  type PlanLine,
  type PlanProduct,
  type RejectedProduct,
} from '../../protocol'
import { LeclercError, type Candidate, type RetailerAdapter } from '../leclerc'
import { cleanText } from '../text'
import {
  formatContent,
  formatMeasure,
  formatNeeded,
  formatPrice,
  renderPicker,
  S,
  type PickerItem,
} from '../ui'
import { putInCart } from './keep-cart'
import { packsFor } from './packs'
import { priceOf } from './phase-a'
import { searchByName } from './search-by-name'
import type { PendingLine, PhaseB, PhaseBContext } from './types'

/** Le nombre de produits affichés. */
export const MAX_CANDIDATES = 8

/** La recherche en cours d'une ligne : ce que la liste montre. */
interface Search {
  /** La recherche dont la liste montre les produits (le nom, ou la forme dérivée qui a répondu : ticket D). */
  query: string
  /** Le nom cherché au départ quand c'est une de ses formes qui a répondu (« œuf » quand c'est « oeuf »), sinon `null`. */
  asked: string | null
  candidates: Candidate[]
  /** Un message à montrer une fois (le site ne répond pas, le panier a refusé…). */
  notice: string | null
}

/** Ce que la liste de produits rend à l'écran de choix. */
type Picked = { type: 'choose'; id: string } | { type: 'failure'; error: unknown }

const isPicked = (value: unknown): value is Picked => {
  const type = (value as { type?: unknown } | null)?.type
  return type === 'choose' || type === 'failure'
}

const cut = (text: string): string => {
  const chars = Array.from(text)
  return chars.length > LIMITS.label ? chars.slice(0, LIMITS.label).join('') : text
}

/** Le libellé d'un produit pour Repas : les deux lignes de l'enseigne, de 1 à 255 caractères. */
export function labelOf(candidate: Candidate): string {
  const first = cleanText(candidate.label)
  const second = cleanText(candidate.label2 ?? '')
  const joined = second !== '' && !first.toLowerCase().includes(second.toLowerCase())
  return cut((joined ? `${first} ${second}` : first) || S.picker.noLabel(candidate.id))
}

/**
 * Un produit connu que l'utilisateur ne veut plus jamais, tel qu'il repart vers Repas. Son libellé vient de la fiche mémorisée par Repas, qui
 * peut avoir été enregistrée avant que le back refuse certains caractères invisibles (trait d'union conditionnel…) : il est nettoyé comme un
 * libellé lu sur le site, sinon le back refuserait tout le lot de choix.
 */
const refusedOf = (product: PlanProduct): RejectedProduct => ({
  id: product.id,
  label: cut(cleanText(product.label) || S.picker.noLabel(product.id)),
  ...(product.content && { content: product.content }),
})

/** Le produit tel qu'il part vers Repas : le contenu n'y figure que s'il est plausible (strictement positif). */
function chosenProduct(candidate: Candidate): ChosenLine['product'] {
  const price = priceOf(candidate)
  const { content } = candidate
  return {
    id: candidate.id,
    label: labelOf(candidate),
    ...(content && content.value > 0 && Number.isFinite(content.value) && { content }),
    ...(price && { price }),
  }
}

/** « 500 g par produit : 2 produits. » (la quantité demandée est dite en haut de la liste), ou, quand le calcul est impossible, ce qui reste à faire. */
function explain(line: PlanLine, candidate: Candidate): string {
  const { needed } = line
  const { packs, status } = packsFor(needed, candidate.content)
  if (!needed || packs === null || status !== 'COMPUTED') return S.picker.unknownContent
  const per =
    needed.dimension === 'PACKAGE' || !candidate.content
      ? null
      : formatContent(candidate.content.value, candidate.content.unit)
  return S.picker.pack(per, packs)
}

/**
 * Rien n'est encore retenu pour cet article : ni produit habituel devenu indisponible, ni produit à remplacer. Le passer, c'est ne jamais lui
 * choisir de produit : « Passer ces n articles » le fait confirmer (DRV-624).
 */
const isFirstChoice = ({ line, unavailable }: PendingLine): boolean =>
  unavailable.length === 0 && !line.replaces

/** Un libellé sans espaces ni casse, virgule décimale en point : « 40 g », « 40g » et « 40 G » se valent. */
const squash = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[\s\u00a0\u202f]+/gu, '')
    .replace(',', '.')

function itemOf(line: PlanLine, candidate: Candidate, refused: ReadonlySet<string>): PickerItem {
  const { content, price, pricePerMeasure, promo } = candidate
  const size = content ? formatContent(content.value, content.unit) : null
  const details = [
    size,
    price === null ? null : formatPrice(price),
    pricePerMeasure ? formatMeasure(pricePerMeasure.cents, pricePerMeasure.unit) : null,
  ].filter((detail): detail is string => detail !== null)
  const second = cleanText(candidate.label2 ?? '')
  // La seconde ligne du libellé qui ne fait que redire la taille (« 40 g ») est retirée : la ligne du prix la dit déjà (DRV-626).
  const repeatsSize = size !== null && squash(second) === squash(size)
  return {
    id: candidate.id,
    name: cleanText(candidate.label) || S.picker.noLabel(candidate.id),
    label2: second === '' || repeatsSize ? null : second,
    details,
    promo: promo === null ? null : S.picker.promo(formatPrice(promo)),
    explain: explain(line, candidate),
    state: refused.has(candidate.id) ? 'refused' : candidate.stock === 0 ? 'out' : 'ok',
  }
}

/**
 * Cherche `query` ; une erreur réseau (déjà retentée une fois par l'adaptateur) n'abîme pas la ligne : elle devient un message et
 * l'utilisateur peut réessayer ou passer. Toute autre erreur remonte et arrête le passage. Avec `derived` (le nom de l'ingrédient, cherché
 * par l'agent) et si le nom ne répond rien, ses formes dérivées sont essayées une par une (`searchByName`, ticket D) ; ce que l'utilisateur
 * tape lui-même est cherché tel quel.
 */
async function load(
  search: Search,
  adapter: RetailerAdapter,
  query: string,
  derived = false,
): Promise<void> {
  search.query = query
  search.asked = null
  try {
    const found = derived
      ? await searchByName(adapter, query)
      : { query, candidates: await adapter.searchProducts(query) }
    search.query = found.query
    search.asked = found.query === query ? null : query
    search.candidates = found.candidates.slice(0, MAX_CANDIDATES)
    search.notice = null
  } catch (error) {
    if (!(error instanceof LeclercError) || error.code !== 'NETWORK') throw error
    search.notice = error.cause === 'REQUEST_TIMEOUT' ? S.picker.slow : S.picker.network
  }
}

/**
 * Une ligne : la liste de produits, jusqu'à un produit choisi, un « passer », un « j'en ai toujours », un « passer les suivants » (`rest` : cette
 * ligne est passée, et la phase B passe aussi toutes celles qui la suivent) ou une annulation. `left` : les lignes qui restent à choisir, celle-ci
 * en tête.
 */
async function settleLine(
  { line, unavailable }: PendingLine,
  position: number,
  total: number,
  left: readonly PendingLine[],
  context: PhaseBContext,
): Promise<'done' | 'cancelled' | 'rest'> {
  const { adapter, ui, record } = context
  const slug = line.ingredientSlug
  const refused = new Set((line.rejected ?? []).map((product) => product.id))
  const never = new Set<string>()
  const search: Search = { query: '', asked: null, candidates: [], notice: null }
  const items = () => search.candidates.map((candidate) => itemOf(line, candidate, refused))
  /** Les produits indisponibles dont l'utilisateur ne veut plus jamais : ils partent avec l'issue de la ligne, quelle qu'elle soit. */
  const rejected = () => {
    const list = unavailable.filter((product) => never.has(product.id)).map(refusedOf)
    return list.length > 0 ? { rejected: list } : {}
  }

  ui.update({ current: line.name })
  await load(search, adapter, line.searchQuery ?? line.name, true)

  for (;;) {
    const notice = search.notice
    search.notice = null
    const answer = await ui.show('chooser', {
      ingredient: line.name,
      position,
      total,
      confirmRest: left.some(isFirstChoice),
      mount: (zone, conclude) => {
        let live = true
        const picker = renderPicker(
          zone,
          {
            need: formatNeeded(line.needed),
            replaces: line.replaces?.label ?? null,
            gone: unavailable,
            checked: never,
            query: search.query,
            asked: search.asked,
            items: items(),
            notice,
          },
          {
            choose: (id) => conclude({ type: 'choose', id } satisfies Picked),
            never: (id, on) => void (on ? never.add(id) : never.delete(id)),
            search: (query) => {
              picker.busy(S.picker.searching)
              load(search, adapter, query).then(
                () => {
                  if (!live) return
                  picker.results(search.query, items(), search.notice, search.asked)
                  picker.busy(null)
                },
                (error: unknown) => {
                  if (live) conclude({ type: 'failure', error } satisfies Picked)
                },
              )
            },
          },
        )
        return () => {
          live = false
        }
      },
    })

    if (answer.kind === 'cancel') return 'cancelled'
    if (answer.kind === 'skip' || answer.kind === 'rest') {
      record({ ingredientSlug: slug, outcome: 'SKIPPED', ...rejected() })
      return answer.kind === 'rest' ? 'rest' : 'done'
    }
    if (answer.kind === 'have') {
      record({ ingredientSlug: slug, outcome: 'HAVE_AT_HOME', ...rejected() })
      return 'done'
    }
    if (!isPicked(answer.value)) continue
    if (answer.value.type === 'failure') throw answer.value.error

    const id = answer.value.id
    const candidate = search.candidates.find((found) => found.id === id)
    // Défense en profondeur : la liste ne propose pas ces produits, un message ne doit pas pouvoir les imposer.
    if (!candidate || refused.has(id) || candidate.stock === 0) {
      search.notice = S.picker.cartRefused
      continue
    }

    const computed = packsFor(line.needed, candidate.content)
    let packs = computed.status === 'COMPUTED' ? computed.packs : null
    if (packs === null) {
      packs = await ui.show('quantity', {
        ingredient: line.name,
        productLabel: labelOf(candidate),
        packs: computed.packs,
        need: formatNeeded(line.needed),
      })
      if (packs === null) continue
    }

    // Un article qui n'avait aucun produit retenu : le produit devient son produit habituel, sans question. Sinon une seule question, à deux
    // réponses (DRV-624) : « Toujours prendre celui-ci » (`PRIMARY` : Repas le met en tête et garde les anciens à sa suite) ou « Cette fois
    // seulement » (`ONCE` : rien n'est retenu). L'agent n'émet plus `FALLBACK`, que le protocole accepte toujours.
    let placement: Placement = 'PRIMARY'
    if (unavailable.length > 0 || line.replaces) {
      const role = await ui.show('placement', {
        ingredient: line.name,
        productLabel: labelOf(candidate),
      })
      if (role === null) continue
      placement = role
    }

    context.showProgress()
    let settled
    try {
      settled = await putInCart(adapter, candidate, packs)
    } catch (error) {
      if (!(error instanceof LeclercError) || error.code !== 'NETWORK') throw error
      record(
        { ingredientSlug: slug, outcome: 'FAILED', error: 'NETWORK', ...rejected() },
        error.cause === 'REQUEST_TIMEOUT' ? { slow: true } : undefined,
      )
      return 'done'
    }
    if (settled.obtained < 1) {
      search.notice = S.picker.cartRefused
      continue
    }
    record(
      {
        ingredientSlug: slug,
        outcome: 'CHOSEN',
        product: chosenProduct(candidate),
        quantity: Math.min(settled.obtained, LIMITS.packsMax),
        placement,
        ...(unavailable.length > 0 && {
          unavailableIds: unavailable.map((product) => product.id).slice(0, LIMITS.products),
        }),
        ...rejected(),
      },
      settled.note ? { cart: settled.note } : undefined,
    )
    return 'done'
  }
}

/**
 * La phase B de l'agent : les lignes à choisir, une à la fois, dans l'ordre du plan. « Passer ces n articles » passe la ligne affichée et toutes
 * celles qui restent : une issue `SKIPPED` chacune, comme « Pas cette fois », donc rien n'est retenu (ni « j'en ai toujours », ni refus).
 */
export const guidedChoice: PhaseB = async (context) => {
  const { pending } = context
  for (const [index, item] of pending.entries()) {
    if (context.stopRequested()) return 'cancelled'
    const settled = await settleLine(item, index + 1, pending.length, pending.slice(index), context)
    if (settled === 'cancelled') return 'cancelled'
    if (settled === 'rest') {
      for (const { line } of pending.slice(index + 1)) {
        context.record({ ingredientSlug: line.ingredientSlug, outcome: 'SKIPPED' })
      }
      return 'done'
    }
    // L'écran de progression pendant la recherche de la ligne suivante.
    if (index < pending.length - 1) context.showProgress()
  }
  return 'done'
}
