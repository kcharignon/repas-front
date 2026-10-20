// Les écrans : chacun reçoit ses données et un rappel `answer`, et rend ses nœuds. Aucune logique d'envoi ici.
import { append, clear, h, type Child } from './dom'
import { own } from '../own'
import { CAUSE_TEXTS, ERROR_TEXTS, errorParts, S } from './strings'
import type {
  ChallengeProps,
  ChooserProps,
  DiagnosticProps,
  DiagnosticRow,
  EndProps,
  EntryProps,
  ErrorProps,
  ProgressPatch,
  ProgressProps,
  QuantityProps,
  ResumeProps,
  ScreenAnswer,
  ScreenName,
  ScreenProps,
  StoreProps,
  SummaryProps,
} from './types'

/** Un écran affiché : ses nœuds, et de quoi le suivre. */
export interface Rendered {
  el: HTMLElement
  /** L'élément qui reçoit le focus à l'ouverture (par défaut le premier bouton). */
  focus?: HTMLElement
  /** Écran de progression : applique une mise à jour. */
  update?: (patch: ProgressPatch) => void
  /** Appelé une fois l'écran dans la page. */
  start?: () => void
  /** Appelé quand l'écran est remplacé ou fermé. */
  dispose?: () => void
  /**
   * Un bandeau en bas de l'écran : la page de l'enseigne reste visible et touchable au-dessus (pas de fond, la fenêtre n'est pas modale). Pour
   * ce qu'il faut faire DANS la page, comme la vérification de l'anti-robot (ticket K).
   */
  sheet?: boolean
}

type Answer<K extends ScreenName> = (value: ScreenAnswer<K>) => void
type Renderer<K extends ScreenName> = (props: ScreenProps<K>, answer: Answer<K>) => Rendered

const LOG_SIZE = 5

/**
 * Le rang d'un bouton dans l'écran (DRV-624) : `primary` est LE geste de l'écran, `secondary` une autre réponse possible, `quiet` ce qu'on
 * garde à portée sans l'offrir (annuler l'envoi, revenir en arrière). Aucun écran n'a plus de bouton rouge : annuler se défait en relançant l'envoi.
 */
function button(
  label: string,
  onClick: () => void,
  kind: 'plain' | 'primary' | 'secondary' | 'quiet' = 'plain',
) {
  return h('button', {
    text: label,
    class: kind === 'plain' ? '' : kind,
    attrs: { type: 'button' },
    on: { click: onClick },
  })
}

const title = (value: string) => h('h1', { text: value, attrs: { id: 'titre', tabindex: '-1' } })

function screen(...children: Child[]): HTMLElement {
  const el = h('section', { class: 'screen', attrs: { 'aria-labelledby': 'titre' } })
  append(el, ...children)
  return el
}

const actions = (...buttons: HTMLElement[]) => h('div', { class: 'actions' }, ...buttons)

const welcome: Renderer<'welcome'> = (_props, answer) => {
  const diagnostic = button(S.welcome.diagnostic, () => answer('diagnostic'), 'primary')
  return {
    el: screen(
      title(S.welcome.title),
      h('p', { text: S.welcome.text }),
      actions(
        diagnostic,
        button(S.welcome.close, () => answer('close')),
      ),
    ),
  }
}

const summary: Renderer<'summary'> = (props: SummaryProps, answer) => {
  const items = props.lines.map((line) =>
    h('li', {
      text: `${line.name} : ${S.summary.status[line.status]}${line.detail ? ` (${line.detail})` : ''}`,
    }),
  )
  const start = button(S.summary.start, () => answer('start'), 'primary')
  // Une phrase, la même que sur l'écran de l'envoi de Repas : jamais une liste de compteurs, jamais un zéro (DRV-626).
  const sentence = S.summary.sentence(props)
  return {
    el: screen(
      title(S.summary.title),
      sentence === '' ? null : h('p', { class: 'lead', text: sentence }),
      h('details', {}, h('summary', { text: S.summary.list }), h('ul', {}, ...items)),
      actions(
        start,
        button(S.summary.cancel, () => answer('cancel')),
      ),
    ),
    focus: start,
  }
}

