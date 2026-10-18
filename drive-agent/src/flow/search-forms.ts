// Les formes dérivées d'un nom (ticket D de l'audit du 2026-10-18, hypothèses H3 et H7). Le moteur de recherche de Leclerc est sensible aux
// accents, à la ligature « œ », au pluriel et aux noms longs ; or le plan envoie le nom de l'ingrédient tel qu'il est dans Repas (« œuf »,
// « crème fraîche épaisse »). Quand la recherche du nom ne rend aucun produit, l'agent essaie ces formes, une par une, dans cet ordre :
//   1. minuscules, sans accents, apostrophes droites (« Tomates » → « tomates », « huile d’olive » → « huile d'olive ») ;
//   2. « œ » en « oe » et « æ » en « ae » (« œuf » → « oeuf ») ;
//   3. le singulier ou le pluriel simple : retrait d'un « s » ou « x » final, ou ajout d'un « s » (« tomates » → « tomate ») ;
//   4. sans le texte entre parenthèses ni les mots de liaison (« herbes de provence » → « herbes provence ») ;
//   5. le premier mot significatif seul (« herbes »).
// La forme 2 part de la 1, les formes 3 et 4 de la 2, la 5 de la 4 : les accents ne reviennent jamais. Une forme identique au nom, à une forme déjà
// donnée, vide ou de moins de deux caractères est écartée : jamais deux requêtes identiques. Au plus `MAX_FALLBACKS` formes ; quand cinq restent,
// c'est le pluriel qui saute (la moins utile pour un nom long). Fonction pure : aucune requête ici.

/** Le nombre de requêtes de repli, au plus, pour un nom (hors la recherche du nom lui-même). */
export const MAX_FALLBACKS = 4

/** Les mots de liaison, sans accent (« à » devient « a » avant le filtre) ; « d' » et « l' » collés à un mot sont retirés à part. */
const LINKING: ReadonlySet<string> = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'au',
  'aux',
  'a',
  'et',
  'en',
  'ou',
  'pour',
  'avec',
  'sans',
  'sur',
  'sous',
  "d'",
  "l'",
])

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

const length = (text: string): number => Array.from(text).length

/** Minuscules, sans accent ni marque combinante (la ligature « œ » reste), apostrophes typographiques redressées. Entrée et sortie en NFC. */
function plain(text: string): string {
  return squash(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .normalize('NFC')
      .replace(/[‘’ʼ]/g, "'"),
  )
}

/**
 * Le singulier ou le pluriel simple du premier mot (le nom, en français) : un « s » ou « x » final se retire (au moins quatre lettres), sinon
 * un « s » s'ajoute, mais seulement à un nom d'un seul mot, de trois lettres au moins et qui ne finit pas par « z » (« riz »). `null` quand le
 * texte porte une parenthèse (la forme 4 s'en charge) ou que le premier mot n'est pas fait que de lettres.
 */
function togglePlural(base: string): string | null {
  if (base.includes('(')) return null
  const [first = '', ...rest] = base.split(' ')
  if (!/^\p{L}+$/u.test(first)) return null
  const last = first.at(-1)
  if (last === 's' || last === 'x') {
    return length(first) >= 4 ? [first.slice(0, -1), ...rest].join(' ') : null
  }
  if (rest.length > 0 || last === 'z' || length(first) < 3) return null
  return `${first}s`
}

/** Sans le texte entre parenthèses (même non fermé) et sans les mots de liaison : « pates (seches) » → « pates », « huile d'olive » → « huile olive ». */
function clean(base: string): string {
  return squash(base.replace(/\([^)]*\)?/g, ' ').replace(/[()]/g, ' '))
    .split(' ')
    .map((word) => word.replace(/^[dl]'(?=.)/, ''))
    .filter((word) => word !== '' && !LINKING.has(word))
    .join(' ')
}

/** Le premier mot significatif : fait de lettres (tirets et apostrophes admis au milieu), de deux caractères au moins ; ni nombre ni ponctuation. */
function firstWord(cleaned: string): string | null {
  return cleaned.split(' ').find((word) => /^\p{L}[\p{L}'-]+$/u.test(word)) ?? null
}

/**
 * Les formes à essayer, dans l'ordre, quand la recherche de `name` ne rend rien. Jamais `name` lui-même, jamais une forme en double, vide ou de
 * moins de deux caractères, au plus `MAX_FALLBACKS`. Un nom vide, d'espaces ou d'un seul caractère n'en a aucune. Le résultat est le même que `name`
 * soit composé (NFC) ou décomposé (NFD).
 */
export function searchForms(name: string): string[] {
  const original = squash(name.normalize('NFC'))
  if (length(original) < 2) return []
  const accentless = plain(original)
  const base = accentless.replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  const plural = togglePlural(base)
  const cleaned = clean(base)
  const ordered = [accentless, base, plural, cleaned, firstWord(cleaned)]

  const forms: string[] = []
  for (const form of ordered) {
    if (form === null || length(form) < 2 || form === original || forms.includes(form)) continue
    forms.push(form)
  }
  return forms.length > MAX_FALLBACKS ? forms.filter((form) => form !== plural) : forms
}
