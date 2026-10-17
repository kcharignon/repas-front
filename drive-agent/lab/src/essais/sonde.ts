// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 1 : sonde d'environnement (aucune requête).
import { probeLines } from '../probe'
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { button, hint, resultsPanel } from '../ui/widgets'

export const sonde: Essai = {
  id: 1,
  title: "Sonde d'environnement",
  summary: 'Hôte, magasin, cookie anti-robot (oui/non), écran, Wake Lock.',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const run = () => panel.set(probeLines(ctx.env.win).lines)
    append(
      ctx.main,
      hint('Aucune requête : le banc regarde la page ouverte.'),
      h('div', { class: 'row' }, button('Lancer la sonde', run, 'primary')),
      panel.el,
    )
    run()
  },
}