const resume: Renderer<'resume'> = (props: ResumeProps, answer) => {
  const first = button(S.resume.resume, () => answer('resume'), 'primary')
  return {
    el: screen(
      title(S.resume.title),
      h('p', { text: S.resume.text(props.done, props.total) }),
      actions(
        first,
        button(S.resume.restart, () => answer('restart')),
        button(S.resume.cancel, () => answer('cancel')),
      ),
    ),
    focus: first,
  }
}

const progress: Renderer<'progress'> = (props: ProgressProps, answer) => {
  const bar = h('progress', { attrs: { 'aria-label': S.progress.bar } })
  const count = h('p', { class: 'hint' })
  const current = h('p')
  const log = h('ul', { attrs: { 'aria-label': S.progress.log } })
  const stop = button(S.progress.stop, () => {
    stop.disabled = true
    stop.textContent = S.progress.stopping
    answer('stop')
  })
  const state = { total: props.total, done: props.done }
  const paint = () => {
    bar.max = Math.max(state.total, 1)
    bar.value = Math.min(state.done, bar.max)
    count.textContent = S.progress.count(state.done, state.total)
  }
  const addEntry = (entry: string) => {
    log.appendChild(h('li', { text: entry }))
    while (log.children.length > LOG_SIZE) log.firstElementChild?.remove()
  }
  props.log.slice(-LOG_SIZE).forEach(addEntry)
  current.textContent = S.progress.current(props.current)
  paint()
  return {
    el: screen(
      title(props.title ?? S.progress.title),
      props.lead ? h('p', { class: 'lead', text: props.lead }) : null,
      bar,
      count,
      // Une seule zone annoncée par les lecteurs d'écran : l'ingrédient en cours et les dernières actions.
      h(
        'div',
        { class: 'live', attrs: { 'aria-live': 'polite', 'aria-relevant': 'additions text' } },
        current,
        log,
      ),
      h('p', { class: 'hint', text: S.progress.keepOpen }),
      actions(stop),
    ),
    focus: stop,
    update(patch) {
      if (patch.total !== undefined) state.total = patch.total
      if (patch.done !== undefined) state.done = patch.done
      if (patch.current !== undefined) current.textContent = S.progress.current(patch.current)
      if (patch.entry !== undefined) addEntry(patch.entry)
      paint()
    },
  }
}

const quantity: Renderer<'quantity'> = (props: QuantityProps, answer) => {
  const input = h('input', {
    value: String(props.packs ?? 1),
    attrs: { id: 'quantite', type: 'number', min: '1', max: '99', step: '1', inputmode: 'numeric' },
  })
  // Le champ est prérempli : on tape le nombre PAR-DESSUS (taper 4 donne « 4 », pas « 14 »). Tout est donc sélectionné à l'ouverture, au focus et au
  // toucher, tant que rien n'a été tapé : un toucher pose le curseur après le « 1 » et désélectionnerait, parfois APRÈS le toucher (le curseur se
  // place de façon asynchrone). La première frappe re-sélectionne donc elle-même juste avant d'insérer (`beforeinput`, `keydown`) : quoi qu'ait
  // fait le curseur, le premier chiffre remplace le « 1 » (DRV-626).
  let pristine = true
  const selectAll = () => {
    if (pristine) input.select()
  }
  input.addEventListener('focus', selectAll)
  input.addEventListener('click', () => setTimeout(selectAll, 0))
  input.addEventListener('keydown', selectAll)
  input.addEventListener('beforeinput', selectAll)
  input.addEventListener('input', () => (pristine = false))
  const problem = h('p', { class: 'error', attrs: { role: 'alert' } })
  const form = h(
    'form',
    {
      attrs: { novalidate: '' },
      on: {
        submit: (event) => {
          event.preventDefault()
          const value = Number(input.value)
          if (input.value.trim() === '' || !Number.isInteger(value) || value < 1 || value > 99) {
            problem.textContent = S.quantity.invalid
            input.setAttribute('aria-invalid', 'true')
            input.focus()
            return
          }
          answer(value)
        },
      },
    },
    h('label', { text: S.quantity.label, attrs: { for: 'quantite' } }),
    input,
    problem,
    h(
      'div',
      { class: 'actions' },
      h('button', { text: S.quantity.validate, class: 'primary', attrs: { type: 'submit' } }),
      button(S.quantity.skip, () => answer(null)),
    ),
  )
  return {
    el: screen(
      title(S.quantity.title),
      h('p', { text: S.quantity.text(props.productLabel, props.ingredient) }),
      props.need ? h('p', { text: S.picker.need(props.need) }) : null,
      form,
    ),
    focus: input,
  }
}

