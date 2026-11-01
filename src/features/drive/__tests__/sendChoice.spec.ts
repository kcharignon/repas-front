// @vitest-environment node
// Le choix du drive à l'envoi (DRV-710) : ce que l'écran tire du verdict du back (`selection`), en table. La règle R1 à R5 n'est PAS rejouée ici : elle est testée
// dans le back (`RetailerSelectionTest`) ; chaque cas dit le verdict reçu et vérifie ce que le web en montre.
import { describe, expect, it } from 'vitest'

import type { DriveSettings } from '@/api'
import { candidateIds, needsStore, sendChoice, unservedDrive } from '../sendChoice'
import { severalSettings } from './severalDrives'

const none = { picked: null }

describe('candidateIds (DRV-755) : les seuls drives dont un lien peut épargner la question', () => {
  it('les drives candidats de la sélection du back, et rien d’autre', () => {
    expect(
      candidateIds(
        severalSettings({ mode: 'ASK', retailer: 'leclerc', configured: ['leclerc', 'auchan'] }),
      ),
    ).toEqual(['leclerc', 'auchan'])
    // Un drive allumé mais sans magasin n'est pas candidat
    expect(
      candidateIds(severalSettings({ mode: 'AUTO', retailer: 'leclerc', configured: ['leclerc'] })),
    ).toEqual(['leclerc'])
    expect(candidateIds(severalSettings({ mode: 'NONE', retailer: null, configured: [] }))).toEqual(
      [],
    )
  })

  it('des réglages pas encore lus, ou sans sélection : aucun candidat', () => {
    expect(candidateIds(undefined)).toEqual([])
    const settings = {
      ...severalSettings({ mode: 'ASK', retailer: 'leclerc' }),
    } as Partial<DriveSettings>
    delete settings.selection
    expect(candidateIds(settings as DriveSettings)).toEqual([])
  })
})

describe('sendChoice : ce que l’écran montre du verdict du back', () => {
  it('des réglages pas encore lus : aucun drive, aucune question', () => {
    expect(sendChoice({ settings: undefined, ...none })).toEqual({
      retailer: undefined,
      tiles: [],
      named: false,
    })
  })

  it('un back qui ne sert pas `selection` : le drive des réglages, l’écran d’avant', () => {
    const settings = {
      ...severalSettings({ mode: 'AUTO', retailer: 'leclerc' }),
    } as Partial<DriveSettings>
    delete settings.selection

    expect(sendChoice({ settings: settings as DriveSettings, ...none })).toEqual({
      retailer: 'leclerc',
      tiles: [],
      named: false,
    })
  })

  it('R1, aucun drive configuré (NONE) : pas de question à l’envoi, le drive des réglages', () => {
    const settings = severalSettings({ mode: 'NONE', retailer: null, configured: [] })

    expect(sendChoice({ settings, ...none })).toMatchObject({
      retailer: 'leclerc',
      tiles: [],
      named: false,
    })
    expect(needsStore(settings)).toBe(true)
  })

  it('R2, un seul drive configuré : il s’impose, rien à demander, rien à nommer', () => {
    const settings = severalSettings({ mode: 'AUTO', retailer: 'auchan', configured: ['auchan'] })

    expect(sendChoice({ settings, ...none })).toEqual({
      retailer: 'auchan',
      tiles: [],
      named: false,
    })
    expect(needsStore(settings)).toBe(false)
  })

  it('plusieurs drives et un drive habituel (ASK) : la question est posée, l’habituel est coché, aucun lien « Envoyer ailleurs »', () => {
    const settings = severalSettings({ mode: 'ASK', retailer: 'auchan', habitual: 'auchan' })
    const choice = sendChoice({ settings, ...none })

    expect(choice).toMatchObject({ retailer: 'auchan', named: true })
    expect(choice.tiles.map((tile) => tile.id)).toEqual(['leclerc', 'auchan'])
    expect(choice).not.toHaveProperty('canGoElsewhere')
  })

  it('R4, plusieurs drives sans drive habituel (ASK) : une tuile par drive, la présélection du back est cochée', () => {
    const settings = severalSettings({ mode: 'ASK', retailer: 'auchan', lastUsed: 'auchan' })
    const choice = sendChoice({ settings, ...none })

    expect(choice.tiles.map((tile) => tile.id)).toEqual(['leclerc', 'auchan'])
    expect(choice).toMatchObject({ retailer: 'auchan', named: true })
  })

  it('R4 : la tuile touchée l’emporte sur la présélection ; un drive qui n’est pas candidat est ignoré', () => {
    const settings = severalSettings({ mode: 'ASK', retailer: 'auchan' })

    expect(sendChoice({ settings, picked: 'leclerc' }).retailer).toBe('leclerc')
    const one = severalSettings({
      mode: 'ASK',
      retailer: 'leclerc',
      configured: ['leclerc', 'auchan'],
    })
    const stale = {
      ...one,
      selection: { ...one.selection, candidates: ['leclerc'] as 'leclerc'[] },
    }
    expect(sendChoice({ settings: stale, picked: 'auchan' }).tiles).toEqual([])
  })

  it('R5, un drive éteint n’est pas dans les candidats du back : il n’a pas de tuile', () => {
    // Le back ne liste que les drives allumés ET configurés : un drive éteint reste dans `retailers` mais pas dans `candidates`
    const settings = severalSettings({ mode: 'AUTO', retailer: 'leclerc', configured: ['leclerc'] })

    expect(sendChoice({ settings, picked: 'auchan' })).toMatchObject({
      retailer: 'leclerc',
      tiles: [],
    })
  })
})

describe('unservedDrive : l’application ne sert aucun des drives configurés', () => {
  const asking = severalSettings({ mode: 'ASK', retailer: 'auchan' })

  it('une application qui n’annonce rien sert le drive d’avant : rien à dire si ce drive est configuré', () => {
    expect(unservedDrive(asking, undefined)).toBeNull()
  })

  it('au moins un drive servi : l’écran d’envoi arbitre, le header ne bloque pas', () => {
    expect(unservedDrive(asking, ['leclerc'])).toBeNull()
    expect(unservedDrive(asking, ['auchan'])).toBeNull()
  })

  it('aucun drive servi : rend le drive désigné, pour le nommer', () => {
    expect(unservedDrive(asking, ['inconnu'])).toBe('auchan')
    const only = severalSettings({ mode: 'AUTO', retailer: 'auchan', configured: ['auchan'] })
    expect(unservedDrive(only, undefined)).toBe('auchan')
  })

  it('un seul drive, celui d’avant : jamais bloqué (le parcours d’avant)', () => {
    const settings = severalSettings({ mode: 'AUTO', retailer: 'leclerc', configured: ['leclerc'] })

    expect(unservedDrive(settings, undefined)).toBeNull()
  })
})
