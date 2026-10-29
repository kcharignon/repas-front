import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // Un worker par cœur (Vitest en laisse un de côté par défaut) : mesuré 13 % plus court sur 4 cœurs, comme le runner de la CI.
      maxWorkers: availableParallelism(),
      exclude: [...configDefaults.exclude, 'e2e/**', 'drive-agent/e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: ['./src/__tests__/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,vue}', 'drive-agent/src/**/*.ts', 'drive-agent/protocol/**/*.ts'],
        exclude: [
          'src/main.ts',
          'src/pwa.ts',
          'src/**/__tests__/**',
          'src/api/schema.d.ts',
          // Agent du drive : son point d'entrée ne fait qu'appeler le code testé (le fichier construit est éprouvé par build.spec.ts).
          'drive-agent/src/index.ts',
        ],
        reporter: ['text-summary', 'lcov'],
        // Le seuil ne baisse jamais ; on le remonte quand la mesure le permet (cliquet, comme côté back). Mesure du 2026-10-29 : lignes 97,8, fonctions 96,2, branches 91,4, instructions 96,6 ; la marge est de 1 à 2 points.
        thresholds: { lines: 96, functions: 94, branches: 89, statements: 95 },
      },
    },
  }),
)
