// Le magasin d'Auchan ne se lit PAS dans l'adresse de la page (DRV-712, hypothèse A-1, mesurée) : le site le garde dans la session et le dit par son
// parcours, `GET /journey` (A-2, mesuré). Ce fichier lit cette réponse JSON, sans rien en rapporter d'autre que des formes : le parcours porte aussi la
// localité saisie par la personne (un code postal, une ville), qui n'est jamais lue ni gardée.
//   - `activeContexts[]` : un élément par type ; le drive choisi est celui de type `GROCERY`, dont `context` porte `seller.id` (un UUID, A-2) et
//     `pointOfService.name` (le libellé de la barre « Retrait : … », A-4). `ONLINE` à contexte nul a été vu (A-2) ;
//   - un contexte de courses ABSENT ou NUL = aucun magasin choisi (A-5 : la déconnexion l'efface) ; un contexte de courses qui est un objet sans vendeur
//     lisible n'est PAS « aucun magasin » : le site a changé de forme (cause propre, jamais une valeur devinée).
// NON MESURÉ : que `type` soit une clé de l'élément (et `context` son contenu), comme le rapport DRV-712 le décrit ; que le canal `PICK_UP` soit exigé
// (la livraison à domicile a d'autres contextes, A-8 inconnu : le canal n'est que RAPPORTÉ, il ne refuse rien).
import { LIMITS, STORES } from '../../protocol'
import { parseJson } from '../primitives'
import { KNOWN_CONTEXT_TYPES, type StoreReadFacts } from '../retailers/store-facts'
import { RetailerError } from '../retailers/errors'
import { cleanText } from '../text'

export interface JourneyStore {
  /** `seller.id` du contexte de courses : un UUID en minuscules. */
  id: string
  /** `pointOfService.name`, nettoyé et borné ; `null` s'il manque. */
  label: string | null
}

export interface JourneyReading {
  /** Le magasin choisi, `null` : aucun magasin choisi. */
  store: JourneyStore | null
  facts: StoreReadFacts
}

type Box = Record<string, unknown>

const isBox = (value: unknown): value is Box =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Un champ que l'objet porte lui-même (jamais un attribut hérité : une clé de la page peut s'appeler `constructor`). */
const field = (box: Box, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(box, key) ? box[key] : undefined

function labelOf(point: unknown): string | null {
  if (!isBox(point)) return null
  const name = field(point, 'name')
  if (typeof name !== 'string') return null
  const text = cleanText(name)
  return text === '' ? null : Array.from(text).slice(0, LIMITS.label).join('')
}

/**
 * Le parcours lu dans le texte de la réponse de `GET /journey`.
 *
 * @throws {RetailerError} `CONTRACT_CHANGED` quand la réponse n'est pas du JSON (`JOURNEY_NOT_JSON`), n'a pas de liste de contextes
 *   (`JOURNEY_NO_CONTEXTS`), ou quand le contexte de courses n'a pas de vendeur lisible (`JOURNEY_NO_SELLER`) ou un identifiant d'une autre forme
 *   (`JOURNEY_STORE_ID_INVALID`).
 */
export function readJourney(text: string, status: number | null = null): JourneyReading {
  let body: unknown
  try {
    body = parseJson(text)
  } catch {
    throw new RetailerError('CONTRACT_CHANGED', status, 'JOURNEY_NOT_JSON')
  }
  const contexts = isBox(body) ? field(body, 'activeContexts') : undefined
  if (!Array.isArray(contexts))
    throw new RetailerError('CONTRACT_CHANGED', status, 'JOURNEY_NO_CONTEXTS')

  const types = new Set<string>()
  let others = 0
  let grocery: Box | null = null
  for (const element of contexts as unknown[]) {
    if (!isBox(element)) continue
    const type = field(element, 'type')
    if (typeof type !== 'string') continue
    if ((KNOWN_CONTEXT_TYPES as readonly string[]).includes(type)) types.add(type)
    else others += 1
    if (type === 'GROCERY' && grocery === null) grocery = element
  }
  const facts: StoreReadFacts = {
    status,
    contexts: KNOWN_CONTEXT_TYPES.filter((type) => types.has(type)),
    otherContexts: others,
    store: 'ABSENT',
    idForm: null,
    pickUp: null,
    label: false,
  }
  if (grocery === null) return { store: null, facts }
  const context = field(grocery, 'context')
  if (context === null || context === undefined)
    return { store: null, facts: { ...facts, store: 'NONE' } }
  if (!isBox(context)) throw new RetailerError('CONTRACT_CHANGED', status, 'JOURNEY_NO_SELLER')

  const seller = field(context, 'seller')
  const id = isBox(seller) ? field(seller, 'id') : undefined
  if (typeof id !== 'string')
    throw new RetailerError('CONTRACT_CHANGED', status, 'JOURNEY_NO_SELLER')
  const channels = field(context, 'channels')
  const label = labelOf(field(context, 'pointOfService'))
  const known: StoreReadFacts = {
    ...facts,
    store: 'READ',
    idForm: STORES.auchan.id.test(id) ? 'UUID' : 'OTHER',
    pickUp: Array.isArray(channels) ? (channels as unknown[]).includes('PICK_UP') : null,
    label: label !== null,
  }
  if (known.idForm !== 'UUID') {
    throw new RetailerError('CONTRACT_CHANGED', status, 'JOURNEY_STORE_ID_INVALID')
  }
  return { store: { id, label }, facts: known }
}
