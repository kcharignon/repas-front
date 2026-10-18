// Les accessoires des tests de bout en bout : un faux site neuf par test (panier, cadence et défauts à zéro) et l'agent construit une
// seule fois par processus de test.
import { test as base } from '@playwright/test'

import { startFakeLeclerc, type FakeLeclerc } from '../../fake-leclerc/server'
import { buildAgent } from '../../scripts/build.mjs'

export { expect } from '@playwright/test'

export const test = base.extend<{ fake: FakeLeclerc }, { agentCode: string }>({
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
})
