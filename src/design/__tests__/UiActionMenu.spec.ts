import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import UiActionMenu, { type UiAction } from '@/design/UiActionMenu.vue'

const trigger = () =>
  document.body.querySelector<HTMLButtonElement>('button[aria-label="Plus d’actions"]')!
const menu = () => document.body.querySelector<HTMLElement>('[role="menu"]')
const items = () => [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const item = (label: string) => items().find((candidate) => candidate.textContent.trim() === label)!

const key = (target: Element, name: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))

function mountMenu(actions: Partial<UiAction>[] = []) {
  const runs = {
    rename: vi.fn<() => void>(),
    pause: vi.fn<() => void>(),
    remove: vi.fn<() => void>(),
  }
  const all: UiAction[] = [
    { key: 'rename', label: 'Renommer', run: runs.rename },
    { key: 'pause', label: 'Mettre en pause', run: runs.pause },
    { key: 'delete', label: 'Supprimer', tone: 'danger', run: runs.remove },
  ].map((action, index) => ({ ...action, ...actions[index] }) as UiAction)
  mounted = mount(UiActionMenu, {
    attachTo: document.body,
    props: { label: 'Plus d’actions', actions: all },
  })

  return { runs }
}

let mounted: ReturnType<typeof mount> | null = null

async function open() {
  trigger().click()
  await vi.waitFor(() => expect(menu()).not.toBeNull())
  // Le menu écoute les clics extérieurs au tour suivant
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
  document.body.innerHTML = ''
})

describe('UiActionMenu', () => {
  it('« ⋮ » est un bouton de 44 px qui annonce un menu fermé', () => {
    mountMenu()

    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().classList).toContain('size-11')
    expect(menu()).toBeNull()
  })

  it('s’ouvre au toucher : un menu, ses actions, la suppression en couleur de danger', async () => {
    mountMenu()

    await open()

    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(items().map((candidate) => candidate.textContent.trim())).toEqual([
      'Renommer',
      'Mettre en pause',
      'Supprimer',
    ])
    expect(item('Supprimer').classList).toContain('text-danger')
    expect(item('Renommer').classList).not.toContain('text-danger')
  })

  it('exécute l’action choisie une fois le menu fermé, focus rendu à « ⋮ »', async () => {
    const { runs } = mountMenu()
    await open()

    item('Mettre en pause').click()

    await vi.waitFor(() => expect(runs.pause).toHaveBeenCalledOnce())
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(runs.rename).not.toHaveBeenCalled()
    expect(runs.remove).not.toHaveBeenCalled()
  })

  it('ne fait rien d’une action désactivée', async () => {
    const { runs } = mountMenu([{}, { disabled: true }])
    await open()

    expect(item('Mettre en pause').getAttribute('aria-disabled')).toBe('true')
    item('Mettre en pause').click()
    await flushPromises()

    expect(runs.pause).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull()
  })

  it('au clavier : Entrée ouvre sur la première action, les flèches circulent, Échap ferme et rend le focus', async () => {
    const { runs } = mountMenu()
    trigger().focus()

    key(trigger(), 'Enter')
    await vi.waitFor(() => expect(document.activeElement).toBe(item('Renommer')))
    key(item('Renommer'), 'ArrowDown')
    await vi.waitFor(() => expect(document.activeElement).toBe(item('Mettre en pause')))
    key(item('Mettre en pause'), 'ArrowUp')
    await vi.waitFor(() => expect(document.activeElement).toBe(item('Renommer')))
    // La liste boucle : de la première, la flèche du haut mène à la dernière
    key(item('Renommer'), 'ArrowUp')
    await vi.waitFor(() => expect(document.activeElement).toBe(item('Supprimer')))

    key(item('Supprimer'), 'Escape')

    await vi.waitFor(() => expect(menu()).toBeNull())
    expect(document.activeElement).toBe(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(Object.values(runs).every((run) => run.mock.calls.length === 0)).toBe(true)
  })

  it('se ferme sur un clic ailleurs, sans rien exécuter ni reprendre le focus', async () => {
    const { runs } = mountMenu()
    const outside = document.createElement('button')
    document.body.append(outside)
    await open()

    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    outside.focus()

    await vi.waitFor(() => expect(menu()).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.activeElement).toBe(outside)
    expect(Object.values(runs).every((run) => run.mock.calls.length === 0)).toBe(true)
  })
})
