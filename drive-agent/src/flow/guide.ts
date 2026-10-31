// Le parcours guidé de la première utilisation (DRV-751). Un magasin pas encore choisi, une personne pas encore connectée : ce sont les ÉTAPES normales d'un premier
// envoi, pas des pannes. L'agent ne s'arrête pas sur un écran d'erreur : il pose une carte en bas de la page (« Étape 1 sur 2 : choisis ton magasin »), entoure dans
// la page le contrôle à toucher, attend (des lectures de la page seule, une lecture du site seulement quand la page dit que l'étape est faite) et CONTINUE TOUT SEUL.
// La page de l'enseigne peut se recharger pendant l'attente (choisir son magasin, se connecter) : la page suivante refait la même lecture et arrive au même endroit,
// sans que rien ne revienne en rouge ni en plus grand. La seule sortie est « Arrêter pour l'instant » : l'envoi s'arrête, la liste est gardée.
import type { ErrorCode } from '../../protocol'
import type { GuideStep, GuideTarget, RetailerAdapter, RetailerCause } from '../retailers'
import type { GuideProps } from '../ui'

/** Le rythme auquel l'agent relit la page pendant que la personne agit : une lecture du DOM, aucune requête. */
export const GUIDE_POLL_MS = 2_000
/** Le temps minimum entre deux lectures du SITE (une requête) : l'étape est dite faite par la page, le site peut mettre un instant à le confirmer. */
export const GUIDE_CHECK_MS = 5_000
/** Au bout de ce temps sans changement, la carte propose d'attendre encore (ou d'arrêter) : 15 minutes. */
export const GUIDE_MAX_MS = 15 * 60_000
/** Combien de lectures du site de suite peuvent contredire la page (« magasin choisi » ici, « aucun magasin » là-bas) avant que ce soit une vraie panne. */
export const GUIDE_STUCK_CHECKS = 3
/** Le temps que « C'est bon, je remplis ton panier » reste à l'écran avant l'écran de progression. */
export const GUIDE_DONE_MS = 1_500

/** Ce qui arrête un passage : le code du protocole et la vérification qui a échoué (le même type que celui de l'orchestrateur). */
export interface GuideFault {
  code: ErrorCode
  cause: RetailerCause | null
}

/**
 * L'étape que ce problème est : choisir son magasin (le site n'en voit pas et l'enseigne sait lire sur la page qu'on le choisit), ou se connecter (la page est
 * celle d'un visiteur, lue avant tout envoi). Tout autre problème est une vraie erreur : `null`.
 */
export function guideStepOf(fault: GuideFault | null, adapter: RetailerAdapter): GuideStep | null {
  if (fault === null) return null
  if (
    fault.code === 'UNSUPPORTED_PAGE' &&
    fault.cause === 'STORE_NOT_CHOSEN' &&
    adapter.storeChosenOnPage !== undefined
  ) {
    return 'store'
  }
  if (fault.code === 'NOT_LOGGED_IN' && fault.cause === 'SESSION_VISITOR') return 'login'
  return null
}

/** La page dit-elle déjà que l'étape est faite ? Une lecture de la page seule, jamais une erreur. */
export function stepLooksDone(step: GuideStep, adapter: RetailerAdapter): boolean {
  try {
    return step === 'store'
      ? adapter.storeChosenOnPage?.() === true
      : adapter.readSession().state !== 'VISITOR'
  } catch {
    return false
  }
}

/** Le contrôle à toucher pour une étape, lu dans la page par l'enseigne (jamais touché) ; `null` si elle ne le montre pas. */
export function guideTargetOf(step: GuideStep, adapter: RetailerAdapter): GuideTarget | null {
  try {
    return adapter.guideTarget?.(step) ?? null
  } catch {
    return null
  }
}

/** Ce que la carte montre d'une étape : son rang et leur nombre, le libellé du contrôle et de quoi l'entourer. */
export function guideProps(
  step: GuideStep,
  stage: 'waiting' | 'late' | 'done',
  steps: { index: number; total: number },
  adapter: RetailerAdapter,
  extra: { setup?: boolean } = {},
): GuideProps {
  const target = guideTargetOf(step, adapter)
  return {
    step,
    stage,
    index: steps.index,
    total: steps.total,
    label: target?.label ?? null,
    target: () => guideTargetOf(step, adapter)?.element ?? null,
    ...extra,
  }
}

/** Une pause réelle, ou celle d'un test. */
export type Sleep = (ms: number) => Promise<void>

export const realSleep: Sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface WatchDeps {
  now: () => number
  sleep: Sleep
}

/**
 * Attend que la page dise que l'étape est faite (`check`), ou que 15 minutes passent (`late`), tant que `watching()` reste vrai (la carte est encore là). Ne
 * relit le SITE (`check`) qu'à `GUIDE_CHECK_MS` d'écart au plus : la page peut dire « fait » avant que le site le confirme, sans le harceler.
 */
export async function watchStep(
  step: GuideStep,
  adapter: RetailerAdapter,
  deps: WatchDeps,
  state: { started: number; lastCheck: number; late: boolean },
  watching: () => boolean,
): Promise<'check' | 'late' | 'stopped'> {
  while (watching()) {
    const at = deps.now()
    if (!state.late && at - state.started >= GUIDE_MAX_MS) return 'late'
    if (stepLooksDone(step, adapter) && at - state.lastCheck >= GUIDE_CHECK_MS) return 'check'
    await deps.sleep(GUIDE_POLL_MS)
  }
  return 'stopped'
}
