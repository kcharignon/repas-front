// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 9 : garder l'écran allumé 60 secondes (API Wake Lock).
import { WAKE_LOCK_MS } from '../config'
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { holdWakeLock, type WakeLockLike } from '../wakelock'
import { button, hint, resultsPanel } from '../ui/widgets'

export const ecran: Essai = {
  id: 9,
  title: 'Écran allumé pendant 60 secondes',
  summary: 'Écran allumé pendant 60 s.',
  render(ctx) {
    const panel = resultsPanel(ctx)
    let cancel = false
    const stop = button('Arrêter', () => {
      cancel = true
    })
    stop.disabled = true
    const go = button(
      'Garder l’écran allumé 60 s',
      () => {
        cancel = false
        go.disabled = true
        stop.disabled = false
        panel.set(['Demande du verrou d’écran…'])
        const nav = ctx.env.win.navigator as Navigator & { wakeLock?: WakeLockLike }
        void holdWakeLock(nav.wakeLock, WAKE_LOCK_MS, {
          sleep: ctx.env.sleep,
          now: ctx.env.now,
          cancelled: () => cancel,
          onTick: (remaining) =>
            panel.status(`Il reste ${Math.ceil(remaining / 1000)} s. Ne touche pas au téléphone.`),
        })
          .then((result) => {
            panel.status('')
            const seconds = Math.round(result.heldMs / 1000)
            panel.set([
              `Wake Lock disponible : ${result.available ? 'oui' : 'non'}`,
              `Verrou obtenu : ${result.obtained ? 'oui' : `non${result.error ? ` (${result.error})` : ''}`}`,
              result.obtained
                ? result.releasedEarly
                  ? `Verrou rendu par le navigateur après ${seconds} s (sur ${WAKE_LOCK_MS / 1000}) : écran non garanti.`
                  : cancel
                    ? `Arrêté par toi après ${seconds} s.`
                    : `Verrou conservé ${seconds} s sur ${WAKE_LOCK_MS / 1000}, puis rendu.`
                : 'Pas de verrou : l’écran s’éteindrait selon les réglages du téléphone.',
              "Note aussi si l'écran est resté allumé.",
            ])
          })
          .finally(() => {
            go.disabled = false
            stop.disabled = true
          })
      },
      'primary',
    )
    append(
      ctx.main,
      hint(
        "Mets la veille du téléphone sur 30 s. Ne touche à rien pendant l'essai : note si l'écran s'éteint.",
      ),
      h('div', { class: 'row' }, go, stop),
      panel.el,
    )
  },
}
