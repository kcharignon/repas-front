// @vitest-environment node
// Une requête hors de l'hôte de la page (DRV-754 : le serveur du magasin, depuis `m-courses`) envoie la SESSION à un autre hôte : le `Pacer` ne l'accepte que si l'enseigne le
// reconnaît elle-même (`PacerDeps.allowsOrigin`) ET que l'adresse est bien formée. Chaque cas ci-dessous doit être refusé AVANT tout `fetch` ; si le garde est neutralisé
// (`assertOrigin` qui ne fait rien), ces tests échouent.
import { describe, expect, it } from 'vitest'

import { Pacer } from '../src/retailers/pacer'

const ALLOWED = 'https://fd8-courses.leclercdrive.fr'

function pacer() {
  const calls: { url: string; init: RequestInit }[] = []
  const instance = new Pacer(
    (url, init = {}) => {
      calls.push({ url, init })
      return Promise.resolve({
        status: 200,
        url,
        redirected: false,
        headers: new Headers(),
        text: () => Promise.resolve('ok'),
      } as unknown as Response)
    },
    {
      sleep: () => Promise.resolve(),
      random: () => 0,
      now: () => 0,
      allowsOrigin: (origin) => origin === ALLOWED,
    },
    { pauseMs: 0, jitterMs: 0, maxPauseMs: 0, timeoutMessage: 'lent' },
  )
  return { instance, calls }
}

describe('Pacer : une requête vers un autre hôte que celui de la page', () => {
  it('part vers l’hôte que l’enseigne reconnaît, avec la session (credentials include)', async () => {
    const { instance, calls } = pacer()

    await instance.request(
      `${ALLOWED}/magasin-1-1/recherche-ajax.aspx?x=1`,
      { method: 'POST' },
      ALLOWED,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.init).toMatchObject({ method: 'POST', credentials: 'include' })
  })

  it('sans origine, une adresse absolue est refusée (l’hôte de la page seul, session du même site)', async () => {
    const { instance, calls } = pacer()

    await expect(instance.request(`${ALLOWED}/x`, {})).rejects.toThrow(
      'Une requête ne part que vers',
    )
    await expect(instance.request('/x', {})).resolves.toMatchObject({ status: 200 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init).toMatchObject({ credentials: 'same-origin' })
  })

  it.each([
    ['un autre hôte', 'https://autre.leclercdrive.fr', 'https://autre.leclercdrive.fr/x'],
    [
      'un hôte voisin',
      'https://fd8-courses.leclercdrive.fr.attaquant.fr',
      'https://fd8-courses.leclercdrive.fr.attaquant.fr/x',
    ],
    [
      'un préfixe',
      'https://evil-fd8-courses.leclercdrive.fr',
      'https://evil-fd8-courses.leclercdrive.fr/x',
    ],
    [
      'des majuscules',
      'https://FD8-courses.leclercdrive.fr',
      'https://FD8-courses.leclercdrive.fr/x',
    ],
    [
      'un point final',
      'https://fd8-courses.leclercdrive.fr.',
      'https://fd8-courses.leclercdrive.fr./x',
    ],
    [
      'http au lieu de https',
      'http://fd8-courses.leclercdrive.fr',
      'http://fd8-courses.leclercdrive.fr/x',
    ],
    [
      'un port',
      'https://fd8-courses.leclercdrive.fr:444',
      'https://fd8-courses.leclercdrive.fr:444/x',
    ],
    [
      'un identifiant',
      'https://moi@fd8-courses.leclercdrive.fr',
      'https://moi@fd8-courses.leclercdrive.fr/x',
    ],
    ['une origine qui porte un chemin', `${ALLOWED}/x`, `${ALLOWED}/x/y`],
    ['une adresse d’un autre hôte que l’origine', ALLOWED, 'https://autre.leclercdrive.fr/x'],
    ['une adresse relative avec une origine', ALLOWED, '/x'],
    ['deux barres obliques', ALLOWED, `${ALLOWED}//autre.fr/x`],
    ['une barre oblique inverse', ALLOWED, `${ALLOWED}/\\autre.fr`],
    ['un arobase', ALLOWED, `${ALLOWED}/x@autre.fr`],
    ['un espace', ALLOWED, `${ALLOWED}/x y`],
    ['une tabulation', ALLOWED, `${ALLOWED}/x\ty`],
    ['une origine vide', '', '/x'],
  ])('refuse %s, sans aucune requête', async (_name, origin, url) => {
    const { instance, calls } = pacer()

    await expect(instance.request(url, {}, origin)).rejects.toThrow(
      'Une requête ne part que vers l’hôte de la page ou son serveur.',
    )
    expect(calls).toEqual([])
  })

  it('sans prédicat de l’enseigne, aucune origine n’est permise, même bien formée', async () => {
    const calls: string[] = []
    const instance = new Pacer(
      (url) => {
        calls.push(url)
        return Promise.reject(new Error('jamais'))
      },
      { sleep: () => Promise.resolve(), random: () => 0, now: () => 0 },
      { pauseMs: 0, jitterMs: 0, maxPauseMs: 0, timeoutMessage: 'lent' },
    )

    await expect(instance.request(`${ALLOWED}/x`, {}, ALLOWED)).rejects.toThrow(
      'Une requête ne part que vers',
    )
    expect(calls).toEqual([])
  })
})
