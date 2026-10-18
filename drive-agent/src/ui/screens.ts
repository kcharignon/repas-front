// Les écrans : chacun reçoit ses données et un rappel `answer`, et rend ses nœuds. Aucune logique d'envoi ici.
import { append, clear, h, type Child } from './dom'
import { ERROR_TEXTS, S } from './strings'
import type {
  ChallengeProps,
  ChooserProps,
  DiagnosticProps,
  DiagnosticRow,
  EndProps,
  ErrorProps,
  PlacementProps,
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

function button(
  label: string,
  onClick: () => void,
  kind: 'plain' | 'primary' | 'danger' = 'plain',
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
  return {
    el: screen(
      title(S.summary.title),
      h('p', { text: S.summary.intro }),
      h(
        'ul',
        { class: 'counts' },
        h('li', { text: S.summary.known(props.known) }),
        h('li', { text: S.summary.new(props.new) }),
        h('li', { text: S.summary.haveAtHome(props.haveAtHome) }),
        h('li', { text: S.summary.skipped(props.skipped) }),
      ),
      h('details', {}, h('summary', { text: S.summary.list }), h('ul', {}, ...items)),
      h('p', { class: 'notice', text: `${S.summary.keepCart} ${S.summary.noOrder}` }),
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
      form,
    ),
    focus: input,
  }
}

const chooser: Renderer<'chooser'> = (props: ChooserProps, answer) => {
  const zone = h('div', { class: 'zone' })
  const bar = h(
    'div',
    { class: 'bar', attrs: { role: 'group', 'aria-label': S.chooser.group } },
    h(
      'p',
      {},
      h('strong', { text: props.ingredient, attrs: { id: 'titre' } }),
      ` (${S.chooser.counter(props.position, props.total)})`,
    ),
    actions(
      button(S.chooser.skip, () => answer({ kind: 'skip' })),
      button(S.chooser.haveAtHome, () => answer({ kind: 'have' })),
      button(S.chooser.cancel, () => answer({ kind: 'cancel' }), 'danger'),
    ),
  )
  let dispose: (() => void) | void
  const el = h(
    'section',
    { class: 'screen fill', attrs: { 'aria-labelledby': 'titre' } },
    bar,
    zone,
  )
  return {
    el,
    start: () => {
      dispose = props.mount(zone, (value) => answer({ kind: 'content', value }))
    },
    dispose: () => dispose?.(),
  }
}

/** Un choix à trois issues : un gros bouton avec, dessous, ce qu'il veut dire (le texte du bouton est l'intitulé seul). */
function choice(label: string, hint: string, id: string, onClick: () => void, kind = 'plain') {
  return h(
    'div',
    { class: 'choice' },
    h('button', {
      text: label,
      class: kind === 'plain' ? '' : kind,
      attrs: { type: 'button', 'aria-describedby': id },
      on: { click: onClick },
    }),
    h('p', { class: 'hint', text: hint, attrs: { id } }),
  )
}

const placement: Renderer<'placement'> = (props: PlacementProps, answer) => {
  return {
    el: screen(
      title(S.placement.title(props.productLabel)),
      h('p', { text: S.placement.text(props.ingredient) }),
      choice(
        S.placement.primary,
        S.placement.primaryHint,
        'aide-prefere',
        () => answer('PRIMARY'),
        'primary',
      ),
      choice(S.placement.fallback, S.placement.fallbackHint, 'aide-secours', () =>
        answer('FALLBACK'),
      ),
      choice(S.placement.once, S.placement.onceHint, 'aide-une-fois', () => answer('ONCE')),
      actions(button(S.placement.back, () => answer(null))),
    ),
  }
}

const store: Renderer<'store'> = (props: StoreProps, answer) => {
  const save = button(S.store.save, () => answer('save'), 'primary')
  return {
    el: screen(
      title(S.store.title),
      h('p', { text: S.store.text(props.label ?? S.store.unnamed(props.id)) }),
      h('p', { class: 'hint', text: S.store.notice }),
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
      h('p', { class: 'hint', text: S.challenge.reload }),
      actions(
        resume,
        button(S.challenge.stop, () => answer('stop')),
      ),
    ),
    focus: resume,
    sheet: true,
  }
}

const error: Renderer<'error'> = (props: ErrorProps, answer) => {
  const close = button(S.error.close, () => answer('close'), props.canReturn ? 'plain' : 'primary')
  const back = button(S.error.back, () => answer('return'), 'primary')
  return {
    el: screen(
      title(ERROR_TEXTS[props.code].title),
      h('p', { text: ERROR_TEXTS[props.code].text }),
      actions(...(props.canReturn ? [back, close] : [close])),
    ),
  }
}

const end: Renderer<'end'> = (props: EndProps, answer) => {
  const back = button(S.end.back, () => answer('return'), 'primary')
  const hint =
    props.error !== undefined
      ? h('p', { class: 'notice', text: ERROR_TEXTS[props.error].text })
      : props.outcome === 'completed'
        ? h('p', { class: 'hint', text: S.end.completedHint })
        : null
  return {
    el: screen(
      title(S.end.title[props.outcome]),
      hint,
      h(
        'ul',
        { class: 'counts' },
        h('li', { text: S.end.added(props.added) }),
        h('li', { text: S.end.chosen(props.chosen) }),
        h('li', { text: S.end.haveAtHome(props.haveAtHome) }),
        h('li', { text: S.end.skipped(props.skipped) }),
        h('li', { text: S.end.unavailable(props.unavailable) }),
        h('li', { text: S.end.failed(props.failed) }),
      ),
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
  placement,
  store,
  diagnostic,
  challenge,
  error,
  end,
}
