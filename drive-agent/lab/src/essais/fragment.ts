// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 7 : fragments d'adresse de 6, 16 et 64 Ko, vers Repas et vers Leclerc.
// Essai 8 : retour vers Repas avec `#lab=ok`.
// La navigation est la seule sortie du banc vers un autre hôte que Leclerc : explicite, après confirmation.
import { FRAGMENT_SIZES_KO, REPAS_ORIGIN } from '../config'
import { fragmentUrl, makeFragment, readLabHash } from '../fragment'
import { fragmentTargetUrl } from '../store'
import { append, h } from '../ui/dom'
import type { Essai, ScreenContext } from '../ui/types'
import { button, confirmBox, heading, hint, resultsPanel } from '../ui/widgets'
import { NO_STORE } from './common'

/** Ce que l'adresse de la page ouverte porte après `#lab=` : à lire sur la page d'arrivée. */
function receivedLines(ctx: ScreenContext): string[] {
  const verdict = readLabHash(ctx.env.win.location.hash)
  return [
    verdict
      ? `Fragment reçu sur cette page : ${verdict.text}`
      : 'Fragment reçu sur cette page : aucun (#lab=).',
  ]
}

function goAfterConfirm(
  ctx: ScreenContext,
  zone: HTMLElement,
  message: string[],
  url: string,
): void {
  zone.replaceChildren()
  confirmBox(
    zone,
    {
      message: [...message, 'Cette page sera quittée (bouton retour du téléphone pour revenir).'],
      confirmLabel: 'Oui, y aller',
    },
    () => ctx.env.navigate(url),
  )
}

export const fragment: Essai = {
  id: 7,
  title: 'Fragment d’adresse (6, 16, 64 Ko)',
  summary: "Longs fragments d'adresse vers Repas ou Leclerc.",
  render(ctx) {
    const panel = resultsPanel(ctx)
    const zone = h('div')
    panel.set(receivedLines(ctx))

    const toRepas = FRAGMENT_SIZES_KO.map((ko) =>
      button(`${ko} Ko vers Repas`, () =>
        goAfterConfirm(
          ctx,
          zone,
          [`Tu vas ouvrir ${REPAS_ORIGIN} avec un fragment factice de ${ko} Ko.`],
          fragmentUrl(REPAS_ORIGIN, ko),
        ),
      ),
    )
    const toLeclerc = FRAGMENT_SIZES_KO.map((ko) =>
      button(`${ko} Ko vers Leclerc`, () => {
        const store = ctx.store()
        if (!store) {
          panel.set([NO_STORE])
          return
        }
        goAfterConfirm(
          ctx,
          zone,
          [`Tu vas ouvrir une page de ton magasin avec un fragment factice de ${ko} Ko.`],
          fragmentTargetUrl(store, makeFragment(ko * 1024)),
        )
      }),
    )
    append(
      ctx.main,
      hint("Après l'arrivée, relance le favori : l'essai 7 donne la taille reçue."),
      heading('Vers Repas'),
      h('div', { class: 'row' }, ...toRepas),
      heading('Vers Leclerc'),
      h('div', { class: 'row' }, ...toLeclerc),
      zone,
      panel.el,
    )
  },
}

export const retour: Essai = {
  id: 8,
  title: 'Retour vers Repas',
  summary: 'Retour vers Repas avec #lab=ok.',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const zone = h('div')
    panel.set(receivedLines(ctx))
    append(
      ctx.main,
      hint(
        `Ouvre ${REPAS_ORIGIN}/#lab=ok. Regarde si l'adresse garde le fragment, puis relance le favori.`,
      ),
      h(
        'div',
        { class: 'row' },
        button(
          'Retourner vers Repas…',
          () =>
            goAfterConfirm(
              ctx,
              zone,
              [`Tu vas ouvrir ${REPAS_ORIGIN} avec le fragment ok.`],
              `${REPAS_ORIGIN}/#lab=ok`,
            ),
          'primary',
        ),
      ),
      zone,
      panel.el,
    )
  },
}
