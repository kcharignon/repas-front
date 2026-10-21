// Les phrases de la fusion qui dépendent de nombres (accords au singulier et au pluriel, compteurs à zéro non dits) et le rangement
// des paires par rayon : du texte et de l'ordre, aucune règle métier (le back décide ce qui peut se fusionner).
import type { DuplicatePair, DuplicateSide, MergePreview } from '@/api'

type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** Les niveaux que ce front connaît ; un niveau que le back ajouterait plus tard se lit comme une simple suggestion. */
export const LEVELS = ['EXACT', 'TYPO', 'SUGGESTION'] as const
export type Level = (typeof LEVELS)[number]

export function levelOf(pair: Pick<DuplicatePair, 'level'>): Level {
  return LEVELS.find((level) => level === pair.level) ?? 'SUGGESTION'
}

/** « 7 recettes · 2 listes » ; un compteur à zéro ne se dit pas (« 2 listes ») ; vide si l'ingrédient n'est utilisé nulle part. */
export function usageText(t: Translate, usage: { recipeCount: number; listCount: number }): string {
  const parts: string[] = []
  if (usage.recipeCount > 0)
    parts.push(t('ingredients.merge.recipes', { count: usage.recipeCount }, usage.recipeCount))
  if (usage.listCount > 0)
    parts.push(t('ingredients.merge.lists', { count: usage.listCount }, usage.listCount))

  return parts.join(' · ')
}

/** La suite « 7 recettes et 2 listes (de courses) » d'une phrase ; vide s'il n'y a ni l'un ni l'autre. */
function countedItems(
  t: Translate,
  usage: { recipeCount: number; listCount: number },
  listKey: 'lists' | 'listsFull',
): string {
  const parts: string[] = []
  if (usage.recipeCount > 0)
    parts.push(t('ingredients.merge.recipes', { count: usage.recipeCount }, usage.recipeCount))
  if (usage.listCount > 0)
    parts.push(t(`ingredients.merge.${listKey}`, { count: usage.listCount }, usage.listCount))

  return parts.join(` ${t('ingredients.merge.and')} `)
}

/**
 * La phrase d'effet d'une carte : ce qui passe sur l'ingrédient gardé, d'après les compteurs de celui qui ne l'est pas.
 * « 7 recettes et 2 listes passent sur « Tomate ». » ; « 1 recette passe sur… » ; « « Tomates » n'est utilisé nulle part. »
 */
export function effectSentence(
  t: Translate,
  absorbed: Pick<DuplicateSide, 'name' | 'recipeCount' | 'listCount'>,
  kept: Pick<DuplicateSide, 'name'>,
): string {
  const items = countedItems(t, absorbed, 'lists')
  if (items === '') return t('ingredients.merge.unused', { name: absorbed.name })
  // Le verbe s'accorde avec ce qui est dit : une seule chose au singulier, sinon le pluriel
  const total = absorbed.recipeCount + absorbed.listCount

  return t('ingredients.merge.moves', { what: items, name: kept.name }, total)
}

/** La première ligne de la confirmation d'un ancien back, sans total : « 7 recettes et 2 listes de courses utiliseront « Tomate ». » */
export function usesSentence(
  t: Translate,
  preview: Pick<MergePreview, 'recipeCount' | 'listCount'> & { absorbedName: string },
  keptName: string,
): string {
  const items = countedItems(t, preview, 'listsFull')
  if (items === '') return t('ingredients.merge.unused', { name: preview.absorbedName })
  const total = preview.recipeCount + preview.listCount

  return t('ingredients.merge.uses', { what: items, name: keptName }, total)
}

/** Ce que l'aperçu dit des compteurs ; les trois clés d'après la fusion manquent chez un ancien back (`MergePreview` les écrit toujours). */
type EffectCounts = Pick<MergePreview, 'recipeCount' | 'listCount'> &
  Partial<Pick<MergePreview, 'resultRecipeCount' | 'resultListCount' | 'recoveredConversionCount'>>

export interface MergeEffects {
  /** Combien de recettes et de listes utiliseront l'ingrédient gardé APRÈS la fusion. */
  total: string
  /** Ce qui est remplacé (les recettes et les listes de l'absorbé) ; absent quand l'absorbé n'est utilisé nulle part. */
  replaced: string | null
  /** Les conversions que le gardé reçoit de l'absorbé ; absent quand il n'en reçoit aucune. */
  conversions: string | null
}

const isCount = (value: unknown): value is number => typeof value === 'number'

