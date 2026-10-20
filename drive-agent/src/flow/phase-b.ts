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
import {
  catalogId,
  LeclercError,
  rankByAisle,
  saysOutOfStock,
  type Candidate,
  type RetailerAdapter,
} from '../leclerc'
import { cleanText } from '../text'
import {
  formatContent,
  formatMeasure,
  formatNeeded,
  formatPrice,
  renderPicker,
  S,
  type AisleChip,
  type AisleRow,
  type PickerItem,
} from '../ui'
import { putInCart } from './keep-cart'
import { packsFor } from './packs'
import { priceOf } from './phase-a'
import { searchByName } from './search-by-name'
import { productSearchForms } from './search-forms'
import type { PendingLine, PhaseB, PhaseBContext } from './types'

/**
 * Le plafond technique des produits gardés pour une recherche (DRV-643) : la liste montre TOUS les produits que la page de l'enseigne contient, dans son
 * ordre, mais une page anormalement longue (ou hostile) ne doit ni alourdir la mémoire ni la préparation des fiches. Une page de recherche d'un magasin en
 * porte bien moins ; au-delà, la personne affine sa recherche (le champ « Chercher autre chose »).
 */
export const MAX_CANDIDATES = 200

/** Un nombre lu dans la réponse du panier, gardé tel quel s'il est entier et raisonnable, sinon `null` (il est stocké, relu et écrit dans le diagnostic). */
const readCount = (value: number | null | undefined): number | null =>
  value !== null &&
  value !== undefined &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 1_000_000
    ? value
    : null

/** La recherche en cours d'une ligne : ce que la liste montre. */
interface Search {
  /** La recherche dont la liste montre les produits (le nom, ou la forme dérivée qui a répondu : ticket D). */
  query: string
  /** Le nom cherché au départ quand c'est une de ses formes qui a répondu (« œuf » quand c'est « oeuf »), sinon `null`. */
  asked: string | null
  candidates: Candidate[]
  /** Un message à montrer une fois (le site ne répond pas, le panier a refusé…). */
  notice: string | null
  /** La rangée de filtres par rayon du site (DRV-647) et le rayon choisi : recalculée à chaque recherche, gardée quand l'écran se rouvre. */
  aisles: AisleRow
  /** Le niveau de la rangée : le rayon ou la famille de chaque produit (DRV-647). */
  groupKey: GroupKey
  /** La rangée des familles (0.34.0), gardée comme repli quand la rangée des rayons du site est montrée (DRV-647, 0.36.0). */
  familyRow: AisleRow
  /** Les produits déjà chargés de chaque rayon du site, par clé de filtre : un rayon n'est jamais redemandé pour la même recherche. */
  siteCache: Map<string, Candidate[]>
}

/**
 * La rangée des rayons du site (DRV-647, 0.36.0) est-elle utilisable pendant ce passage : pas encore essayée (`UNKNOWN` : la première requête filtrée la
 * valide), validée (`OK`), ou écartée (`OFF` : la forme de l'adresse ne filtre pas ; la rangée des familles la remplace pour tout le passage).
 */
export interface SiteAisleState {
  state: 'UNKNOWN' | 'OK' | 'OFF'
}

/**
 * La rangée des rayons du site (DRV-647, 0.36.0), tirée de la facette « Rayons » de la réponse : « Tous » puis ses rayons, du plus fourni au moins fourni
 * (`niNbReferences`), chacun avec ses enfants ; un rayon sans libellé lisible devient « Rayon N ». `null` si la facette a moins de deux rayons ou si la
 * rangée est écartée pour ce passage. Le rayon appris (DRV-642) ne choisit rien d'avance ici (un autre espace d'identifiants). Aucune requête.
 */
export function siteAisleRow(
  adapter: Pick<RetailerAdapter, 'siteAisles'>,
  site: SiteAisleState,
): AisleRow | null {
  if (site.state === 'OFF') return null
  let aisles: ReturnType<RetailerAdapter['siteAisles']> = []
  try {
    aisles = adapter.siteAisles()
  } catch {
    return null
  }
  if (aisles.length < 2) return null
  let rank = 0
  const chipOf = (aisle: (typeof aisles)[number]): AisleChip => ({
    id: aisle.key,
    label: aisle.label ?? S.picker.aisleFallback(++rank),
    count: aisle.count ?? 0,
    children: aisle.children.filter((child) => child.label !== null).map(chipOf),
  })
  const chips = [...aisles].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).map(chipOf)
  return { chips, selected: null, remote: true }
}

