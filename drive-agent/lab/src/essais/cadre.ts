// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 5 : cadre natif (iframe plein écran vers la recherche du même hôte).
// Essai 6 : repérer le produit que l'utilisateur ajoute avec l'interface de Leclerc dans ce cadre.
import { DEFAULT_QUERY, FRAME_LOAD_TIMEOUT_MS } from '../config'
import type { PageWindow } from '../env'
import { armFrame, catalogOf, formatEvent, inspectFrame, summarizeEvents } from '../frame'
import { describeError } from '../http'
import { searchUrl } from '../store'
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { button, hint, labelled, resultsPanel } from '../ui/widgets'
import { needStore } from './common'

export const cadre: Essai = {
  id: 5,
  title: 'Cadre natif (page de Leclerc dans le banc)',
  summary: 'Page de Leclerc dans un cadre plein écran.',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const query = h('input', {
      value: ctx.state.lastQuery ?? DEFAULT_QUERY,
      attrs: { type: 'text', autocomplete: 'off', enterkeyhint: 'go' },
    })
    const open = button(
      'Ouvrir le cadre',
      () => {
        const store = needStore(ctx, panel)
        const text = query.value.trim()
        if (!store || text === '') {
          if (store) panel.set(['Écris un mot à chercher.'])
          return
        }
        const expectedPath = '/recherche.aspx'
        let loaded = false
        panel.set([`Ouverture du cadre vers la recherche « ${text} » du même hôte…`])
        const timer = ctx.env.win.setTimeout(() => {
          if (!loaded) {
            panel.add(
              `Le cadre ne s'est pas chargé en ${FRAME_LOAD_TIMEOUT_MS / 1000} s : refus ou réseau bloqué.`,
            )
          }
        }, FRAME_LOAD_TIMEOUT_MS)

        const session = ctx.openFrame(searchUrl(store, text), (iframe) => {
          loaded = true
          ctx.env.win.clearTimeout(timer)
          session.disarm?.()
          session.disarm = null
          const report = inspectFrame(iframe, expectedPath, ctx.env.win.location.pathname)
          panel.add('', ...report.lines)
          if (!report.accessible || !iframe.contentWindow) return
          try {
            session.disarm = armFrame(
              iframe.contentWindow as PageWindow,
              catalogOf(report.products),
              (event) => session.record(event),
              { now: ctx.env.now },
            )
            panel.add('Surveillance armée (XHR, fetch, DOM) : ajoute un produit dans le cadre.')
          } catch (error) {
            panel.add(`Surveillance impossible : ${describeError(error)}`)
          }
        })
      },
      'primary',
    )
    append(
      ctx.main,
      hint(
        "Le cadre prend tout l'écran ; la barre du haut ramène au banc. Si la page se recharge seule, le cadre est refusé : note-le.",
      ),
      labelled('Mot à chercher dans le cadre', query),
      h('div', { class: 'row' }, open),
      panel.el,
    )
  },
}

export const capture: Essai = {
  id: 6,
  title: 'Repérer un ajout fait dans le cadre',
  summary: 'Quel produit as-tu ajouté dans le cadre ?',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const session = ctx.state.frame
    if (!session || !session.isOpen()) {
      panel.set(['Aucun cadre ouvert : fais d’abord l’essai 5.'])
      append(ctx.main, panel.el)
      return
    }
    const refresh = () => {
      panel.set([
        summarizeEvents(session.events),
        ...session.events.map((event, i) => `${i + 1}. ${formatEvent(event)}`),
      ])
    }
    session.onEvent = refresh
    refresh()
    append(
      ctx.main,
      hint(
        "1. Voir le cadre. 2. Ajoute un produit avec les boutons de Leclerc. 3. Reviens au banc : le produit repéré s'affiche.",
      ),
      h(
        'div',
        { class: 'row' },
        button('Voir le cadre', () => session.show(), 'primary'),
        button('Mettre à jour', refresh),
      ),
      panel.el,
    )
  },
}