/**
 * Les trois premières lignes de la confirmation (`docs/ingredients/fusion.md` § 9.3) : le TOTAL d'après (`resultRecipeCount`,
 * `resultListCount` : l'union, une recette qui avait déjà les deux compte une fois), ce qui est remplacé (`recipeCount`, `listCount` :
 * ce qui se déplace), les conversions récupérées. Un back qui n'envoie pas encore le total : l'ancienne phrase, calculée sur ce qui se
 * déplace, et rien d'autre.
 */
export function mergeEffects(
  t: Translate,
  preview: EffectCounts,
  names: { absorbed: string; kept: string },
): MergeEffects {
  const { resultRecipeCount, resultListCount } = preview
  if (!isCount(resultRecipeCount) || !isCount(resultListCount))
    return {
      total: usesSentence(t, { ...preview, absorbedName: names.absorbed }, names.kept),
      replaced: null,
      conversions: null,
    }

  const after = countedItems(
    t,
    { recipeCount: resultRecipeCount, listCount: resultListCount },
    'listsFull',
  )
  const moved = countedItems(t, preview, 'listsFull')
  const recovered = preview.recoveredConversionCount

  return {
    total:
      after === ''
        ? t('ingredients.merge.unused', { name: names.kept })
        : t('ingredients.merge.total', { name: names.kept, usage: after }),
    replaced:
      moved === ''
        ? null
        : t('ingredients.merge.replaced', {
            absorbed: names.absorbed,
            kept: names.kept,
            usage: moved,
          }),
    conversions:
      isCount(recovered) && recovered > 0
        ? t(
            'ingredients.merge.conversions',
            { count: recovered, absorbed: names.absorbed, kept: names.kept },
            recovered,
          )
        : null,
  }
}

/** « « tranche » », « « tranche » et « pincée » » : les noms des unités qui manquent, entre guillemets. */
export function unitList(t: Translate, names: readonly string[]): string {
  const quoted = names.map((name) => `« ${name} »`)
  if (quoted.length <= 1) return quoted.join('')
  const last = quoted[quoted.length - 1] ?? ''

  return `${quoted.slice(0, -1).join(', ')} ${t('ingredients.merge.and')} ${last}`
}

/** Les valeurs de `blockedBy` que ce front sait dire ; toute autre est un refus générique. */
export const KNOWN_BLOCKS = [
  'SAME_INGREDIENT',
  'COMMON_INGREDIENT',
  'USED_BY_ANOTHER_USER',
  'IN_SENT_LIST',
  'UNIT_MISSING',
] as const

/** La clé du texte d'un refus de l'aperçu (hors `UNIT_MISSING`, qui a son propre bloc) ; `blockedBy` inconnu : le texte générique. */
export function blockKey(blockedBy: string | null | undefined): string | null {
  if (blockedBy === null || blockedBy === undefined) return null
  if (blockedBy === 'UNIT_MISSING') return null
  const known = KNOWN_BLOCKS.find((block) => block === blockedBy)

  return known === undefined ? 'blockedOther' : `blocked.${known}`
}

export interface DepartmentGroup {
  slug: string
  name: string
  pairs: DuplicatePair[]
}

/** Les paires rangées par rayon, dans l'ordre où le back les rend (la plus probable en tête) : le rayon de la première vient en premier. */
export function groupByDepartment(pairs: readonly DuplicatePair[]): DepartmentGroup[] {
  const groups = new Map<string, DepartmentGroup>()
  for (const pair of pairs) {
    const group = groups.get(pair.first.departmentSlug)
    if (group === undefined)
      groups.set(pair.first.departmentSlug, {
        slug: pair.first.departmentSlug,
        name: pair.first.departmentName,
        pairs: [pair],
      })
    else group.pairs.push(pair)
  }

  return [...groups.values()]
}

/** Une clé stable pour une paire (ses deux slugs, rangés comme le back les rend). */
export const pairKey = (pair: DuplicatePair): string => `${pair.first.slug}|${pair.second.slug}`

/** Celui des deux côtés qu'on garde (le choix de l'utilisateur, sinon la suggestion du back), et l'autre, qui est absorbé. */
export function sidesOf(
  pair: DuplicatePair,
  chosenKeep: string | undefined,
): { kept: DuplicateSide; absorbed: DuplicateSide } {
  const keepSlug = chosenKeep ?? pair.suggestedKeep
  const keepFirst = keepSlug === pair.first.slug
  const keepSecond = keepSlug === pair.second.slug
  // Une suggestion qui ne désigne aucun des deux (le back ne le fait pas) : le premier côté
  const first = keepFirst || !keepSecond

  return first
    ? { kept: pair.first, absorbed: pair.second }
    : { kept: pair.second, absorbed: pair.first }
}
