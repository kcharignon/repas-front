import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Le jour des tests : le 15 juin 2026, midi, HORS des saisons d’Halloween (15 octobre au 1er novembre, ADR 0010) et de Noël
 * (15 novembre au 5 janvier, ADR 0011). La suite ne dépend ainsi jamais du jour où on la lance. L'horloge est seulement décalée : elle continue d'avancer à son rythme (les durées
 * mesurées restent justes) et les minuteries sont réelles. Un test de saison pose sa propre date par
 * `vi.setSystemTime(new Date(2026, 9, 20))`, et un test qui fait `vi.useFakeTimers()` part de ce jour.
 */
const TEST_DAY = new Date(2026, 5, 15, 12, 0, 0).getTime()
const RealDate = Date
const offset = TEST_DAY - RealDate.now()

const ShiftedDate = new Proxy(RealDate, {
  construct: (target, args, newTarget) =>
    args.length === 0
      ? new target(target.now() + offset)
      : Reflect.construct(target, args, newTarget),
  get: (target, property, receiver) =>
    property === 'now' ? () => target.now() + offset : Reflect.get(target, property, receiver),
  apply: (target) => new target(target.now() + offset).toString(),
})

// Une sortie sans bruit : un avertissement ou une erreur de console fait échouer le test qui l'a produit
// (même règle que `make test` côté back : aucune ligne tolérée).
beforeEach(() => {
  globalThis.Date = ShiftedDate
  vi.spyOn(console, 'warn')
  vi.spyOn(console, 'error')
})

afterEach(() => {
  const noisy = [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls]
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (noisy.length > 0) {
    throw new Error(
      `Sortie de console inattendue : ${noisy.map((call) => call.join(' ')).join(' | ')}`,
    )
  }
})
