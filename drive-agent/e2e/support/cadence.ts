// La politesse de l'agent, jugée par le faux site : jamais deux requêtes en parallèle, 800 ms au moins entre deux, aucune requête
// refusée pour une forme inexacte. Un test qui appelle `expectPoliteAgent` échoue si l'agent en envoie deux à la fois ou trop vite.
import { expect } from '@playwright/test'

import { MIN_GAP_MS, type FakeLeclerc } from '../../fake-leclerc/server'

/** Les délais (ms) entre la fin d'une requête et le début de la suivante, recomptés ici en plus du contrôle du serveur. */
export function gapsBetween(fake: FakeLeclerc): number[] {
  const calls = fake.paced()
  return calls.slice(1).map((call, index) => call.startedAt - (calls[index]?.endedAt ?? 0))
}

export function expectPoliteAgent(fake: FakeLeclerc): void {
  expect(fake.violations(), 'jamais en parallèle, jamais plus vite que la cadence').toEqual([])
  expect(
    Math.min(...gapsBetween(fake)),
    'délai minimal entre deux requêtes (ms)',
  ).toBeGreaterThanOrEqual(MIN_GAP_MS - 5)
  expect(
    fake.paced().filter((call) => call.rejected),
    'requêtes refusées par le faux site pour une forme inexacte',
  ).toEqual([])
}

/** Laisse passer le temps qu'un utilisateur met à cliquer après un rechargement : le temps écoulé depuis la dernière requête dépasse `ms`. */
export async function waitForQuiet(fake: FakeLeclerc, ms = MIN_GAP_MS + 200): Promise<void> {
  await expect
    .poll(() => performance.now() - (fake.paced().at(-1)?.endedAt ?? 0), {
      message: 'silence après la dernière requête',
    })
    .toBeGreaterThan(ms)
}