/** Une recherche filtrée qui filtre vraiment : au moins un produit, et strictement moins que sans filtre (donc pas les mêmes). */
function filters(filtered: readonly Candidate[], all: readonly Candidate[]): boolean {
  return filtered.length > 0 && filtered.length < all.length
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
  // Le rayon et la famille du produit (DRV-642) : des faits du catalogue que Repas apprend ; absents si le site ne les donne pas.
  const rayonId = catalogId(candidate.aisle)
  const familyId = catalogId(candidate.family)
  return {
    id: candidate.id,
    label: labelOf(candidate),
    ...(content && content.value > 0 && Number.isFinite(content.value) && { content }),
    ...(price && { price }),
    ...(rayonId !== null && { rayonId }),
    ...(familyId !== null && { familyId }),
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

function itemOf(
  line: PlanLine,
  candidate: Candidate,
  refused: ReadonlySet<string>,
  key: GroupKey = 'aisle',
): PickerItem {
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
    // Une promotion à zéro n'existe pas (DRV-632, DRV-644) : pas de ligne « En promotion : 0,00 € ».
    promo: promo === null || !(promo > 0) ? null : S.picker.promo(formatPrice(promo)),
    photo: candidate.imageUrl,
    explain: explain(line, candidate),
    state: refused.has(candidate.id) ? 'refused' : saysOutOfStock(candidate) ? 'out' : 'ok',
    aisle: catalogId(key === 'family' ? candidate.family : candidate.aisle),
  }
}

/** Le champ du produit qui porte l'identifiant du groupe de la rangée : son rayon ou sa famille (DRV-647). */
export type GroupKey = 'aisle' | 'family'

/**
 * La rangée de filtres d'une recherche (DRV-647) : les groupes présents, au niveau (rayon ou famille) où l'adaptateur trouve leurs libellés, du plus fourni au
 * moins fourni ; un groupe sans libellé lisible devient « Rayon 1 », « Rayon 2 »…, jamais un identifiant nu. Le rayon appris (`rayonHints`, DRV-642) présent
 * est choisi d'avance et placé juste après « Tous » : au niveau du rayon, ce rayon ; au niveau de la famille, la famille de ce rayon s'il n'en a qu'une dans
 * les résultats (sinon rien n'est choisi d'avance, plutôt que de se tromper). Aucune requête.
 */
export function aisleRowOf(
  adapter: Pick<RetailerAdapter, 'aisleChoices'>,
  candidates: readonly Candidate[],
  hints: readonly number[] | undefined,
): { row: AisleRow; key: GroupKey } {
  let grouping: ReturnType<RetailerAdapter['aisleChoices']> | null = null
  try {
    grouping = adapter.aisleChoices(candidates)
  } catch {
    // Un libellé illisible ne doit jamais empêcher de choisir : pas de rangée.
  }
  if (grouping === null) return { row: { chips: [], selected: null }, key: 'aisle' }
  const { key } = grouping
  let rank = 0
  const chips = grouping.choices.map(({ id, label, count }) => ({
    id,
    count,
    label: label ?? S.picker.aisleFallback(++rank),
  }))
  const aisle = (hints ?? [])
    .map((hint) => catalogId(hint))
    .find((id) => id !== null && candidates.some((candidate) => candidate.aisle === id))
  let learned: number | null = null
  if (aisle !== undefined && aisle !== null) {
    if (key === 'aisle') learned = aisle
    else {
      const families = new Set(
        candidates
          .filter((candidate) => candidate.aisle === aisle)
          .map((candidate) => catalogId(candidate.family)),
      )
      const [only] = families
      learned = families.size === 1 && only !== undefined ? only : null
    }
  }
  if (learned === null || !chips.some((chip) => chip.id === learned)) {
    return { row: { chips, selected: null }, key }
  }
  // Le groupe appris passe juste après « Tous » : choisi d'avance, il se voit sans faire défiler la rangée, et « Tous » reste à un toucher.
  return {
    row: {
      chips: [
        ...chips.filter((chip) => chip.id === learned),
        ...chips.filter((chip) => chip.id !== learned),
      ],
      selected: learned,
    },
    key,
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
  hints: readonly number[] | undefined,
  derived = false,
  site: SiteAisleState = { state: 'OFF' },
): Promise<void> {
  search.query = query
  search.asked = null
  try {
    const found = derived
      ? await searchByName(adapter, query)
      : { query, candidates: await adapter.searchProducts(query) }
    search.query = found.query
    search.asked = found.query === query ? null : query
    // Les rayons conseillés d'abord (DRV-642), AVANT le plafond : un produit d'un rayon conseillé ne tombe jamais sous le plafond au profit d'un autre.
    search.candidates = rankByAisle(found.candidates, hints).slice(0, MAX_CANDIDATES)
    const { row, key } = aisleRowOf(adapter, search.candidates, hints)
    search.familyRow = row
    search.groupKey = key
    search.siteCache = new Map()
    // La rangée des rayons du site si la facette est lisible et la forme du filtre pas écartée ; sinon celle des familles (0.34.0).
    search.aisles = siteAisleRow(adapter, site) ?? row
    search.notice = null
  } catch (error) {
    if (!(error instanceof LeclercError) || error.code !== 'NETWORK') throw error
    search.notice = error.cause === 'REQUEST_TIMEOUT' ? S.picker.slow : S.picker.network
  }
}

/**
 * La recherche préremplie dans « Chercher autre chose » (DRV-635) : la forme la plus simple du premier produit habituel que la phase A n'a pas retrouvé
 * (la dernière de `productSearchForms`), sans la lancer. `null` quand tous ont été retrouvés.
 */
function prefillOf(
  unavailable: readonly PlanProduct[],
  reasons: PendingLine['reasons'],
): string | null {
  const lost = unavailable.find((product) => reasons?.get(product.id) === 'NOT_FOUND')
  return lost ? (productSearchForms(lost.label).at(-1) ?? cut(lost.label)) : null
}

/**
 * Une ligne : la liste de produits, jusqu'à un produit choisi, un « passer », un « j'en ai toujours », un « passer les suivants » (`rest` : cette
 * ligne est passée, et la phase B passe aussi toutes celles qui la suivent) ou une annulation. `left` : les lignes qui restent à choisir, celle-ci
 * en tête.
 */
async function settleLine(
  { line, unavailable, reasons }: PendingLine,
  position: number,
  total: number,
  left: readonly PendingLine[],
  context: PhaseBContext,
  site: SiteAisleState = { state: 'OFF' },
): Promise<'done' | 'cancelled' | 'rest'> {
  const { adapter, ui, record } = context
  const slug = line.ingredientSlug
  const refused = new Set((line.rejected ?? []).map((product) => product.id))
  const never = new Set<string>()
  const search: Search = {
    query: '',
    asked: null,
    candidates: [],
    notice: null,
    aisles: { chips: [], selected: null },
    groupKey: 'aisle',
    familyRow: { chips: [], selected: null },
    siteCache: new Map(),
  }
  const itemsOf = (candidates: readonly Candidate[]) =>
    candidates.map((candidate) => itemOf(line, candidate, refused, search.groupKey))
  /** Un produit de la liste de la recherche ou d'un rayon du site déjà chargé. */
  const findCandidate = (id: string): Candidate | undefined =>
    search.candidates.find((found) => found.id === id) ??
    [...search.siteCache.values()].flat().find((found) => found.id === id)
  const items = () =>
    search.candidates.map((candidate) => itemOf(line, candidate, refused, search.groupKey))
  /** Les produits indisponibles dont l'utilisateur ne veut plus jamais : ils partent avec l'issue de la ligne, quelle qu'elle soit. */
  const rejected = () => {
    const list = unavailable.filter((product) => never.has(product.id)).map(refusedOf)
    return list.length > 0 ? { rejected: list } : {}
  }

  ui.update({ current: line.name })
  await load(search, adapter, line.searchQuery ?? line.name, line.rayonHints, true, site)

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
            gone: unavailable.map((product) => {
              const reason = reasons?.get(product.id)
              return { id: product.id, label: product.label, ...(reason && { reason }) }
            }),
            prefill: prefillOf(unavailable, reasons),
            checked: never,
            query: search.query,
            asked: search.asked,
            items: items(),
            notice,
            aisles: search.aisles,
          },
          {
            choose: (id) => conclude({ type: 'choose', id } satisfies Picked),
            never: (id, on) => void (on ? never.add(id) : never.delete(id)),
            aisle: (id) => {
              search.aisles = { ...search.aisles, selected: id }
            },
            // Un rayon du site (DRV-647, 0.36.0) : UNE requête filtrée, gardée pour cette recherche ; la première du passage valide la forme du filtre.
            loadAisle: async (id) => {
              const key = String(id)
              const cached = search.siteCache.get(key)
              if (cached !== undefined) return { items: itemsOf(cached) }
              const fallback = () => {
                site.state = 'OFF'
                search.aisles = search.familyRow
                return { fallback: search.familyRow }
              }
              try {
                const { candidates } = await adapter.searchFiltered(search.query, key)
                const kept = candidates.slice(0, MAX_CANDIDATES)
                if (site.state === 'UNKNOWN') {
                  if (!filters(kept, search.candidates)) return fallback()
                  site.state = 'OK'
                }
                search.siteCache.set(key, kept)
                return { items: itemsOf(kept) }
              } catch (error) {
                if (error instanceof LeclercError && error.code === 'NETWORK') {
                  return {
                    notice: error.cause === 'REQUEST_TIMEOUT' ? S.picker.slow : S.picker.network,
                  }
                }
                // Une réponse que le site refuse à la première requête filtrée : la forme ne marche pas, repli sans message.
                if (
                  error instanceof LeclercError &&
                  error.code === 'CONTRACT_CHANGED' &&
                  site.state === 'UNKNOWN'
                ) {
                  return fallback()
                }
                if (live) conclude({ type: 'failure', error } satisfies Picked)
                return { notice: '' }
              }
            },
            search: (query) => {
              picker.busy(S.picker.searching)
              load(search, adapter, query, line.rayonHints, false, site).then(
                () => {
                  if (!live) return
                  picker.results(search.query, items(), search.notice, search.asked, search.aisles)
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
          picker.dispose()
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
    const candidate = findCandidate(id)
    // Défense en profondeur : la liste ne propose pas les produits écartés, un message ne doit pas pouvoir les imposer. Un produit « Plus en stock »
    // se choisit : le panier tranche (DRV-635).
    if (!candidate || refused.has(id)) {
      search.notice = S.picker.cartRefused(candidate ? cleanText(candidate.label) : '')
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
        photo: candidate.imageUrl,
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
      // Le panier n'a rien pris (DRV-644) : c'est quand même le produit que la personne veut, en priorité. Le choix est enregistré (la même ligne `CHOSEN`
      // qu'un choix pris au panier, aucune clé de plus), le passage continue, et la fin dit en une phrase que le produit n'est pas au panier, et pourquoi.
      const facts = settled.facts ?? null
      record(
        {
          ingredientSlug: slug,
          outcome: 'CHOSEN',
          product: chosenProduct(candidate),
          quantity: Math.min(packs, LIMITS.packsMax),
          placement,
          ...(unavailable.length > 0 && {
            unavailableIds: unavailable.map((product) => product.id).slice(0, LIMITS.products),
          }),
          ...rejected(),
        },
        {
          unreached: {
            // « Bientôt disponible » se dit avec les mots de Leclerc (l'application officielle n'a pas non plus de bouton d'ajout) ; un stock nul, la rupture.
            reason: candidate.comingSoon
              ? 'COMING_SOON'
              : candidate.stock === 0 || facts?.stock === 0
                ? 'OUT_OF_STOCK'
                : 'CART_REFUSED',
            label: cut(cleanText(candidate.label) || S.picker.noLabel(candidate.id)),
            stock: readCount(facts?.stock),
            availability: readCount(facts?.availability),
          },
        },
      )
      return 'done'
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
      settled.note || saysOutOfStock(candidate)
        ? {
            ...(settled.note && { cart: settled.note }),
            ...(saysOutOfStock(candidate) && { accepted: true }),
          }
        : undefined,
    )
    return 'done'
  }
}

/**
 * La phase B de l'agent : les lignes à choisir, une à la fois, dans l'ordre du plan. « Passer ces n articles » passe la ligne affichée et toutes
 * celles qui restent : une issue `SKIPPED` chacune, comme « Pas cette fois », donc rien n'est retenu (ni « j'en ai toujours », ni refus).
 */
export const guidedChoice: PhaseB = async (context) => {
  // La rangée des rayons du site, pour tout le passage : la première requête filtrée la valide ou l'écarte (DRV-647, 0.36.0).
  const site: SiteAisleState = { state: 'UNKNOWN' }
  const { pending } = context
  for (const [index, item] of pending.entries()) {
    if (context.stopRequested()) return 'cancelled'
    const settled = await settleLine(
      item,
      index + 1,
      pending.length,
      pending.slice(index),
      context,
      site,
    )
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