/**
 * L'écran de choix d'un produit (phase B). En haut : l'article et son compteur, puis les autres réponses possibles (« Pas cette fois »,
 * « J'en ai toujours », « Passer ces n articles »). Au milieu : la liste de produits, dont chaque « Choisir » est le geste principal. Tout en bas
 * de la liste, discret : « Annuler l'envoi » (le menu de l'application laisse la place de le faire défiler jusque-là, `--clear`).
 */
const chooser: Renderer<'chooser'> = (props: ChooserProps, answer) => {
  const zone = h('div', { class: 'zone' })
  // Les articles encore à choisir, celui-ci compris : « Passer ces n articles » les passe tous (« Pas cette fois »), sans rien retenir.
  const left = props.total - props.position + 1
  // Le focus arrive sur l'article (jamais sur un bouton : un « Entrée » tenu ne doit pas répondre à l'article suivant) et sa ligne est une zone
  // annoncée (`role="status"`) : « Poivre (2 sur 4) » se lit d'une traite. Le compteur reste du texte de cette ligne : posé dans un `span` à part,
  // la WebView d'Android ne l'exposait pas (relevé dans l'émulateur).
  // Un seul article à choisir : pas de compteur (« (1 sur 1) » ne dit rien).
  const head = h(
    'p',
    { class: 'head', attrs: { tabindex: '-1', role: 'status' } },
    h('strong', { text: props.ingredient, attrs: { id: 'titre' } }),
    props.total > 1 ? ` (${S.chooser.counter(props.position, props.total)})` : null,
  )
  const skip = button(S.chooser.skip, () => answer({ kind: 'skip' }), 'secondary')
  const have = button(S.chooser.haveAtHome, () => answer({ kind: 'have' }), 'secondary')
  const choices = actions(skip, have)
  // Le bas de l'écran : la recherche et la liste de produits, puis « Annuler l'envoi ». La confirmation de « Passer ces n articles » les cache.
  const foot = h(
    'div',
    { class: 'foot' },
    button(S.chooser.cancel, () => answer({ kind: 'cancel' }), 'quiet'),
  )
  const scroll = h('div', { class: 'scroll' }, zone, foot)
  const bar = h(
    'div',
    { class: 'bar', attrs: { role: 'group', 'aria-label': S.chooser.group } },
    head,
    choices,
  )
  if (left > 1) {
    // La confirmation d'une ligne : seulement quand un des articles passés n'a encore aucun produit retenu. Elle prend la place des réponses ET de
    // la liste de produits : deux boutons, une seule décision à l'écran (DRV-626).
    const confirm = h('div', { class: 'confirm', hidden: true })
    const sure = h('p', {
      class: 'sure',
      text: S.chooser.restSure(left),
      attrs: { role: 'alert', tabindex: '-1' },
    })
    const rest = button(
      S.chooser.rest(left),
      () => {
        if (props.confirmRest !== true) return answer({ kind: 'rest' })
        choices.hidden = true
        scroll.hidden = true
        confirm.hidden = false
        sure.focus({ preventScroll: true })
      },
      'secondary',
    )
    append(
      confirm,
      sure,
      actions(
        button(S.chooser.rest(left), () => answer({ kind: 'rest' }), 'primary'),
        button(
          S.chooser.restBack,
          () => {
            confirm.hidden = true
            scroll.hidden = false
            choices.hidden = false
            rest.focus({ preventScroll: true })
          },
          'secondary',
        ),
      ),
    )
    choices.appendChild(rest)
    bar.appendChild(confirm)
  }
  let dispose: (() => void) | void
  const el = h(
    'section',
    { class: 'screen fill', attrs: { 'aria-labelledby': 'titre' } },
    bar,
    scroll,
  )
  return {
    el,
    focus: head,
    start: () => {
      dispose = props.mount(zone, (value) => answer({ kind: 'content', value }))
    },
    dispose: () => dispose?.(),
  }
}

const store: Renderer<'store'> = (props: StoreProps, answer) => {
  const save = button(S.store.save, () => answer('save'), 'primary')
  return {
    el: screen(
      title(S.store.title),
      h('p', { class: 'shop', text: props.label ?? S.store.unnamed(props.id) }),
      actions(
        save,
        button(S.store.cancel, () => answer('cancel')),
      ),
    ),
    focus: save,
  }
}

