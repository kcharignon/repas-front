// Chercher un nom (d'ingrédient) comme le fait le back (ADR 0019 du back, `SearchRelevance` et `JaroWinkler`) : « boeuf » trouve « Bœuf »,
// « tomtae » trouve « tomate », et le plus proche passe en premier. Pur : aucune dépendance, jouable partout (jsdom compris).

/** Au-dessous de ce score, un nom n'est pas une réponse à la recherche (le seuil du back). */
export const MINIMUM_RELEVANCE = 0.85

/** Un mot du nom qui ressemble au texte vaut moins que le nom entier qui lui ressemble. */
const WORD_PENALTY = 0.9
const BOOST_THRESHOLD = 0.7
const PREFIX_WEIGHT = 0.1
const MAX_PREFIX = 4

// Les lettres que la décomposition d'Unicode ne défait pas : le back les écrit en toutes lettres (« œ » donne « oe »)
const LIGATURES: Record<string, string> = {
  œ: 'oe',
  æ: 'ae',
  ß: 'ss',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
}

/**
 * Le nom sans accent, sans majuscule, ligatures défaites, mots séparés par des tirets : la forme `slugged_name` du back
 * (« Bœuf haché » et « boeuf hache » donnent tous deux « boeuf-hache »).
 */
export function foldName(text: string): string {
  return text
    .toLocaleLowerCase('fr')
    .replace(/[œæßøłđðþ]/g, (letter) => LIGATURES[letter] ?? letter)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function jaro(first: string[], second: string[]): number {
  if (first.length === 0 && second.length === 0) return 1
  if (first.length === 0 || second.length === 0) return 0

  // Deux lettres ne se correspondent que si elles sont assez proches l'une de l'autre
  const window = Math.max(Math.floor(Math.max(first.length, second.length) / 2) - 1, 0)
  const firstMatched = Array.from<boolean>({ length: first.length }).fill(false)
  const secondMatched = Array.from<boolean>({ length: second.length }).fill(false)

  let matches = 0
  for (let i = 0; i < first.length; i++) {
    const from = Math.max(0, i - window)
    const to = Math.min(second.length - 1, i + window)
    for (let j = from; j <= to; j++) {
      if (!secondMatched[j] && first[i] === second[j]) {
        firstMatched[i] = true
        secondMatched[j] = true
        matches++
        break
      }
    }
  }
  if (matches === 0) return 0

  // Une transposition = deux lettres en commun qui ne sont pas dans le même ordre
  let outOfOrder = 0
  let j = 0
  for (let i = 0; i < first.length; i++) {
    if (!firstMatched[i]) continue
    while (!secondMatched[j]) j++
    if (first[i] !== second[j]) outOfOrder++
    j++
  }
  const transpositions = Math.floor(outOfOrder / 2)

  return (
    (matches / first.length + matches / second.length + (matches - transpositions) / matches) / 3
  )
}

/** Similarité de Jaro-Winkler : 1 pour deux textes identiques, 0 pour deux textes sans lettre commune. */
export function jaroWinkler(first: string, second: string): number {
  const a = Array.from(first)
  const b = Array.from(second)
  const base = jaro(a, b)
  if (base < BOOST_THRESHOLD) return base

  let prefix = 0
  const limit = Math.min(MAX_PREFIX, a.length, b.length)
  while (prefix < limit && a[prefix] === b[prefix]) prefix++

  return base + prefix * PREFIX_WEIGHT * (1 - base)
}

/**
 * Pertinence d'un nom pour un texte cherché, de 0 à 1 ; les deux sont déjà passés par `foldName`. Seul un nom identique au texte atteint 1 ;
 * un nom ou un mot du nom qui commence par le texte passe devant (« tom » trouve « tomate » avant « tomate cerise »), un texte au milieu
 * d'un mot ne compte pas (« riz » ne trouve pas « chorizo »), et Jaro-Winkler rattrape les fautes de frappe.
 */
export function relevance(search: string, name: string): number {
  if (search === '' || name === '') return 0
  if (search === name) return 1

  let score = jaroWinkler(search, name)
  for (const word of name.split('-')) {
    score = Math.max(score, WORD_PENALTY * jaroWinkler(search, word))
  }

  // Le texte commence le nom ou l'un de ses mots
  if (`-${name}`.includes(`-${search}`)) {
    score = Math.max(score, 0.9 + (0.1 * Array.from(search).length) / Array.from(name).length)
  }

  return Math.min(score, 0.999)
}

/** Le texte tapé est exactement ce nom (casse, accents, ligatures et ponctuation ignorés) : on n'a rien à créer. */
export function isSameName(search: string, name: string): boolean {
  const wanted = foldName(search)

  return wanted !== '' && wanted === foldName(name)
}

/**
 * Les choix qui ressemblent au texte, le plus proche d'abord (ex æquo : ordre alphabétique, deux appels donnent le même ordre).
 * Sans texte, tous les choix tels quels ; un texte sans aucune lettre ni chiffre (« !! ») ne ressemble à rien.
 */
export function rankByName<T extends { value: string; label: string }>(
  options: readonly T[],
  search: string,
): T[] {
  if (search.trim() === '') return [...options]
  const wanted = foldName(search)
  if (wanted === '') return []

  return options
    .map((option) => {
      const name = foldName(option.label)

      return { option, name, score: relevance(wanted, name) }
    })
    .filter((match) => match.score >= MINIMUM_RELEVANCE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
        (a.option.value < b.option.value ? -1 : a.option.value > b.option.value ? 1 : 0),
    )
    .map((match) => match.option)
}
