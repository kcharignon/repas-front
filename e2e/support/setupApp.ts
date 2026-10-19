// Un faux pont natif de l'application Repas pour les écrans qui lisent le magasin (DRV-320, DRV-623), partagé par les tests de bout en bout.
import type { Page } from '@playwright/test'

/**
 * Un faux pont natif qui joue l'application : il répond à `drive.setup` comme elle (après l'aller-retour dans le drive) par le
 * résultat de l'agent donné, et garde ce que la page envoie dans `window.__sent`.
 */
export async function fakeAppForSetup(
  page: Page,
  answer: 'found' | 'aborted' | 'busy' | 'unsupported',
) {
  await page.addInitScript((answer) => {
    const listeners: ((event: { data: unknown }) => void)[] = []
    const win = window as unknown as { __sent: { type: string; runId?: string }[] }
    win.__sent = []
    const emit = (message: unknown, delay: number) =>
      setTimeout(
        () => listeners.forEach((listener) => listener({ data: JSON.stringify(message) })),
        delay,
      )
    Object.assign(window, {
      repasNative: {
        postMessage: (text: string) => {
          const message = JSON.parse(text) as { type: string; runId?: string }
          win.__sent.push(message)
          if (message.type === 'app.info')
            emit({ v: 1, type: 'app.info', version: '0.5.0', versionCode: 5, drive: true }, 0)
          if (message.type !== 'drive.setup') return
          const head = { v: 1, runId: message.runId, agentVersion: '1.0.0' }
          if (answer === 'busy') emit({ v: 1, type: 'drive.error', code: 'BUSY', runId: null }, 50)
          else if (answer === 'found')
            emit(
              {
                v: 1,
                type: 'drive.result',
                result: {
                  ...head,
                  type: 'setup-result',
                  store: {
                    id: '654321',
                    host: 'exemple.leclercdrive.fr',
                    baseUrl: 'https://exemple.leclercdrive.fr/magasin-654321-654321',
                    label: null,
                  },
                },
              },
              150,
            )
          else
            emit(
              {
                v: 1,
                type: 'drive.result',
                result: {
                  ...head,
                  type: 'result',
                  lines: [],
                  ...(answer === 'aborted'
                    ? { outcome: 'aborted', error: { code: 'CANCELLED', message: 'Abandonné' } }
                    : { outcome: 'error', error: { code: 'UNSUPPORTED_PAGE', message: 'Page' } }),
                },
              },
              150,
            )
        },
        addEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
          void listeners.push(listener),
      },
    })
  }, answer)
}
