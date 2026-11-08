/**
 * L'adresse d'origine d'une recette copiée de Marmiton (ADR 0037 du back, décision 10) : `https://www.marmiton.org/recettes/recette_{nom}_{id}.aspx`.
 * Le front ne la compose jamais : il la lit de la réponse et ne la rend en lien que si elle a exactement cette forme (https, l'hôte
 * `www.marmiton.org` et lui seul, ni port, ni identifiants, ni requête, ni fragment). Une autre valeur (`javascript:`, un autre site, un
 * nom de domaine qui commence par celui de Marmiton) ne donne rien, sans erreur.
 */
const PATH = /^\/recettes\/recette_[a-z0-9-]{1,150}_\d{1,12}\.aspx$/

export function marmitonSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const plain =
    url.protocol === 'https:' &&
    url.hostname === 'www.marmiton.org' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    PATH.test(url.pathname)

  // `href` normalise (espaces, barres obliques inverses, majuscules de l'hôte) : on ne garde que l'adresse déjà dans sa forme
  return plain && url.href === value ? value : null
}
