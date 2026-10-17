// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 3b : le sens de `iQuantite` et des deux actions. Fixer 3, puis 2, lire la quantité obtenue, puis retirer.
// Une écriture à la fois, une confirmation avant CHAQUE écriture, jamais de boucle, arrêt immédiat sur 403/429.
import { append, clear, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { button, confirmBox, hint, labelled, resultsPanel } from '../ui/widgets'
import { CONFIRM_NOTE, describeReply } from './common'
import {
  BUSY,
  labelOf,
  lockWriting,
  pointLine,
  preflight,
  productPicker,
  sendCart,
  type CartCall,
} from './cartFlow'

export type StepKind = 'trois' | 'deux' | 'action2' | 'retrait'

/** Comment s'est passée une étape : réponse comprise, blocage 403/429, requête non comprise (404…), ou pas de réponse. */
export type StepOutcome = 'ok' | 'bloque' | 'incompris' | 'sans reponse'

export interface StepRecord {
  kind: StepKind
  action: 1 | 2
  quantity: number
  /** Code HTTP en texte, ou « sans réponse ». */
  http: string
  /** Quantité du produit au panier d'après la réponse (`iQtePanier`) ; `null` si elle ne la dit pas. */
  obtained: number | null
  /** Vrai : la quantité est déduite de l'absence du produit dans `lstProduitsLight`. */
  byAbsence: boolean
  outcome: StepOutcome
}

interface StepSpec {
  action: 1 | 2
  quantity: number
  /** Bouton qui propose l'étape. */
  offer: string
  /** Bouton de confirmation. */
  confirm: string
}

export const STEPS: Record<StepKind, StepSpec> = {
  trois: {
    action: 1,
    quantity: 3,
    offer: 'Étape 1 : fixer à 3…',
    confirm: 'Oui, fixer à 3 (action 1)',
  },
  deux: {
    action: 1,
    quantity: 2,
    offer: 'Étape 2 : fixer à 2 (action 1)…',
    confirm: 'Oui, fixer à 2 (action 1)',
  },
  action2: {
    action: 2,
    quantity: 2,
    offer: "Essayer l'action 2, quantité 2…",
    confirm: "Oui, essayer l'action 2, quantité 2",
  },
  retrait: {
    action: 2,
    quantity: 0,
    offer: 'Retirer le produit…',
    confirm: 'Oui, retirer du panier',
  },
}

/** Les étapes que l'on peut proposer ensuite. Rien après un blocage ou après le retrait. */
export function nextOffers(steps: readonly StepRecord[]): StepKind[] {
  const last = steps.at(-1)
  if (!last || last.outcome === 'bloque' || last.kind === 'retrait') return []
  if (last.outcome !== 'ok') return ['retrait']
  if (last.kind === 'trois') return ['deux', 'retrait']
  if (last.kind === 'deux' && last.obtained !== last.quantity) return ['action2', 'retrait']
  return ['retrait']
}

export function obtainedText(step: StepRecord): string {
  if (step.obtained === null) return 'non lue'
  return step.byAbsence ? `${step.obtained} (absent de lstProduitsLight)` : String(step.obtained)
}

/** Une ligne par étape, copiable : action, quantité demandée, code HTTP, quantité obtenue. */
export function stepLine(position: number, step: StepRecord): string {
  return `${position}. action ${step.action} · quantité demandée ${step.quantity} · HTTP ${step.http} · quantité obtenue ${obtainedText(step)}`
}

/** Ce que la quantité obtenue dit du sens de `iQuantite`, comparée à la quantité d'avant. */
function meaning(step: StepRecord, before: number | null): string {
  const got = step.obtained
  if (got === null) return 'quantité non lue, regarde le panier sur le site'
  if (got === step.quantity) return `iQuantite est une quantité visée : la quantité devient ${got}`
  if (got === before) return `la quantité ne baisse pas (reste ${got})`
  if (before !== null && got === before + step.quantity) {
    return `iQuantite s'ajoute (${before} + ${step.quantity} = ${got})`
  }
  return `résultat inattendu (${got})`
}

/** Ce que les quantités obtenues disent du sens de `iQuantite` et des actions. */
export function conclusions(steps: readonly StepRecord[]): string[] {
  const done = (kind: StepKind) => steps.find((s) => s.kind === kind && s.outcome === 'ok')
  const before = steps.find((s) => s.kind === 'trois')?.obtained ?? null
  const lines: string[] = []
  for (const kind of ['deux', 'action2'] as const) {
    const step = done(kind)
    if (step) {
      lines.push(`Action ${step.action}, quantité ${step.quantity} : ${meaning(step, before)}`)
    }
  }
  const out = done('retrait')
  if (out) {
    lines.push(
      out.obtained === 0
        ? 'Retrait : le produit a quitté le panier.'
        : `Retrait : quantité obtenue ${obtainedText(out)}, retire-le à la main.`,
    )
  }
  return lines
}

function outcomeOf(call: CartCall): StepOutcome {
  if (call.reply.error !== null) return 'sans reponse'
  if (call.blocked) return 'bloque'
  return call.summary?.rejected ? 'incompris' : 'ok'
}

interface Target {
  id: string
  label: string | null
}

export const quantites: Essai = {
  id: '3b',
  title: 'Quantités',
  summary: 'Fixe 3 puis 2 exemplaires, lit la quantité obtenue, retire.',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const offers = h('div', { class: 'row' })
    const confirmation = h('div')
    const id = h('input', { attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'off' } })
    let label: string | null = null
    const added = ctx.state.lastAdded
    if (added) {
      id.value = added.productId
      label = added.label
    }
    id.addEventListener('input', () => {
      label = null
    })
    const picker = productPicker(ctx, (product) => {
      id.value = product.id
      label = product.label1
    })

    const steps: StepRecord[] = []
    let session: Target | null = null

    const show = (detail: string[]): void => {
      const top = [
        ...(session ? [`Essai 3b : produit ${session.id}${labelOf(session.label)}`] : []),
        ...(steps.length === 0 ? [] : ['Étapes :', ...steps.map((s, i) => stepLine(i + 1, s))]),
        ...conclusions(steps),
        ...(steps.at(-1)?.outcome === 'bloque'
          ? ['Arrêt : si le produit est resté au panier, retire-le à la main.']
          : []),
      ]
      panel.set(detail.length > 0 && top.length > 0 ? [...top, '', ...detail] : [...top, ...detail])
    }

    const execute = async (kind: StepKind, target: Target): Promise<void> => {
      const store = ctx.store()
      if (!store) return
      clear(offers)
      clear(confirmation)
      const release = lockWriting(ctx)
      if (!release) {
        panel.add('', ...BUSY)
        return
      }
      const spec = STEPS[kind]
      try {
        show([`Étape ${steps.length + 1} : action ${spec.action}, quantité ${spec.quantity}…`])
        const call = await sendCart(ctx, store, {
          productId: target.id,
          action: spec.action,
          quantity: spec.quantity,
        })
        steps.push({
          kind,
          action: spec.action,
          quantity: spec.quantity,
          http: call.reply.error !== null ? 'sans réponse' : String(call.reply.status),
          obtained: call.summary?.obtained ?? null,
          byAbsence: call.summary?.obtainedByAbsence ?? false,
          outcome: outcomeOf(call),
        })
        if (call.summary !== null)
          ctx.state.lastAdded = { productId: target.id, label: target.label }
        show([
          describeReply(call.reply),
          ...(call.reply.error === null ? [pointLine(call.pointFrom)] : []),
          ...(call.summary?.lines ?? []),
          ...call.verdict,
        ])
        for (const next of nextOffers(steps)) {
          append(
            offers,
            button(
              STEPS[next].offer,
              () => ask(next, target),
              next === 'retrait' ? 'danger' : 'primary',
            ),
          )
        }
      } finally {
        release()
      }
    }

    /** La boîte de confirmation d'une étape ; rien n'est envoyé avant le « Oui ». */
    const ask = (kind: StepKind, target: Target, warnings: string[] = []): void => {
      const spec = STEPS[kind]
      clear(confirmation)
      confirmBox(
        confirmation,
        {
          message: [
            `Tu vas envoyer à ton VRAI panier Leclerc : action ${spec.action}, quantité ${spec.quantity}, produit ${target.id}${labelOf(target.label)}.`,
            ...warnings,
            CONFIRM_NOTE,
          ],
          confirmLabel: spec.confirm,
          danger: kind === 'retrait',
        },
        () => {
          if (kind === 'trois') {
            session = target
            id.disabled = true
            start.disabled = true
          }
          void execute(kind, target)
        },
      )
    }

    const start = button(
      "Préparer l'étape 1…",
      () => {
        if (session) {
          panel.add('', 'Essai déjà commencé : termine-le, ou reviens au menu pour recommencer.')
          return
        }
        const checked = preflight(ctx, panel, id.value)
        if (checked) ask('trois', { id: checked.id, label }, checked.warnings)
      },
      'primary',
    )

    append(
      ctx.main,
      hint(
        'À faire après un essai 3 réussi. Choisis un produit peu cher, absent de ton panier. Chaque écriture te demande une confirmation.',
      ),
      picker,
      labelled('Identifiant du produit (chiffres)', id),
      h('div', { class: 'row' }, start),
      offers,
      confirmation,
      panel.el,
    )
  },
}
