/** Ce qu'il faut pour écrire la phrase de synthèse : les articles de la liste, rangés par ce qui leur arrive. */
export interface SendCounts {
  known: number
  new: number
  haveAtHome: number
  skipped: number
}

/** La fonction de traduction de vue-i18n, réduite à ce qu'on lui demande ici (un texte, des valeurs nommées, un nombre pour le pluriel). */
type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

/**
 * La phrase unique de l'écran de l'envoi, construite avec les comptes (DRV-622) : « 6 articles : 2 sont déjà choisis, 4 sont à choisir sur
 * Leclerc. » On n'écrit que ce qui existe (jamais « 0 »), et « j'en ai toujours » et « pas cette fois » se disent ensemble : ni l'un ni
 * l'autre n'ira au panier, et une phrase de plus de 20 mots ne se lit pas. Vide quand la liste n'a aucun article.
 */
export function sendSummary(t: Translate, counts: SendCounts): string {
  const other = counts.haveAtHome + counts.skipped
  const total = counts.known + counts.new + other
  if (total === 0) return ''

  const part = (key: 'known' | 'new' | 'other', all: string, count: number): string[] => {
    if (count === 0) return []

    return count === total
      ? [t(`driveSend.summary.${all}`, {}, total)]
      : [t(`driveSend.summary.${key}`, { count }, count)]
  }
  const parts = [
    ...part('known', 'allKnown', counts.known),
    ...part('new', 'allNew', counts.new),
    ...part('other', 'allOther', other),
  ]

  return t('driveSend.summary.sentence', {
    total: t('driveSend.summary.total', { count: total }, total),
    parts: parts.join(t('driveSend.summary.join')),
  })
}
