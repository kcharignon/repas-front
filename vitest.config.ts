import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: ['./src/__tests__/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,vue}', 'drive-agent/lab/src/**/*.ts'],
        exclude: [
          'src/main.ts',
          'src/pwa.ts',
          'src/**/__tests__/**',
          'src/api/schema.d.ts',
          // Banc d'essai du favori (outil jetable) : son point d'entrée ne fait qu'appeler le code testé.
          'drive-agent/lab/src/main.ts',
          'drive-agent/lab/src/__tests__/**',
        ],
        reporter: ['text-summary', 'lcov'],
        // Le seuil ne baisse jamais ; on le remonte quand la mesure le permet (cliquet, comme côté back).
        thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  }),
)
