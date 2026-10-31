// @vitest-environment node
// Les touchers d'« entrer dans le magasin » d'un envoi (DRV-625, DRV-748) : un premier, et une seconde entrée seulement si le premier a eu lieu avant la connexion.
import { describe, expect, it } from 'vitest'

import { ENTRY_KEY, ENTRY_LOGIN_KEY, RunStore } from '../src/flow/run-state'
import { fakeStorage, RUN_ID } from './flow-helpers'

describe('les touchers d’entrée d’un envoi', () => {
  it('un premier toucher session ouverte : un seul, la seconde entrée n’est jamais permise', () => {
    const storage = fakeStorage()
    const runs = new RunStore(storage)

    expect(runs.markEntered(RUN_ID)).toBe(true)
    expect(runs.markEntered(RUN_ID)).toBe(false)
    expect(runs.hasEntered(RUN_ID)).toBe(true)
    expect(runs.enteredBeforeLogin(RUN_ID)).toBe(false)
    expect(runs.markEnteredAfterLogin(RUN_ID)).toBe(false)
    expect(storage.getItem(ENTRY_KEY)).toBe(RUN_ID)
    expect(storage.getItem(ENTRY_LOGIN_KEY)).toBeNull()
  })

  it('un premier toucher avant la connexion : une seule seconde entrée, jamais une troisième', () => {
    const storage = fakeStorage()
    const runs = new RunStore(storage)

    expect(runs.markEntered(RUN_ID, true)).toBe(true)
    expect(runs.enteredBeforeLogin(RUN_ID)).toBe(true)
    expect(runs.markEnteredAfterLogin(RUN_ID)).toBe(true)
    expect(runs.enteredBeforeLogin(RUN_ID)).toBe(false)
    expect(runs.markEnteredAfterLogin(RUN_ID)).toBe(false)
    expect(runs.markEntered(RUN_ID, true)).toBe(false)
  })

  it('la note d’un autre envoi ne permet rien à celui-ci', () => {
    const storage = fakeStorage({
      [ENTRY_KEY]: '11111111-2222-4333-8444-555555555555',
      [ENTRY_LOGIN_KEY]: '11111111-2222-4333-8444-555555555555:before',
    })
    const runs = new RunStore(storage)

    expect(runs.enteredBeforeLogin(RUN_ID)).toBe(false)
    expect(runs.markEnteredAfterLogin(RUN_ID)).toBe(false)
  })

  it('sans stockage, ou avec un stockage qui échoue : aucun toucher, aucune seconde entrée', () => {
    const broken = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error('interdit')
      },
      setItem: () => {
        throw new Error('interdit')
      },
      removeItem: () => {
        throw new Error('interdit')
      },
    }
    for (const runs of [new RunStore(null), new RunStore(broken)]) {
      expect(runs.markEntered(RUN_ID, true)).toBe(false)
      expect(runs.enteredBeforeLogin(RUN_ID)).toBe(false)
      expect(runs.markEnteredAfterLogin(RUN_ID)).toBe(false)
      expect(runs.hasEntered(RUN_ID)).toBe(true)
    }
  })

  it('une note de seconde entrée qui ne s’écrit pas : le premier toucher a lieu, la seconde n’aura jamais lieu', () => {
    const storage = fakeStorage()
    const failing = {
      ...storage,
      setItem: (key: string, value: string) => {
        if (key === ENTRY_LOGIN_KEY) throw new Error('plein')
        storage.setItem(key, value)
      },
    }
    const runs = new RunStore(failing)

    expect(runs.markEntered(RUN_ID, true)).toBe(true)
    expect(runs.enteredBeforeLogin(RUN_ID)).toBe(false)
    expect(runs.markEnteredAfterLogin(RUN_ID)).toBe(false)
  })
})