const diagnostic: Renderer<'diagnostic'> = (props: DiagnosticProps, answer) => {
  const list = h('ul', { class: 'checks', attrs: { 'aria-label': S.diagnostic.list } })
  const status = h('p', { class: 'hint', text: S.diagnostic.running, attrs: { role: 'status' } })
  const area = h('textarea', {
    attrs: { readonly: '', rows: '10', 'aria-label': S.diagnostic.report },
  })
  const copy = h('button', {
    text: S.diagnostic.copy,
    class: 'primary',
    attrs: { type: 'button' },
  })
  const result = h(
    'div',
    { hidden: true },
    h('p', { class: 'hint', text: S.diagnostic.privacy }),
    area,
    copy,
  )
  copy.addEventListener('click', () => {
    void props.copy(area.value).then((done) => {
      if (!done) {
        area.focus()
        area.select()
      }
      status.textContent = done ? S.diagnostic.copied : S.diagnostic.copyFailed
    })
  })
  const close = button(S.diagnostic.close, () => answer('close'))
  const paint = (rows: readonly DiagnosticRow[]) => {
    clear(list)
    for (const row of rows) {
      append(
        list,
        h(
          'li',
          { class: `check-row ${row.tone}` },
          h('span', { class: 'badge', text: row.badge }),
          h('span', { class: 'what', text: row.label }),
          row.detail === null ? null : h('span', { class: 'hint', text: row.detail }),
        ),
      )
    }
  }
  return {
    el: screen(
      title(S.diagnostic.title),
      h('p', { text: S.diagnostic.intro }),
      list,
      status,
      result,
      actions(close),
    ),
    focus: close,
    start: () =>
      props.start({
        update: paint,
        finish: (summary, report) => {
          status.textContent = summary
          area.value = report
          result.hidden = false
        },
      }),
  }
}

const challenge: Renderer<'challenge'> = (_props: ChallengeProps, answer) => {
  const resume = button(S.challenge.resume, () => answer('resume'), 'primary')
  return {
    el: screen(
      title(S.challenge.title),
      h('p', { text: S.challenge.text }),
      actions(
        resume,
        button(S.challenge.stop, () => answer('stop')),
      ),
    ),
    focus: resume,
    sheet: true,
  }
}

/** Un bandeau sans bouton : la phrase seule, annoncée aux lecteurs d'écran (DRV-625). */
const entry: Renderer<'entry'> = (props: EntryProps) => {
  const el = screen(title(S.entry[props.stage]))
  el.setAttribute('role', 'status')
  return { el, sheet: true }
}

const error: Renderer<'error'> = (props: ErrorProps, answer) => {
  const close = button(S.error.close, () => answer('close'), props.canReturn ? 'plain' : 'primary')
  const back = button(S.error.back, () => answer('return'), 'primary')
  // Une cause qui a son propre texte (le site mobile, ticket J) remplace celui du code d'erreur.
  const texts =
    (props.cause === undefined ? undefined : own(CAUSE_TEXTS, props.cause)) ??
    ERROR_TEXTS[props.code]
  return {
    el: screen(
      title(texts.title),
      h('p', { text: texts.text }),
      actions(...(props.canReturn ? [back, close] : [close])),
    ),
  }
}

/**
 * Ce que dit l'écran de fin (DRV-622) : une phrase quand tout est fait, sinon trois au plus : ce qui s'est passé, ce qui est sauf (avec ce
 * qu'il reste à ajouter quand l'envoi s'est arrêté avant la fin) et l'action. Un arrêt voulu (`aborted`) n'est pas une panne : son code,
 * s'il y en a un, ne change rien au texte.
 */
function endText(props: EndProps): string {
  // Des produits choisis n'ont pas été pris par le panier (DRV-644) : « Tes produits sont dans ton panier » serait faux, la phrase de chaque produit suit.
  if (props.outcome === 'completed')
    return (props.unreached?.length ?? 0) > 0 ? S.end.completedSome : S.end.completed
  const code = props.outcome === 'aborted' ? undefined : props.error
  const left = props.failed + props.unavailable
  const safe = props.outcome === 'partial' && left > 0 ? S.end.safeLeft(left) : S.end.safe
  if (code !== undefined) {
    const parts = errorParts(code)
    return `${parts.happened} ${safe} ${parts.action}`
  }
  const lead =
    props.outcome === 'partial'
      ? S.end.stopped
      : props.outcome === 'error'
        ? S.end.notFinished
        : null

  return [lead, safe, S.end.resume].filter((sentence) => sentence !== null).join(' ')
}

