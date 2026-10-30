// @vitest-environment node
// Le choix du drive à l'envoi (DRV-710) : ce que l'écran tire du verdict du back (`selection`), en table. La règle R1 à R5 n'est PAS rejouée ici : elle est testée
// dans le back (`RetailerSelectionTest`) ; chaque cas dit le verdict reçu et vérifie ce que le web en montre.
import { describe, expect, it } from 'vitest'

import type { DriveSettings } from '@/api'
import { needsStore, sendChoice, unservedDrive } from '../sendChoice'
import { severalSettings } from './severalDrives'

const none = { picked: null, elsewhere: false }

describe('sendChoice : ce que l’écran montre du verdict du back', () => {
  it('des réglages pas encore lus : aucun drive, aucune question', () => {
    expect(sendChoice({ settings: undefined, ...none })).toEqual({
      retailer: undefined,
      tiles: [],
      named: false,
      canGoElsewhere: false,
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
      canGoElsewhere: false,
    })
  })

  it('R1, aucun drive configuré (NONE) : pas de question à l’envoi, le drive des réglages', () => {
    const settings = severalSettings({ mode: 'NONE', retailer: null, configured: [] })

    expect(sendChoice({ settings, ...none })).toMatchObject({
      retailer: 'leclerc',
      tiles: [],
      named: false,
      canGoElsewhere: false,
    })
    expect(needsStore(settings)).toBe(true)
  })

  it('R2, un seul drive configuré : il s’impose, rien à demander, rien à nommer, pas de lien', () => {
    const settings = severalSettings({ mode: 'AUTO', retailer: 'auchan', configured: ['auchan'] })

    expect(sendChoice({ settings, ...none })).toEqual({
      retailer: 'auchan',
      tiles: [],
      named: false,
      canGoElsewhere: false,
    })
    expect(needsStore(settings)).toBe(false)
  })

  it('R3, plusieurs drives et un drive habituel : il s’impose, le bouton le nomme, « Envoyer ailleurs » est proposé', () => {
    const settings = severalSettings({ mode: 'AUTO', retailer: 'auchan', habitual: 'auchan' })

    expect(sendChoice({ settings, ...none })).toEqual({
      retailer: 'auchan',
      tiles: [],
      named: true,
      canGoElsewhere: true,
    })
  })

  it('R4, plusieurs drives sans drive habituel (ASK) : une tuile par drive, la présélection du back est cochée', () => {
    const settings = severalSettings({ mode: 'ASK', retailer: 'auchan', lastUsed: 'auchan' })
    const choice = sendChoice({ settings, ...none })

    expect(choice.tiles.map((tile) => tile.id)).toEqual(['leclerc', 'auchan'])
    expect(choice).toMatchObject({ retailer: 'auchan', named: true, canGoElsewhere: false })
  })

  it('R4 : la tuile touchée l’emporte sur la présélection ; un drive qui n’est pas candidat est ignoré', () => {
    const settings = severalSettings({ mode: 'ASK', retailer: 'auchan' })

    expect(sendChoice({ settings, picked: 'leclerc', elsewhere: false }).retailer).toBe('leclerc')
    const one = severalSettings({
      mode: 'ASK',
      retailer: 'leclerc',
      configured: ['leclerc', 'auchan'],
    })
    const stale = {
      ...one,
      selection: { ...one.selection, candidates: ['leclerc'] as 'leclerc'[] },
    }
    expect(sendChoice({ settings: stale, picked: 'auchan', elsewhere: false }).tiles).toEqual([])
  })

  it('R5, un drive éteint n’est pas dans les candidats du back : il n’a pas de tuile', () => {
    // Le back ne liste que les drives allumés ET configurés : un drive éteint reste dans `retailers` mais pas dans `candidates`
    const settings = severalSettings({ mode: 'AUTO', retailer: 'leclerc', configured: ['leclerc'] })

    expect(sendChoice({ settings, picked: 'auchan', elsewhere: true })).toMatchObject({
      retailer: 'leclerc',
      tiles: [],
    })
  })

  it('« Envoyer ailleurs » : la question est posée et l’autre drive est présélectionné, pour cet envoi seulement', () => {
    const settings = severalSettings({ mode: 'AUTO', retailer: 'leclerc', habitual: 'leclerc' })
    const choice = sendChoice({ settings, picked: null, elsewhere: true })

    expect(choice).toMatchObject({ retailer: 'auchan', named: true, canGoElsewhere: false })
    expect(choice.tiles.map((tile) => tile.id)).toEqual(['leclerc', 'auchan'])
    expect(sendChoice({ settings, picked: 'leclerc', elsewhere: true }).retailer).toBe('leclerc')
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
