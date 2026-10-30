// Les accessoires des tests de bout en bout : un faux site neuf par test (panier, cadence et défauts à zéro) et l'agent construit une
// seule fois par processus de test. Deux faux sites : celui de Leclerc (`fake`) et celui d'Auchan (`fakeAuchan`, DRV-717), créés à la demande.
import { test as base } from '@playwright/test'

import { startFakeAuchan, type FakeAuchan } from '../../fake-auchan/server'
import { startFakeLeclerc, type FakeLeclerc } from '../../fake-leclerc/server'
import { buildAgent } from '../../scripts/build.mjs'

export { expect } from '@playwright/test'

export const test = base.extend<
  { fake: FakeLeclerc; fakeAuchan: FakeAuchan },
  { agentCode: string }
>({
  agentCode: [
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use((await buildAgent()).code)
    },
    { scope: 'worker' },
  ],
  // oxlint-disable-next-line no-empty-pattern
  fake: async ({}, use) => {
    const fake = await startFakeLeclerc()
    await use(fake)
    await fake.close()
  },
  // oxlint-disable-next-line no-empty-pattern
  fakeAuchan: async ({}, use) => {
    const fake = await startFakeAuchan()
    await use(fake)
    await fake.close()
  },
})