/**
 * Le titre dit le résultat : un envoi arrêté avant que rien ne soit mis au panier ni choisi n'est pas « rempli en partie » (le texte dit « il reste
 * 6 articles à ajouter »), c'est « Le panier n'est pas rempli » : le même titre que le récapitulatif de Repas (DRV-626).
 */
function endTitle(props: EndProps): string {
  if (props.outcome === 'completed' && (props.unreached?.length ?? 0) > 0)
    return S.end.title.partial
  return props.outcome === 'partial' && props.added + props.chosen === 0
    ? S.end.notFilled
    : S.end.title[props.outcome]
}

/** Les compteurs qui existent, dans l'ordre de l'écran : jamais un zéro, jamais « Échecs » (le texte dit ce qui reste à ajouter). */
function endCounts(props: EndProps): string[] {
  return [
    props.added > 0 ? S.end.added(props.added) : null,
    props.chosen > 0 ? S.end.chosen(props.chosen) : null,
    props.haveAtHome > 0 ? S.end.haveAtHome(props.haveAtHome) : null,
    props.skipped > 0 ? S.end.skipped(props.skipped) : null,
    props.unavailable > 0 ? S.end.unavailable(props.unavailable) : null,
  ].filter((line) => line !== null)
}

const end: Renderer<'end'> = (props: EndProps, answer) => {
  const back = button(S.end.back, () => answer('return'), 'primary')
  const counts = endCounts(props)
  return {
    el: screen(
      title(endTitle(props)),
      h('p', { text: endText(props) }),
      counts.length > 0
        ? h('ul', { class: 'counts' }, ...counts.map((text) => h('li', { text })))
        : null,
      props.changes && props.changes.length > 0
        ? h(
            'div',
            { class: 'notice' },
            h('p', {}, h('strong', { text: S.end.changes.title })),
            h('p', { text: S.end.changes.text }),
            h(
              'ul',
              {},
              ...props.changes.map((change) =>
                h('li', { text: S.end.changes.item(change.name, change.planned, change.live) }),
              ),
            ),
          )
        : null,
      props.slow ? h('p', { class: 'notice', text: S.end.slow }) : null,
      props.kept && props.kept.length > 0
        ? h(
            'div',
            { class: 'notice' },
            h('p', {}, h('strong', { text: S.end.kept.title })),
            h('p', { text: S.end.kept.text }),
            h(
              'ul',
              {},
              ...props.kept.map((line) =>
                h('li', { text: S.end.kept.item(line.name, line.inCart) }),
              ),
            ),
          )
        : null,
      props.unreached && props.unreached.length > 0
        ? h(
            'div',
            { class: 'notice' },
            ...props.unreached.map((line) =>
              h('p', { text: S.end.unreached.item(line.label, S.end.unreached.why[line.reason]) }),
            ),
          )
        : null,
      props.reasons && props.reasons.length > 0
        ? h(
            'details',
            {},
            h('summary', { text: S.end.reasons.title }),
            h(
              'ul',
              {},
              ...props.reasons.map((line) =>
                h('li', {
                  text: S.end.reasons.item(
                    line.name,
                    S.end.reasons.reason[line.reason],
                    line.tried,
                  ),
                }),
              ),
            ),
          )
        : null,
      props.unreadable && props.unreadable.length > 0
        ? h(
            'div',
            { class: 'notice' },
            h('p', {}, h('strong', { text: S.end.unreadable.title })),
            h('p', { text: S.end.unreadable.text }),
            h(
              'ul',
              {},
              ...props.unreadable.map((line) =>
                h('li', { text: S.end.unreadable.item(line.name, line.atLeast) }),
              ),
            ),
          )
        : null,
      actions(back),
    ),
    focus: back,
  }
}

export const RENDERERS: { [K in ScreenName]: Renderer<K> } = {
  welcome,
  summary,
  resume,
  progress,
  quantity,
  chooser,
  store,
  diagnostic,
  challenge,
  entry,
  error,
  end,
}
