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

// —— Les formes du libellé d'un produit habituel (DRV-635) ——————————————————————————————————————————————————————————————————————
// Relevé sur le vrai site (2026-10-19) pour « Oeufs C'est Qui Le Patron Plein Air x6 » : « c'est » (apostrophe) et « cest » (apostrophe retirée)
// retrouvent le produit, « c est » (apostrophe remplacée par une espace) ne trouve RIEN. Une forme qui remplace un signe par une espace fait donc
// perdre un produit disponible : ici, les signes se RETIRENT, ils ne se remplacent jamais par une espace, et l'apostrophe est gardée dans les
// premières formes.

/** Le nombre de formes dérivées d'un libellé, au plus : avec la requête du libellé tel quel, cinq requêtes par produit habituel. */
export const MAX_PRODUCT_FORMS = 4

/**
 * Sans signe : tout ce qui n'est ni lettre, ni chiffre, ni espace est retiré, SANS être remplacé par une espace (« c'est » devient « cest »,
 * « chocolat-noisette » devient « chocolatnoisette »). Seul le séparateur décimal entre deux chiffres reste (« 1,5 l »).
 */
function withoutSigns(text: string): string {
  return squash(
    text.replace(/[^\p{L}\p{N}\s]/gu, (sign, offset: number, whole: string) =>
      (sign === ',' || sign === '.') &&
      /\d/.test(whole[offset - 1] ?? '') &&
      /\d/.test(whole[offset + 1] ?? '')
        ? sign
        : '',
    ),
  )
}

/** Une quantité ou une unité seule (« 450 », « x6 », « 6x33 », « g », « cl ») : elle ne dit pas ce qu'est le produit. */
const QUANTITY_WORD = /^(?:\d+(?:[.,]\d+)?|x\d+|\d+x\d*|[mk]?g|[mcdk]?l|pieces?|u)$/

/** Les deux mots les plus longs d'un texte (de trois lettres au moins), dans l'ordre où ils s'écrivent : la marque et le mot principal, en général. */
function keywords(text: string): string | null {
  const words = text.split(' ').filter((word) => /^\p{L}{3,}$/u.test(word))
  const longest = words
    .map((word, index) => ({ word, index }))
    .sort((a, b) => length(b.word) - length(a.word) || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
  return longest.length === 0 ? null : longest.map(({ word }) => word).join(' ')
}

/**
 * Les formes à essayer, dans l'ordre, quand la recherche du libellé tel quel ne retrouve pas un produit habituel :
 *   1. minuscules, sans accents, « œ » en « oe », apostrophes droites (l'apostrophe est GARDÉE : « c'est ») ;
 *   2. sans aucun signe, sans espace en échange (« cest ») ;
 *   3. sans le texte entre parenthèses, sans mots de liaison ni quantités, sans signe ;
 *   4. les deux mots les plus longs seuls.
 * Jamais le libellé lui-même ni une forme qui ne s'en distingue que par la casse (le site ne la distingue pas : relevé du 2026-10-19), jamais deux
 * fois la même, jamais de forme de moins de deux caractères, au plus `MAX_PRODUCT_FORMS`. La plus simple est la dernière. Fonction pure.
 */
export function productSearchForms(label: string): string[] {
  const original = squash(label.normalize('NFC'))
  if (length(original) < 2) return []
  const folded = plain(original).replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  const bare = withoutSigns(folded)
  const cleaned = withoutSigns(clean(folded))
    .split(' ')
    .filter((word) => !QUANTITY_WORD.test(word))
    .join(' ')
  const forms: string[] = []
  for (const form of [folded, bare, cleaned, keywords(cleaned)]) {
    if (
      form === null ||
      length(form) < 2 ||
      form === original.toLowerCase() ||
      forms.includes(form)
    ) {
      continue
    }
    forms.push(form)
  }
  return forms.slice(0, MAX_PRODUCT_FORMS)
}
